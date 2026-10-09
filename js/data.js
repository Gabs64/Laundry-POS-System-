/**
 * POS System - Data & Storage Management
 * Supports Client-Side instant caching + Seamless Server-Side REST API Persistence for Railway Volumes.
 * Enables real-time multi-device sync between Cashier terminals and Admin dashboards.
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
      isMaster: true,
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  sales: [],
  inventoryLogs: [],
  attendance: []
};

const STORAGE_KEY = "CLEAN_POS_SYSTEM_DATA_V1";
const LAST_SYNC_KEY = "POS_SERVER_LAST_SYNC_TS";
const RAILWAY_BACKEND_URL = "https://web-production-93c73.up.railway.app";

function getApiUrl(endpoint) {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // When running directly on Railway or local node server, use relative path
    if (host.includes("railway.app") || host === "localhost" || host === "127.0.0.1") {
      return endpoint;
    }
  }
  // When running on Vercel (e.g. kuan-laundry-pos.vercel.app) or any static host, route directly to Railway backend
  return `${RAILWAY_BACKEND_URL}${endpoint}`;
}

if (typeof window !== "undefined") {
  window.getApiUrl = getApiUrl;
}

/**
 * Storage Manager Module
 */
const StorageManager = {
  _isSyncing: false,
  _syncIntervalId: null,

  init() {
    this.fetchFromServer();
    this.startAutoSync();
  },

  get() {
    try {
      let stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return JSON.parse(JSON.stringify(SEED_DATA));
      }
      const parsed = JSON.parse(stored);
      if (!parsed.settings) parsed.settings = { ...SEED_DATA.settings };
      if (!Array.isArray(parsed.products)) parsed.products = [];
      if (!Array.isArray(parsed.categories)) parsed.categories = [];
      if (!Array.isArray(parsed.sales)) parsed.sales = [];
      if (!Array.isArray(parsed.inventoryLogs)) parsed.inventoryLogs = [];
      if (!Array.isArray(parsed.attendance)) parsed.attendance = [];
      
      // Ensure master admin account is permanently preserved
      if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
        parsed.users = [...SEED_DATA.users];
      } else {
        const hasAdmin = parsed.users.some(u => u.isMaster || u.id === "usr-admin" || u.role === "ADMIN");
        if (!hasAdmin) {
          parsed.users.unshift({ ...SEED_DATA.users[0] });
        }
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
      localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());

      // Send to server backend asynchronously
      this.pushToServer(data);
      return true;
    } catch (e) {
      console.error("Storage save error:", e);
      return false;
    }
  },

  async pushToServer(data) {
    const res = await fetch(getApiUrl("/api/data"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to write data to server database.");
    }
    const result = await res.json().catch(() => ({}));
    if (result.lastUpdated) {
      localStorage.setItem(LAST_SYNC_KEY, result.lastUpdated.toString());
    }
  },

  async fetchFromServer(forceRefresh = false) {
    if (this._isSyncing) return;
    this._isSyncing = true;

    try {
      const res = await fetch(getApiUrl("/api/data"));
      if (!res.ok) throw new Error("Server database error " + res.status);

      const result = await res.json();
      if (result.success && result.data) {
        const localData = localStorage.getItem(STORAGE_KEY);
        const serverJson = JSON.stringify(result.data);

        // Update local cache directly from server source of truth
        if (forceRefresh || localData !== serverJson) {
          localStorage.setItem(STORAGE_KEY, serverJson);
          if (result.lastUpdated) {
            localStorage.setItem(LAST_SYNC_KEY, result.lastUpdated.toString());
          }

          // Notify all active page components that new database data arrived
          window.dispatchEvent(new CustomEvent("pos-data-synced", { detail: result.data }));
        }
      }
    } catch (err) {
      console.warn("Server sync check:", err.message);
    } finally {
      this._isSyncing = false;
    }
  },

  startAutoSync() {
    if (this._syncIntervalId) return;

    // Check server every 5 seconds for updates made from other devices
    this._syncIntervalId = setInterval(() => {
      this.fetchFromServer();
    }, 5000);

    // Also sync immediately when user switches tabs/focuses back to window
    window.addEventListener("focus", () => {
      this.fetchFromServer();
    });
  },

  async resetToDefault() {
    const res = await fetch(getApiUrl("/api/reset"), { method: "POST" });
    if (!res.ok) {
      throw new Error("Failed to reset database on server.");
    }
    const result = await res.json();
    if (result.data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
      return result.data;
    }
    return JSON.parse(JSON.stringify(SEED_DATA));
  },

  async addUser(userData) {
    const res = await fetch(getApiUrl("/api/users"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Failed to save user to server database.");
    }
    const currentData = this.get();
    currentData.users = result.users || [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
    return result.user;
  },

  async updateUser(userId, updates) {
    const res = await fetch(getApiUrl(`/api/users/${encodeURIComponent(userId)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Failed to update user in server database.");
    }
    const currentData = this.get();
    currentData.users = result.users || [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
    return result.user;
  },

  async deleteUser(userId) {
    const res = await fetch(getApiUrl(`/api/users/${encodeURIComponent(userId)}`), {
      method: "DELETE"
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Failed to delete user from server database.");
    }
    const currentData = this.get();
    currentData.users = result.users || [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
    return true;
  },

  async sendHeartbeat(userId, sessionId) {
    if (!userId || !sessionId) return { success: false };
    try {
      const res = await fetch(getApiUrl("/api/auth/heartbeat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sessionId })
      });
      return await res.json().catch(() => ({ success: false }));
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async logoutSession(userId, sessionId) {
    if (!userId) return { success: true };
    try {
      const currentData = this.get();
      if (Array.isArray(currentData.users)) {
        const u = currentData.users.find(x => x.id === userId || x.username === userId);
        if (u) {
          u.activeSessionId = null;
          u.lastHeartbeat = null;
          u.isOnline = false;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
        }
      }
    } catch (e) {}

    try {
      const res = await fetch(getApiUrl("/api/auth/logout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sessionId })
      });
      return await res.json().catch(() => ({ success: true }));
    } catch (e) {
      return { success: true };
    }
  },

  async forceDisconnectUser(targetUserId) {
    const res = await fetch(getApiUrl("/api/auth/force-logout"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Failed to disconnect user session.");
    }
    const currentData = this.get();
    if (result.users) {
      currentData.users = result.users;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
    }
    return result;
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

// Initialize server sync automatically on page load
if (typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    StorageManager.init();
  });
}

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
    if (!user || !user.id || user.role === "ADMIN") return null;
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
        existing.timedOutByAdmin = false;
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
      timedOutByAdmin: false,
      notes: "Auto Time-In on login"
    };

    data.attendance.unshift(newRecord);
    StorageManager.save(data);
    localStorage.setItem("POS_ACTIVE_ATTENDANCE_ID", newRecord.id);
    return newRecord;
  },

  recordTimeOut(user) {
    if (!user || !user.id || user.role === "ADMIN") return null;
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
