/**
 * POS System - Data & Storage Management
 * Clean Production Schema for Railway deployment.
 * Owner starts with a completely clean database (products, sales, categories, logs, attendance).
 */

const SEED_DATA = {
  settings: {
    storeName: "POS System",
    tagline: "Professional Laundry & POS Management",
    currency: "₱",
    address: "",
    contact: "",
    taxRate: 0,
    defaultLowStockThreshold: 10,
    claimPrefix: "LND-",
    defaultTurnaroundHours: 24,
    receiptFooter: "Thank you for your business! Please present this Claim Stub upon pickup."
  },

  categories: [],

  products: [],

  users: [
    {
      id: "usr-admin",
      fullName: "Administrator",
      username: "admin",
      password: "admin123",
      role: "ADMIN",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ],

  sales: [],

  inventoryLogs: [],

  attendance: []
};

const STORAGE_KEY = "CLEAN_POS_SYSTEM_DATA_V1";

/**
 * Storage Manager Module
 */
const StorageManager = {
  get() {
    try {
      let stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        this.save(SEED_DATA);
        return JSON.parse(JSON.stringify(SEED_DATA));
      }
      const parsed = JSON.parse(stored);
      if (!parsed.settings) parsed.settings = { ...SEED_DATA.settings };
      if (!Array.isArray(parsed.products)) parsed.products = [];
      if (!Array.isArray(parsed.categories)) parsed.categories = [];
      if (!Array.isArray(parsed.sales)) parsed.sales = [];
      if (!Array.isArray(parsed.inventoryLogs)) parsed.inventoryLogs = [];
      if (!Array.isArray(parsed.attendance)) parsed.attendance = [];
      if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
        parsed.users = [...SEED_DATA.users];
      }

      return parsed;
    } catch (e) {
      console.error("Storage load error:", e);
      return JSON.parse(JSON.stringify(SEED_DATA));
    }
  },

  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("Storage save error:", e);
      return false;
    }
  },

  resetToDefault() {
    this.save(SEED_DATA);
    return JSON.parse(JSON.stringify(SEED_DATA));
  },

  exportJSON() {
    const data = this.get();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `pos_backup_${timestamp}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  },

  importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.products || !parsed.users) {
        throw new Error("Invalid backup format.");
      }
      this.save(parsed);
      return true;
    } catch (e) {
      console.error("Failed to import JSON backup:", e);
      return false;
    }
  }
};

/**
 * Attendance Manager Module
 * Automatically handles Time-In upon staff login and Time-Out upon logout/session end.
 */
const AttendanceManager = {
  getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  formatDuration(minutes) {
    if (isNaN(minutes) || minutes < 0) return "--";
    if (minutes === 0) return "< 1m";
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs === 0) return `${mins}m`;
    return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  },

  recordTimeIn(user) {
    if (!user || !user.id) return null;
    const data = StorageManager.get();
    if (!data.attendance) data.attendance = [];

    const todayStr = this.getLocalDateString();
    const nowIso = new Date().toISOString();

    // Check if there is an existing CLOCKED_IN record for this user
    let existing = data.attendance.find(a => a.userId === user.id && a.status === "CLOCKED_IN");

    if (existing) {
      // If the clock-in was from an earlier day, close it out first
      if (existing.date !== todayStr) {
        existing.status = "COMPLETED";
        existing.timeOut = existing.timeOut || nowIso;
        const diffMs = new Date(existing.timeOut) - new Date(existing.timeIn);
        existing.totalMinutes = Math.max(1, Math.round(diffMs / 60000));
        existing.totalHoursFormatted = this.formatDuration(existing.totalMinutes);
      } else {
        // Already clocked in today for this session
        localStorage.setItem("POS_ACTIVE_ATTENDANCE_ID", existing.id);
        StorageManager.save(data);
        return existing;
      }
    }

    // Create a new Time-In record
    const newRecord = {
      id: "att-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      userId: user.id,
      userName: user.fullName || user.username,
      userRole: user.role || "STAFF",
      date: todayStr,
      timeIn: nowIso,
      timeOut: null,
      totalMinutes: 0,
      totalHoursFormatted: "--",
      status: "CLOCKED_IN",
      notes: "Auto Time-In on login"
    };

    data.attendance.unshift(newRecord);
    StorageManager.save(data);
    localStorage.setItem("POS_ACTIVE_ATTENDANCE_ID", newRecord.id);
    return newRecord;
  },

  recordTimeOut(user) {
    if (!user || !user.id) return null;
    const data = StorageManager.get();
    if (!data.attendance) return null;

    const activeId = localStorage.getItem("POS_ACTIVE_ATTENDANCE_ID");
    const nowIso = new Date().toISOString();

    // Find active record by ID or by userId with CLOCKED_IN status
    let record = null;
    if (activeId) {
      record = data.attendance.find(a => a.id === activeId);
    }
    if (!record) {
      record = data.attendance.find(a => a.userId === user.id && a.status === "CLOCKED_IN");
    }

    if (record) {
      record.timeOut = nowIso;
      record.status = "COMPLETED";
      const diffMs = new Date(nowIso) - new Date(record.timeIn);
      const diffMins = Math.max(1, Math.round(diffMs / 60000));
      record.totalMinutes = diffMins;
      record.totalHoursFormatted = this.formatDuration(diffMins);

      StorageManager.save(data);
      localStorage.removeItem("POS_ACTIVE_ATTENDANCE_ID");
      return record;
    }

    return null;
  },

  getActiveRecord(userId) {
    const data = StorageManager.get();
    if (!data.attendance) return null;
    return data.attendance.find(a => a.userId === userId && a.status === "CLOCKED_IN") || null;
  },

  getAllRecords() {
    const data = StorageManager.get();
    return data.attendance || [];
  },

  saveRecord(record) {
    const data = StorageManager.get();
    if (!data.attendance) data.attendance = [];

    if (record.timeIn && record.timeOut) {
      const diffMs = new Date(record.timeOut) - new Date(record.timeIn);
      record.totalMinutes = Math.max(1, Math.round(diffMs / 60000));
      record.totalHoursFormatted = this.formatDuration(record.totalMinutes);
      record.status = "COMPLETED";
    } else if (record.timeIn && !record.timeOut) {
      record.status = "CLOCKED_IN";
      record.totalMinutes = 0;
      record.totalHoursFormatted = "--";
    }

    const idx = data.attendance.findIndex(a => a.id === record.id);
    if (idx > -1) {
      data.attendance[idx] = record;
    } else {
      if (!record.id) {
        record.id = "att-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4);
      }
      data.attendance.unshift(record);
    }
    StorageManager.save(data);
    return record;
  },

  deleteRecord(id) {
    const data = StorageManager.get();
    if (!data.attendance) return false;
    data.attendance = data.attendance.filter(a => a.id !== id);
    StorageManager.save(data);
    return true;
  }
};
