/**
 * MY STORE POS - Core Application Coordinator
 * Handles authentication, view routing, modals, toasts, keyboard shortcuts, live clock, and theme management.
 */

const App = {
  currentUser: null,
  confirmCallback: null,

  init() {
    Sound.init();
    this.initTheme();
    this.startLiveClock();
    this.setupAuth();
    this.setupShortcuts();
    this.updateBrandDisplay();

    // Check existing session
    const savedUser = sessionStorage.getItem("POS_ACTIVE_USER");
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
        this.routeUserToRole();
      } catch (e) {
        this.showLogin();
      }
    } else {
      this.showLogin();
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  },

  getCurrentUser() {
    return this.currentUser;
  },

  updateBrandDisplay() {
    const data = StorageManager.get();
    const storeName = data.settings?.storeName || "MY STORE POS";

    const loginStore = document.getElementById("login-store-name");
    const posStore = document.getElementById("pos-store-name");
    const adminStore = document.getElementById("admin-store-name");

    if (loginStore) loginStore.textContent = storeName;
    if (posStore) posStore.textContent = storeName;
    if (adminStore) adminStore.textContent = storeName;
  },

  /* =========================================================
     AUTHENTICATION & ROLES
     ========================================================= */
  setupAuth() {
    const form = document.getElementById("login-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("login-username").value.trim().toLowerCase();
        const password = document.getElementById("login-password").value;
        this.login(username, password);
      });
    }
  },

  login(username, password) {
    const data = StorageManager.get();
    const users = data.users || [];
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (!user) {
      Sound.playError();
      this.showToast("Invalid username or password.", "danger");
      return;
    }

    if (user.status === "disabled") {
      Sound.playError();
      this.showToast("This user account is currently disabled. Contact Admin.", "danger");
      return;
    }

    this.currentUser = user;
    sessionStorage.setItem("POS_ACTIVE_USER", JSON.stringify(user));
    Sound.playSuccess();
    this.showToast(`Welcome back, ${user.fullName}!`, "success");

    this.routeUserToRole();
  },

  quickLogin(username, password) {
    document.getElementById("login-username").value = username;
    document.getElementById("login-password").value = password;
    this.login(username, password);
  },

  routeUserToRole() {
    if (!this.currentUser) return this.showLogin();

    this.updateUserHeader();

    if (this.currentUser.role === "ADMIN") {
      this.showAdmin();
    } else {
      this.showCashier();
    }
  },

  updateUserHeader() {
    if (!this.currentUser) return;
    const u = this.currentUser;
    const initials = u.fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

    // POS Header
    const posAvatar = document.getElementById("pos-user-avatar");
    const posName = document.getElementById("pos-user-name");
    const posRole = document.getElementById("pos-user-role");
    const adminSwitchBtn = document.getElementById("btn-switch-to-admin");

    if (posAvatar) posAvatar.textContent = initials;
    if (posName) posName.textContent = u.fullName;
    if (posRole) posRole.textContent = u.role;
    if (adminSwitchBtn) {
      adminSwitchBtn.style.display = u.role === "ADMIN" ? "inline-flex" : "none";
    }

    // Admin Topbar
    const adminAvatar = document.getElementById("admin-user-avatar");
    const adminName = document.getElementById("admin-user-name");

    if (adminAvatar) adminAvatar.textContent = initials;
    if (adminName) adminName.textContent = u.fullName;
  },

  showLogin() {
    this.currentUser = null;
    sessionStorage.removeItem("POS_ACTIVE_USER");
    this.switchView("login-view");
    document.getElementById("login-password").value = "";
  },

  showCashier() {
    this.switchView("cashier-view");
    CashierPOS.init();
  },

  showAdmin() {
    this.switchView("admin-view");
    AdminPanel.init();
    AdminPanel.switchTab("dashboard");
  },

  switchToAdmin() {
    if (this.currentUser?.role === "ADMIN") {
      this.showAdmin();
    } else {
      this.showToast("Admin privileges required.", "danger");
    }
  },

  switchToCashier() {
    this.showCashier();
  },

  confirmLogout() {
    this.showConfirmModal(
      "Sign Out of POS?",
      "Are you sure you want to end your current session and logout?",
      () => {
        this.showLogin();
        this.showToast("You have been signed out.", "info");
      }
    );
  },

  switchView(viewId) {
    document.querySelectorAll(".view-screen").forEach(screen => {
      screen.classList.remove("active");
    });
    const target = document.getElementById(viewId);
    if (target) target.classList.add("active");

    if (window.lucide) lucide.createIcons();
  },

  /* =========================================================
     LIVE CLOCK
     ========================================================= */
  startLiveClock() {
    const update = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) + " • " + now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const clockPos = document.getElementById("clock-display");
      const clockAdmin = document.getElementById("admin-clock-display");

      if (clockPos) clockPos.textContent = formatted;
      if (clockAdmin) clockAdmin.textContent = formatted;
    };

    update();
    setInterval(update, 1000);
  },

  /* =========================================================
     THEME MANAGEMENT
     ========================================================= */
  initTheme() {
    const saved = localStorage.getItem("POS_THEME") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    this.updateThemeIcons(saved);
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("POS_THEME", next);
    this.updateThemeIcons(next);
    this.showToast(`Switched to ${next} mode`, "info");
  },

  updateThemeIcons(theme) {
    const iconName = theme === "dark" ? "sun" : "moon";
    const icon1 = document.getElementById("theme-icon");
    const icon2 = document.getElementById("admin-theme-icon");
    if (icon1) icon1.setAttribute("data-lucide", iconName);
    if (icon2) icon2.setAttribute("data-lucide", iconName);
    if (window.lucide) lucide.createIcons();
  },

  /* =========================================================
     CONFIRMATION DIALOG MODAL
     ========================================================= */
  showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById("modal-confirm");
    const titleEl = document.getElementById("confirm-title");
    const msgEl = document.getElementById("confirm-message");
    const okBtn = document.getElementById("btn-confirm-ok");
    const cancelBtn = document.getElementById("btn-confirm-cancel");

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    const close = () => {
      modal.classList.remove("active");
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
      close();
      if (typeof onConfirm === "function") onConfirm();
    };

    cancelBtn.onclick = () => {
      close();
    };

    modal.classList.add("active");
  },

  /* =========================================================
     TOAST NOTIFICATION ENGINE
     ========================================================= */
  showToast(message, type = "info", duration = 3000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const iconMap = {
      success: "check-circle-2",
      danger: "alert-circle",
      warning: "alert-triangle",
      info: "info"
    };

    toast.innerHTML = `
      <i data-lucide="${iconMap[type] || 'info'}"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(30px)";
      setTimeout(() => toast.remove(), 250);
    }, duration);
  },

  /* =========================================================
     KEYBOARD SHORTCUTS
     ========================================================= */
  setupShortcuts() {
    window.addEventListener("keydown", (e) => {
      // F2: Search Focus on POS
      if (e.key === "F2") {
        e.preventDefault();
        const searchInput = document.getElementById("pos-search-input");
        if (searchInput && document.getElementById("cashier-view").classList.contains("active")) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // F4: Checkout
      if (e.key === "F4") {
        e.preventDefault();
        if (document.getElementById("cashier-view").classList.contains("active")) {
          const checkoutBtn = document.getElementById("btn-checkout");
          if (checkoutBtn && !checkoutBtn.disabled) {
            CashierPOS.openCheckoutModal();
          }
        }
      }

      // Escape: Close active modals
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-backdrop.active").forEach(modal => {
          modal.classList.remove("active");
        });
      }
    });
  }
};

// Auto boot on DOM Content Loaded
document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
