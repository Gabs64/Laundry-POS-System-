/**
 * Brand Name POS - Admin Dashboard Module
 * Manages laundry services, categories, supplies stock adjustments,
 * active laundry orders tracker, sales history, reports, users, and store settings.
 */

const AdminPanel = {
  currentTab: "dashboard",
  adjustType: "ADD", // 'ADD', 'SUB', 'SET'
  charts: {},
  laundryFilterStatus: "ALL",
  selectedProductCategory: "ALL",
  productViewMode: "grid",
  attendanceMonth: new Date().toISOString().slice(0, 7), // "YYYY-MM"
  attendanceViewMode: "table", // 'table' or 'matrix'
  attendanceStaffFilter: "ALL",
  attendanceStatusFilter: "ALL",

  init() {
    this.normalizeCatalogBrands();
    this.renderDashboard();
    this.populateCategorySelects();

    if (!this._syncListenerAttached) {
      this._syncListenerAttached = true;
      window.addEventListener("pos-data-synced", () => {
        this.normalizeCatalogBrands();
        this.populateCategorySelects();
        if (this.currentTab === "dashboard") this.renderDashboard();
        else if (this.currentTab === "orders" || this.currentTab === "laundry") (this.renderLaundryOrders ? this.renderLaundryOrders() : this.renderLaundryTable());
        else if (this.currentTab === "catalog" || this.currentTab === "products") (this.renderProducts ? this.renderProducts() : this.renderProductsTable());
        else if (this.currentTab === "categories") this.renderCategories();
        else if (this.currentTab === "inventory") (this.renderInventory ? this.renderInventory() : this.renderInventoryTable());
        else if (this.currentTab === "sales") (this.renderSalesHistory ? this.renderSalesHistory() : this.renderSalesTable());
        else if (this.currentTab === "reports") this.renderReports();
        else if (this.currentTab === "cashiers") this.renderUsers();
        else if (this.currentTab === "attendance") this.renderAttendance();
      });
    }
  },

  detectBrand(text) {
    if (!text) return "";
    const brands = [
      'Breeze', 'Ariel', 'Tide', 'Downy', 'Surf', 'Zonrox', 'Pride',
      'Champion', 'Callalily', 'Gain', 'Clorox', 'Persil', 'Snuggle',
      'Bounce', 'OxiClean', 'Woolite', 'Comfort', 'Sunlight', 'Dynamo',
      'Attack', 'Biozet', 'Arm & Hammer', 'Fabuloso', 'Kirkland'
    ];
    for (const b of brands) {
      const rx = new RegExp('\\b' + b + '\\b', 'i');
      if (rx.test(text)) return b;
    }
    return "";
  },

  detectBrandFromBarcodePrefix(code) {
    if (!code) return "";
    const c = String(code);
    if (c.startsWith('8934868') || c.startsWith('4800888')) return 'Breeze';
    if (c.startsWith('4800092')) return 'Ariel';
    if (c.startsWith('4902430')) return 'Downy';
    if (c.startsWith('8710447')) return 'Surf';
    if (c.startsWith('4800119')) return 'Zonrox';
    if (c.startsWith('4800555')) return 'Pride';
    if (c.startsWith('4800777')) return 'Champion';
    if (c.startsWith('4800333')) return 'Callalily';
    if (c.startsWith('037000')) return 'Tide';
    if (c.startsWith('044600')) return 'Clorox';
    return "";
  },

  formatBrandAndType(brand, text, unit) {
    const combined = `${brand || ''} ${text || ''}`.toLowerCase();
    let type = 'Liquid Detergent';
    if (combined.includes('fabric conditioner') || combined.includes('softener') || combined.includes('fabcon') || brand === 'Downy' || brand === 'Callalily' || brand === 'Comfort' || brand === 'Snuggle' || brand === 'Bounce') {
      type = 'Fabric Conditioner';
    } else if (combined.includes('bleach') || combined.includes('zonrox') || combined.includes('clorox') || combined.includes('chlorine') || brand === 'Zonrox' || brand === 'Clorox') {
      type = 'Bleach';
    } else if (combined.includes('pod') || combined.includes('fling') || combined.includes('pac') || combined.includes('capsule')) {
      type = 'Detergent Pods';
    } else if (combined.includes('bar') || combined.includes('soap bar') || combined.includes('laundry bar') || brand === 'Perla') {
      type = 'Laundry Bar';
    } else if (combined.includes('powder') || combined.includes('pulbos') || combined.includes('scoop') || unit === 'scoop' || unit === 'kg') {
      type = 'Powder Detergent';
    } else if (combined.includes('liquid') || combined.includes('gel') || unit === 'sachet' || unit === 'bottle') {
      type = 'Liquid Detergent';
    }

    const cleanBrand = brand && String(brand).trim() ? String(brand).trim() : '';
    if (cleanBrand) {
      return `${cleanBrand} ${type}`;
    }
    return type;
  },

  normalizeCatalogBrands() {
    try {
      const data = StorageManager.get();
      if (!data || !Array.isArray(data.products)) return;
      let modified = false;

      data.products.forEach(p => {
        // Automatically fix Breeze barcode 8934868113034
        if (p.barcode === '8934868113034') {
          if (!p.name || p.name !== 'Breeze Liquid Detergent') {
            p.name = 'Breeze Liquid Detergent';
            p.brand = 'Breeze';
            p.unit = p.unit || 'sachet';
            p.costPrice = p.costPrice || 15.00;
            p.price = p.price || 15.00;
            p.description = 'Breeze Liquid Detergent (Barcode: 8934868113034)';
            modified = true;
          }
        }
        // Auto-assign brand if missing
        if (!p.brand) {
          const detected = this.detectBrand(p.name) || this.detectBrandFromBarcodePrefix(p.barcode);
          if (detected) {
            p.brand = detected;
            modified = true;
          }
        }
        // Ensure name is cleanly formatted as [Brand] [Type of Detergent]
        if (p.brand && !p.isService) {
          const clean = this.formatBrandAndType(p.brand, p.name, p.unit);
          if (clean && clean !== p.name && (p.name.includes('Power Machine') || p.name.includes('Sunrise Fresh') || p.name.includes('Touch of Downy') || p.name.includes('Supply'))) {
            p.name = clean;
            modified = true;
          }
        }
      });

      if (modified) {
        StorageManager.save(data);
      }
    } catch (e) {}
  },

  switchTab(tabName, options = {}) {
    this.currentTab = tabName;

    // Update Sidebar Navigation buttons
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
      item.classList.toggle("active", item.dataset.tab === tabName);
    });

    // Update Content Panes
    document.querySelectorAll(".tab-pane").forEach(pane => {
      pane.classList.remove("active");
    });

    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) targetPane.classList.add("active");

    // Update Titles
    const titleEl = document.getElementById("admin-page-title");
    const subEl = document.getElementById("admin-page-subtitle");

    const titles = {
      dashboard: ["Dashboard Overview", "Real-time laundry store metrics and operational status"],
      laundry: ["Laundry Tracker & Pickups", "Manage active laundry batches, stages, and customer releases"],
      products: ["Services & Products Catalog", "Manage wash services, dry clean rates, and retail supplies"],
      categories: ["Service Categories", "Organize services into Wash & Fold, Dry Clean, Steam Press, Bulky, Supplies"],
      inventory: ["Supplies & Retail Inventory", "Monitor detergent, softener, and garment bag stock levels"],
      sales: ["Sales & Claim History", "Audit all completed customer drop-offs and transactions"],
      reports: ["Laundry Reports & Analytics", "Visual performance metrics, kg processed, and revenue breakdown"],
      cashiers: ["Staff Accounts & Access", "Manage Cashier and Laundry Administrator credentials"],
      attendance: ["Staff Attendance & Timesheets", "Monitor daily time-in/out records, monthly shift hours, and cashier punctuality"],
      settings: ["Store & Policy Settings", "Configure business profile, turnaround hours, and claim prefix"]
    };

    if (titles[tabName]) {
      if (titleEl) titleEl.textContent = titles[tabName][0];
      if (subEl) subEl.textContent = titles[tabName][1];
    }

    // Refresh active tab contents
    if (tabName === "dashboard") this.renderDashboard();
    if (tabName === "laundry") this.renderLaundryTable();
    if (tabName === "products") this.renderProductsTable();
    if (tabName === "categories") this.renderCategories();
    if (tabName === "inventory") {
      this.renderInventoryTable();
      if (options.filter === 'low') {
        this.filterInventory('low');
      }
    }
    if (tabName === "sales") this.renderSalesTable();
    if (tabName === "reports") this.renderReports();
    if (tabName === "cashiers") this.renderUsers();
    if (tabName === "attendance") this.renderAttendance();
    if (tabName === "settings") this.loadStoreSettings();

    if (window.lucide) lucide.createIcons();
  },

  /* =========================================================
     1. DASHBOARD OVERVIEW
     ========================================================= */
  renderDashboard() {
    const data = StorageManager.get();
    const products = data.products || [];
    const sales = data.sales || [];

    // Filter Today's Sales
    const todayStr = new Date().toDateString();
    const todaySales = sales.filter(s => new Date(s.createdAt).toDateString() === todayStr);
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);

    // Active laundry orders
    const activeOrders = sales.filter(s => s.laundryStatus && s.laundryStatus !== 'CLAIMED');
    const readyPickupOrders = sales.filter(s => s.laundryStatus === 'READY_FOR_PICKUP');

    // Total Kg Processed
    const totalKg = sales.reduce((sum, s) => sum + (s.totalWeight || 0), 0);

    // Low stock supplies
    const lowStockSupplies = products.filter(p => !p.isService && p.stockQuantity <= (p.lowStockThreshold || 10) && p.status !== 'inactive');

    // Update Dashboard KPIs
    const todaySalesEl = document.getElementById("kpi-today-sales");
    const activeOrdersEl = document.getElementById("kpi-active-orders");
    const readyPickupSubEl = document.getElementById("kpi-ready-pickup-subtext");
    const totalKgEl = document.getElementById("kpi-total-kg");
    const totalOrdersCountEl = document.getElementById("kpi-total-orders-count");
    const lowStockEl = document.getElementById("kpi-low-stock-count");
    const sidebarActiveBadge = document.getElementById("sidebar-active-laundry-count");
    const sidebarLowBadge = document.getElementById("sidebar-low-stock-count");
    const sidebarAttendanceBadge = document.getElementById("sidebar-active-attendance-count");

    const attendanceRecords = data.attendance || [];
    const activeStaffCount = attendanceRecords.filter(a => a.status === "CLOCKED_IN").length;

    if (todaySalesEl) todaySalesEl.textContent = `₱${todayRevenue.toFixed(2)}`;
    if (activeOrdersEl) activeOrdersEl.textContent = activeOrders.length.toString();
    if (readyPickupSubEl) readyPickupSubEl.textContent = `${readyPickupOrders.length} ready for customer pickup`;
    if (totalKgEl) totalKgEl.textContent = `${totalKg.toFixed(1)} kg`;
    if (totalOrdersCountEl) totalOrdersCountEl.textContent = `${sales.length} total orders recorded`;
    if (lowStockEl) lowStockEl.textContent = lowStockSupplies.length.toString();

    if (sidebarActiveBadge) {
      sidebarActiveBadge.textContent = activeOrders.length.toString();
      sidebarActiveBadge.style.display = activeOrders.length > 0 ? "inline-block" : "none";
    }
    if (sidebarLowBadge) {
      sidebarLowBadge.textContent = lowStockSupplies.length.toString();
      sidebarLowBadge.style.display = lowStockSupplies.length > 0 ? "inline-block" : "none";
    }
    if (sidebarAttendanceBadge) {
      sidebarAttendanceBadge.textContent = `${activeStaffCount} on duty`;
      sidebarAttendanceBadge.style.display = activeStaffCount > 0 ? "inline-block" : "none";
    }

    // Render Recent Transactions
    const recentSalesTbody = document.getElementById("dashboard-recent-sales-tbody");
    if (recentSalesTbody) {
      if (sales.length === 0) {
        recentSalesTbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center">No laundry orders recorded yet.</td></tr>`;
      } else {
        let html = "";
        sales.slice(0, 6).forEach(s => {
          const time = new Date(s.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          const itemCount = s.items.reduce((acc, it) => acc + it.quantity, 0);
          const status = (s.laundryStatus || 'RECEIVED').replace(/_/g, ' ');
          const weightDisplay = s.totalWeight ? `${s.totalWeight} kg` : `${itemCount} pcs`;

          html += `
            <tr>
              <td><b>${s.claimNumber || '#' + s.transactionNumber}</b></td>
              <td>${s.customerName || 'Customer'}</td>
              <td><span class="badge-pill badge-active">${status}</span></td>
              <td>${weightDisplay}</td>
              <td class="font-bold text-success">₱${s.total.toFixed(2)}</td>
              <td class="text-muted text-sm">${time}</td>
            </tr>
          `;
        });
        recentSalesTbody.innerHTML = html;
      }
    }

    // Render Top Laundry Services
    this.renderTopProductsList();
  },

  renderTopProductsList() {
    const data = StorageManager.get();
    const sales = data.sales || [];
    const container = document.getElementById("dashboard-top-products-list");
    if (!container) return;

    const map = {};
    sales.forEach(s => {
      s.items.forEach(it => {
        if (!map[it.productName]) {
          map[it.productName] = { name: it.productName, units: 0, revenue: 0, unit: it.unit || 'pc' };
        }
        map[it.productName].units += it.quantity;
        map[it.productName].revenue += it.subtotal;
      });
    });

    const topList = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    if (topList.length === 0) {
      container.innerHTML = `<p class="text-muted text-sm">No sales data available yet.</p>`;
      return;
    }

    let html = "";
    topList.forEach((prod, idx) => {
      html += `
        <div class="top-product-item">
          <div class="top-rank-circle">#${idx + 1}</div>
          <div class="top-product-info">
            <span class="top-product-name">${prod.name}</span>
            <span class="top-product-stats">${prod.units} ${prod.unit}s processed</span>
          </div>
          <div class="top-product-revenue font-bold text-success">
            ₱${prod.revenue.toFixed(2)}
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  },

  /* =========================================================
     2. DEDICATED LAUNDRY STATUS TRACKER TAB
     ========================================================= */
  filterLaundryStatus(status) {
    this.laundryFilterStatus = status;
    document.querySelectorAll("#tab-laundry .btn-group .btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`btn-adm-lnd-${status.toLowerCase().replace(/_/g, '-')}`);
    if (activeBtn) activeBtn.classList.add("active");
    this.renderLaundryTable();
  },

  filterLaundryTable() {
    this.renderLaundryTable();
  },

  renderLaundryTable() {
    const tbody = document.getElementById("admin-laundry-table-tbody");
    if (!tbody) return;

    const data = StorageManager.get();
    let sales = data.sales || [];
    const query = (document.getElementById("admin-laundry-search")?.value || "").trim().toLowerCase();

    // Filter by status
    if (this.laundryFilterStatus === "ACTIVE") {
      sales = sales.filter(s => s.laundryStatus && s.laundryStatus !== 'CLAIMED');
    } else if (this.laundryFilterStatus !== "ALL") {
      sales = sales.filter(s => s.laundryStatus === this.laundryFilterStatus);
    }

    // Filter by search query
    if (query) {
      sales = sales.filter(s => {
        const name = (s.customerName || "").toLowerCase();
        const phone = (s.customerPhone || "").toLowerCase();
        const claim = (s.claimNumber || s.transactionNumber || "").toLowerCase();
        return name.includes(query) || phone.includes(query) || claim.includes(query);
      });
    }

    if (sales.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No laundry orders match the filter.</td></tr>`;
      return;
    }

    let html = "";
    sales.forEach(sale => {
      const currentStatus = sale.laundryStatus || "RECEIVED";
      const dueFormatted = sale.dueDate ? new Date(sale.dueDate).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      }) : "Standard";

      const itemsSummary = sale.items.map(it => `${it.quantity}${it.unit || 'pc'} ${it.productName}`).join("<br>");
      const weightDisplay = sale.totalWeight ? `<b>${sale.totalWeight} kg</b>` : "—";

      html += `
        <tr>
          <td>
            <span class="claim-tag-number">${sale.claimNumber || '#' + sale.transactionNumber}</span><br>
            <small class="text-muted">Txn #${sale.transactionNumber}</small>
          </td>
          <td>
            <b>${sale.customerName || 'Walk-in'}</b><br>
            <small class="text-muted"><i data-lucide="phone"></i> ${sale.customerPhone || 'None'}</small>
          </td>
          <td class="text-sm">${itemsSummary}</td>
          <td>${weightDisplay}</td>
          <td><span class="text-warning text-sm font-bold">${dueFormatted}</span></td>
          <td class="font-bold text-success">₱${sale.total.toFixed(2)}</td>
          <td>
            <select class="status-quick-select" onchange="AdminPanel.updateLaundryOrderStatus('${sale.id}', this.value)">
              <option value="RECEIVED" ${currentStatus === 'RECEIVED' ? 'selected' : ''}>Received 📥</option>
              <option value="WASHING" ${currentStatus === 'WASHING' ? 'selected' : ''}>Washing 🧼</option>
              <option value="DRYING" ${currentStatus === 'DRYING' ? 'selected' : ''}>Drying 🌀</option>
              <option value="READY_FOR_PICKUP" ${currentStatus === 'READY_FOR_PICKUP' ? 'selected' : ''}>Ready for Pickup ✅</option>
              <option value="CLAIMED" ${currentStatus === 'CLAIMED' ? 'selected' : ''}>Claimed 🧺</option>
            </select>
          </td>
          <td class="text-right">
            <button type="button" class="btn btn-secondary btn-sm" onclick="AdminPanel.viewPastReceipt('${sale.id}')" title="View & Print Claim Stub">
              <i data-lucide="printer"></i> Stub
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  updateLaundryOrderStatus(saleId, newStatus) {
    const data = StorageManager.get();
    const sale = (data.sales || []).find(s => s.id === saleId);
    if (!sale) return;

    sale.laundryStatus = newStatus;
    StorageManager.save(data);

    Sound.playSuccess();
    this.renderLaundryTable();
    this.renderDashboard();
    App.showToast(`Updated Claim #${sale.claimNumber || sale.transactionNumber} to ${newStatus.replace(/_/g, ' ')}`, "success");
  },

  /* =========================================================
     3. SERVICES & PRODUCTS CATALOG TAB
     ========================================================= */
  /* =========================================================
     3. SERVICES & PRODUCTS CATALOG TAB (COMPACT GRID & TABLE)
     ========================================================= */
  populateCategorySelects() {
    const data = StorageManager.get();
    const categories = data.categories || [];
    const products = data.products || [];
    const filterSelect = document.getElementById("admin-product-category-filter");
    const formSelect = document.getElementById("prod-category");
    const pillsContainer = document.getElementById("admin-category-pills");

    if (filterSelect) {
      let html = `<option value="">All Categories</option>`;
      categories.forEach(c => { html += `<option value="${c.id}">${c.name}</option>`; });
      filterSelect.innerHTML = html;
    }

    if (formSelect) {
      let html = "";
      if (categories.length === 0) {
        html = `<option value="">-- No Categories (Add in Categories tab) --</option>`;
      } else {
        categories.forEach(c => { html += `<option value="${c.id}">${c.name}</option>`; });
      }
      formSelect.innerHTML = html;
    }

    if (pillsContainer) {
      const allCount = products.length;
      let html = `
        <button type="button" class="category-tab-btn ${this.selectedProductCategory === 'ALL' ? 'active' : ''}" 
                onclick="AdminPanel.filterProductCategory('ALL')">
          <i data-lucide="layers"></i>
          <span>All Services (${allCount})</span>
        </button>
      `;

      categories.forEach(c => {
        const count = products.filter(p => p.categoryId === c.id).length;
        const iconName = c.icon || "sparkles";
        const isActive = this.selectedProductCategory === c.id;
        html += `
          <button type="button" class="category-tab-btn ${isActive ? 'active' : ''}" 
                  onclick="AdminPanel.filterProductCategory('${c.id}')">
            <i data-lucide="${iconName}"></i>
            <span>${c.name} (${count})</span>
          </button>
        `;
      });

      pillsContainer.innerHTML = html;
      if (window.lucide) lucide.createIcons();
    }
  },

  filterProductCategory(catId) {
    this.selectedProductCategory = catId;
    const filterSelect = document.getElementById("admin-product-category-filter");
    if (filterSelect) filterSelect.value = catId === "ALL" ? "" : catId;
    this.renderProductsTable();
  },

  onCategoryFilterChange(catId) {
    this.selectedProductCategory = catId ? catId : "ALL";
    this.renderProductsTable();
  },

  switchProductView(mode) {
    this.productViewMode = mode;
    const gridView = document.getElementById("admin-product-grid-view");
    const tableView = document.getElementById("admin-product-table-view");
    const btnGrid = document.getElementById("btn-view-grid");
    const btnTable = document.getElementById("btn-view-table");

    if (btnGrid) btnGrid.classList.toggle("active", mode === "grid");
    if (btnTable) btnTable.classList.toggle("active", mode === "table");

    if (gridView) gridView.style.display = mode === "grid" ? "block" : "none";
    if (tableView) tableView.style.display = mode === "table" ? "block" : "none";

    if (window.lucide) lucide.createIcons();
  },

  resetProductFilters() {
    this.selectedProductCategory = "ALL";
    const searchInput = document.getElementById("admin-product-search");
    const catSelect = document.getElementById("admin-product-category-filter");
    const statusSelect = document.getElementById("admin-product-status-filter");

    if (searchInput) searchInput.value = "";
    if (catSelect) catSelect.value = "";
    if (statusSelect) statusSelect.value = "";

    this.renderProductsTable();
  },

  filterProductsTable() {
    this.renderProductsTable();
  },

  renderProductsTable() {
    const grid = document.getElementById("admin-product-grid");
    const tbody = document.getElementById("admin-products-table-tbody");
    const emptyState = document.getElementById("admin-empty-products");
    if (!grid && !tbody) return;

    const data = StorageManager.get();
    let products = data.products || [];
    const categories = data.categories || [];
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c.name; });

    // Update category pills to keep counts accurate
    this.populateCategorySelects();

    const search = (document.getElementById("admin-product-search")?.value || "").trim().toLowerCase();
    const statusFilter = document.getElementById("admin-product-status-filter")?.value;

    // Filter by category
    if (this.selectedProductCategory && this.selectedProductCategory !== "ALL") {
      products = products.filter(p => p.categoryId === this.selectedProductCategory);
    }

    // Filter by search query
    if (search) {
      products = products.filter(p => 
        p.name.toLowerCase().includes(search) || 
        (p.sku || "").toLowerCase().includes(search) ||
        (p.barcode || "").toLowerCase().includes(search) ||
        (catMap[p.categoryId] || "").toLowerCase().includes(search)
      );
    }

    // Filter by status
    if (statusFilter) {
      products = products.filter(p => p.status === statusFilter);
    }

    const placeholder = "https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=400&q=80";

    // Handle Empty State
    if (products.length === 0) {
      if (grid) grid.innerHTML = "";
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No items found matching criteria.</td></tr>`;
      if (emptyState) emptyState.style.display = "flex";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    // 1. Render Compact Grid Cards (Default)
    if (grid) {
      let gridHtml = "";
      products.forEach(p => {
        const unit = p.unit || "pc";
        const isService = p.isService !== false;
        const isOutOfStock = !isService && p.stockQuantity <= 0;
        const isLowStock = !isService && !isOutOfStock && p.stockQuantity <= (p.lowStockThreshold || 10);

        let stockBadgeText = "Laundry Service";
        let stockBadgeClass = "badge-service";

        if (!isService) {
          if (isOutOfStock) {
            stockBadgeText = "OUT OF STOCK";
            stockBadgeClass = "badge-stock-out";
          } else if (isLowStock) {
            stockBadgeText = `Low: ${p.stockQuantity} ${unit}s`;
            stockBadgeClass = "badge-stock-low";
          } else {
            stockBadgeText = `Stock: ${p.stockQuantity} ${unit}s`;
            stockBadgeClass = "badge-stock-good";
          }
        }

        const statusClass = p.status === 'active' ? 'badge-stock-good' : 'badge-stock-out';
        const displayImg = p.imageUrl || placeholder;
        const costVal = (p.costPrice !== undefined && p.costPrice > 0) ? p.costPrice : (p.price || 0);

        gridHtml += `
          <div class="admin-product-card ${p.status === 'inactive' ? 'product-card-inactive' : ''}" 
               onclick="AdminPanel.editProduct('${p.id}')">
            <div class="admin-product-card-img">
              <img src="${displayImg}" alt="${p.name}" loading="lazy" onerror="this.src='${placeholder}'">
              <span class="admin-card-status-badge ${statusClass}">${p.status.toUpperCase()}</span>
              <span class="admin-card-type-badge ${stockBadgeClass}">${stockBadgeText}</span>
            </div>
            <div class="admin-product-card-body">
              <div>
                <div class="admin-product-card-meta">
                  <span class="product-card-category">${catMap[p.categoryId] || 'General'}</span>
                  ${p.brand ? `<span class="badge-brand" style="font-size:0.68rem;">${p.brand}</span>` : ''}
                  <span class="admin-sku-tag">${p.sku ? 'SKU: ' + p.sku : ''}</span>
                </div>
                <h4 class="admin-product-card-title" title="${p.name}">${p.name}</h4>
              </div>
              <div class="admin-product-card-pricing">
                <div>
                  <span class="admin-product-price">₱${costVal.toFixed(2)}</span>
                  <small class="text-muted">/ ${unit}</small>
                </div>
              </div>
              <div class="admin-product-card-actions" onclick="event.stopPropagation()">
                <button type="button" class="btn btn-secondary btn-sm" onclick="AdminPanel.editProduct('${p.id}')" title="Edit Service">
                  <i data-lucide="edit-2"></i> Edit
                </button>
                <button type="button" class="btn btn-danger btn-sm" onclick="AdminPanel.confirmDeleteProduct('${p.id}')" title="Delete Item">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      });
      grid.innerHTML = gridHtml;
    }

    // 2. Render Table Rows (for table view toggle)
    if (tbody) {
      let tableHtml = "";
      products.forEach(p => {
        const unit = p.unit || "pc";
        const isService = p.isService !== false;
        const typeDisplay = isService ? `<span class="badge-pill badge-active">Laundry Service</span>` : `<span>Stock: <b>${p.stockQuantity}</b></span>`;
        const costVal = (p.costPrice !== undefined && p.costPrice > 0) ? p.costPrice : (p.price || 0);

        tableHtml += `
          <tr>
            <td><img src="${p.imageUrl || placeholder}" class="table-thumb" alt="${p.name}" onerror="this.src='${placeholder}'"></td>
            <td>
              <b>${p.name}</b> ${p.brand ? `<span class="badge-brand" style="font-size:0.68rem; margin-left:4px;">${p.brand}</span>` : ''}<br>
              <small class="text-muted">SKU: ${p.sku || 'N/A'}</small>
            </td>
            <td>${catMap[p.categoryId] || 'General'}</td>
            <td class="font-bold text-success">₱${costVal.toFixed(2)} <small class="text-muted">/ ${unit}</small></td>
            <td>${typeDisplay}</td>
            <td><span class="badge-pill ${p.status === 'active' ? 'badge-active' : 'badge-disabled'}">${p.status.toUpperCase()}</span></td>
            <td class="text-right">
              <div class="table-actions-flex">
                <button class="btn btn-secondary btn-sm" onclick="AdminPanel.editProduct('${p.id}')" title="Edit Item">
                  <i data-lucide="edit-2"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="AdminPanel.confirmDeleteProduct('${p.id}')" title="Delete Item">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = tableHtml;
    }

    if (window.lucide) lucide.createIcons();
  },

  openProductModal(isEdit = false) {
    const modal = document.getElementById("modal-product-form");
    const title = document.getElementById("product-modal-title");
    if (title) title.textContent = isEdit ? "Edit Service / Product" : "Add New Service / Product";
    if (!isEdit) {
      document.getElementById("product-form").reset();
      document.getElementById("prod-id").value = "";
      const brandInput = document.getElementById("prod-brand");
      if (brandInput) brandInput.value = "";
      document.getElementById("prod-threshold").value = "10";
      document.getElementById("prod-is-service").value = "true";
      const costInput = document.getElementById("prod-cost");
      if (costInput) costInput.value = "";
      const priceInput = document.getElementById("prod-price");
      if (priceInput) priceInput.value = "";
      this.toggleProductStockInputs();
      this.previewImage("");
    }
    this.populateCategorySelects();
    if (modal) modal.classList.add("active");
  },

  closeProductModal() {
    const modal = document.getElementById("modal-product-form");
    if (modal) modal.classList.remove("active");
  },

  toggleProductStockInputs() {
    const isService = document.getElementById("prod-is-service").value === "true";
    const stockRow = document.getElementById("prod-stock-inputs-row");
    if (stockRow) {
      stockRow.style.display = isService ? "none" : "flex";
    }
  },

  previewImage(url) {
    const preview = document.getElementById("prod-img-preview");
    if (!preview) return;
    if (url && url.startsWith("http")) {
      preview.innerHTML = `<img src="${url}" alt="Preview" style="width:100%; height:100%; object-fit:cover; border-radius:6px;">`;
    } else {
      preview.innerHTML = `<i data-lucide="image"></i>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  openAddSupplyModal() {
    this.openProductModal(false);
    const title = document.getElementById("product-modal-title");
    if (title) title.textContent = "Add Supply / Detergent";

    const isServiceSelect = document.getElementById("prod-is-service");
    if (isServiceSelect) isServiceSelect.value = "false";
    this.toggleProductStockInputs();

    // Default to supplies category if available
    const data = StorageManager.get();
    const supplyCat = (data.categories || []).find(c => c.name.toLowerCase().includes("suppl") || c.name.toLowerCase().includes("detergent"));
    if (supplyCat) {
      const catSelect = document.getElementById("prod-category");
      if (catSelect) catSelect.value = supplyCat.id;
    }

    const unitSelect = document.getElementById("prod-unit");
    if (unitSelect) unitSelect.value = "scoop";

    const nameInput = document.getElementById("prod-name");
    if (nameInput) {
      nameInput.placeholder = "e.g. Commercial Powder Detergent / Downy Floral";
      nameInput.focus();
    }
  },

  setPresetImage(key) {
    const presets = {
      wash: "https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=400&q=80",
      suit: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=400&q=80",
      barong: "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=400&q=80",
      press: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=400&q=80",
      duvet: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80",
      shoes: "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=400&q=80",
      powder_detergent: "https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80",
      liquid_detergent: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80",
      fabcon: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80",
      bleach: "https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80"
    };

    const isSupplyPreset = ['powder_detergent', 'liquid_detergent', 'fabcon', 'bleach'].includes(key);
    if (isSupplyPreset) {
      const isServiceSelect = document.getElementById("prod-is-service");
      if (isServiceSelect) isServiceSelect.value = "false";
      this.toggleProductStockInputs();

      const unitSelect = document.getElementById("prod-unit");
      if (unitSelect) {
        if (key === 'powder_detergent') unitSelect.value = 'scoop';
        else if (key === 'liquid_detergent') unitSelect.value = 'sachet';
        else if (key === 'fabcon') unitSelect.value = 'sachet';
        else if (key === 'bleach') unitSelect.value = 'scoop';
      }

      const nameInput = document.getElementById("prod-name");
      if (nameInput && !nameInput.value.trim()) {
        if (key === 'powder_detergent') nameInput.value = 'Commercial Laundry Powder Detergent';
        else if (key === 'liquid_detergent') nameInput.value = 'Concentrated Liquid Detergent';
        else if (key === 'fabcon') nameInput.value = 'Fabric Conditioner (Floral Breeze)';
        else if (key === 'bleach') nameInput.value = 'Color-Safe Oxygen Bleach Booster';
      }
    }

    const url = presets[key] || "";
    const input = document.getElementById("prod-image-url");
    if (input) {
      input.value = url;
      this.previewImage(url);
    }
  },

  editProduct(id) {
    const data = StorageManager.get();
    const prod = (data.products || []).find(p => p.id === id);
    if (!prod) return;

    // Auto-fix if Breeze barcode 8934868113034 was saved with old name
    if (prod.barcode === '8934868113034' && (prod.name.includes('Laundry Supply') || prod.name.includes('Power Machine') || !prod.name)) {
      prod.name = 'Breeze Liquid Detergent';
      prod.brand = 'Breeze';
      prod.unit = prod.unit || 'sachet';
      prod.costPrice = 15.00;
      prod.price = 15.00;
      prod.description = 'Breeze Liquid Detergent (Barcode: 8934868113034)';
      StorageManager.save(data);
    }

    this.openProductModal(true);

    document.getElementById("prod-id").value = prod.id;
    document.getElementById("prod-name").value = prod.name;
    const brandInput = document.getElementById("prod-brand");
    if (brandInput) brandInput.value = prod.brand || this.detectBrand(prod.name) || "";
    document.getElementById("prod-sku").value = prod.sku || "";
    document.getElementById("prod-category").value = prod.categoryId;
    document.getElementById("prod-unit").value = prod.unit || "pc";
    document.getElementById("prod-barcode").value = prod.barcode || "";
    const costVal = (prod.costPrice !== undefined && prod.costPrice > 0) ? prod.costPrice : (prod.price || 0);
    const costInput = document.getElementById("prod-cost");
    if (costInput) costInput.value = costVal;
    const priceInput = document.getElementById("prod-price");
    if (priceInput) priceInput.value = costVal;

    document.getElementById("prod-is-service").value = (prod.isService !== false) ? "true" : "false";
    document.getElementById("prod-stock").value = prod.stockQuantity || 100;
    document.getElementById("prod-threshold").value = prod.lowStockThreshold || 10;
    document.getElementById("prod-description").value = prod.description || "";
    document.getElementById("prod-image-url").value = prod.imageUrl || "";
    document.getElementById("prod-status").value = prod.status || "active";

    this.toggleProductStockInputs();
    this.previewImage(prod.imageUrl || "");
  },

  async autoFillFromBarcode(code) {
    if (!code || !code.trim()) return;
    const cleanCode = code.trim();

    // 1. Instant check against local catalog
    let prod = this.getLocalCatalogItem(cleanCode);

    // 2. Query server endpoint
    if (!prod) {
      try {
        const res = await fetch(getApiUrl(`/api/barcode/lookup?code=${encodeURIComponent(cleanCode)}`));
        if (res.ok) {
          const json = await res.json();
          if (json && json.success) prod = json;
        }
      } catch (e) {}
    }

    // 3. Client fallback lookup
    if (!prod) {
      prod = await this.clientFallbackBarcodeLookup(cleanCode);
    }

    if (prod) {
      const nameInput = document.getElementById("prod-name");
      const brandInput = document.getElementById("prod-brand");
      const skuInput = document.getElementById("prod-sku");
      const costInput = document.getElementById("prod-cost");
      const unitSelect = document.getElementById("prod-unit");
      const isServiceSelect = document.getElementById("prod-is-service");
      const descInput = document.getElementById("prod-description");
      const imgInput = document.getElementById("prod-image-url");
      const catSelect = document.getElementById("prod-category");

      if (nameInput) nameInput.value = prod.name;
      if (brandInput) brandInput.value = prod.brand || this.detectBrand(prod.name) || "";
      if (skuInput && (!skuInput.value || skuInput.value.startsWith("BAR-"))) {
        skuInput.value = "BAR-" + cleanCode.slice(-6);
      }
      if (costInput && (!costInput.value || costInput.value === "0" || costInput.value === "75")) {
        costInput.value = prod.cost || 15.00;
      }
      if (unitSelect && prod.unit) unitSelect.value = prod.unit;
      if (isServiceSelect) {
        isServiceSelect.value = "false";
        this.toggleProductStockInputs();
      }
      if (descInput && (!descInput.value || descInput.value.includes("Barcode:"))) {
        descInput.value = prod.description || `${prod.name} (Barcode: ${cleanCode})`;
      }
      if (imgInput && prod.imageUrl) {
        imgInput.value = prod.imageUrl;
        this.previewImage(prod.imageUrl);
      }
      const data = StorageManager.get();
      const supplyCat = (data.categories || []).find(c => c.name.toLowerCase().includes("suppl") || c.name.toLowerCase().includes("detergent"));
      if (catSelect && supplyCat) {
        catSelect.value = supplyCat.id;
      }

      App.showToast(`Detected brand "${prod.brand || 'Breeze'}" & product "${prod.name}"!`, "success");
      Sound.playSuccess();
    }
  },

  saveProduct(e) {
    e.preventDefault();
    const data = StorageManager.get();
    const prodId = document.getElementById("prod-id").value;
    const isService = document.getElementById("prod-is-service").value === "true";

    const costVal = parseFloat(document.getElementById("prod-cost")?.value) || 0;
    const nameVal = document.getElementById("prod-name").value.trim();
    const brandVal = (document.getElementById("prod-brand")?.value || "").trim() || this.detectBrand(nameVal) || "";

    const productPayload = {
      id: prodId || "prod-" + Date.now(),
      name: nameVal,
      brand: brandVal,
      sku: document.getElementById("prod-sku").value.trim(),
      categoryId: document.getElementById("prod-category").value,
      unit: document.getElementById("prod-unit").value,
      barcode: document.getElementById("prod-barcode").value.trim(),
      price: costVal,
      costPrice: costVal,
      isService: isService,
      stockQuantity: isService ? 999 : (parseFloat(document.getElementById("prod-stock").value) || 0),
      lowStockThreshold: parseFloat(document.getElementById("prod-threshold").value) || 10,
      description: document.getElementById("prod-description").value.trim(),
      imageUrl: document.getElementById("prod-image-url").value.trim(),
      status: document.getElementById("prod-status").value
    };

    if (prodId) {
      const idx = data.products.findIndex(p => p.id === prodId);
      if (idx > -1) data.products[idx] = productPayload;
    } else {
      data.products.push(productPayload);
    }

    StorageManager.save(data);
    this.closeProductModal();
    this.renderProductsTable();
    this.renderDashboard();
    App.showToast(`Saved service/product: ${productPayload.name}`, "success");
  },

  confirmDeleteProduct(id) {
    const data = StorageManager.get();
    const prod = (data.products || []).find(p => p.id === id);
    if (!prod) return;

    App.showConfirmModal(
      `Delete "${prod.name}"?`,
      "Are you sure you want to delete this item from the catalog?",
      () => {
        data.products = data.products.filter(p => p.id !== id);
        StorageManager.save(data);
        this.renderProductsTable();
        this.renderDashboard();
        App.showToast(`Deleted ${prod.name}`, "info");
      }
    );
  },

  /* =========================================================
     4. CATEGORIES TAB
     ========================================================= */
  renderCategories() {
    const grid = document.getElementById("admin-categories-grid");
    if (!grid) return;

    const data = StorageManager.get();
    const categories = data.categories || [];
    const products = data.products || [];

    if (categories.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1rem; background: var(--bg-surface); border: 1px dashed var(--border-color); border-radius: var(--radius-lg); color: var(--text-muted);">
          <i data-lucide="folder-plus" style="width: 44px; height: 44px; stroke-width: 1.5; margin-bottom: 0.75rem; display: inline-block; color: var(--primary);"></i>
          <h4 style="color: var(--text-primary); margin-bottom: 0.35rem;">No Service Categories Yet</h4>
          <p style="margin: 0 0 1.25rem; font-size: 0.9rem;">Organize your laundry services by adding your first service category.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="AdminPanel.openCategoryModal()">
            <i data-lucide="plus"></i> Add Service Category
          </button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    let html = "";
    categories.forEach(cat => {
      const count = products.filter(p => p.categoryId === cat.id).length;
      html += `
        <div class="category-card">
          <div class="category-card-main">
            <div class="category-icon-box">
              <i data-lucide="${cat.icon || 'shirt'}"></i>
            </div>
            <div class="category-info">
              <h4>${cat.name}</h4>
              <p>${cat.description || 'No description'}</p>
              <span class="category-count">${count} items</span>
            </div>
          </div>
          <div class="category-actions">
            <button type="button" class="btn btn-secondary btn-sm" onclick="AdminPanel.editCategory('${cat.id}')" title="Edit Category"><i data-lucide="edit-2"></i></button>
            <button type="button" class="btn btn-danger btn-sm" onclick="AdminPanel.confirmDeleteCategory('${cat.id}')" title="Delete Category"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  openCategoryModal(isEdit = false) {
    const modal = document.getElementById("modal-category-form");
    const title = document.getElementById("category-modal-title");
    if (title) title.textContent = isEdit ? "Edit Category" : "Add Category";
    if (!isEdit) {
      document.getElementById("category-form").reset();
      document.getElementById("cat-id").value = "";
    }
    if (modal) modal.classList.add("active");
  },

  closeCategoryModal() {
    const modal = document.getElementById("modal-category-form");
    if (modal) modal.classList.remove("active");
  },

  editCategory(id) {
    const data = StorageManager.get();
    const cat = (data.categories || []).find(c => c.id === id);
    if (!cat) return;

    this.openCategoryModal(true);
    document.getElementById("cat-id").value = cat.id;
    document.getElementById("cat-name").value = cat.name;
    document.getElementById("cat-icon").value = cat.icon || "shirt";
    document.getElementById("cat-desc").value = cat.description || "";
  },

  saveCategory(e) {
    e.preventDefault();
    const data = StorageManager.get();
    const catId = document.getElementById("cat-id").value;

    const payload = {
      id: catId || "cat-" + Date.now(),
      name: document.getElementById("cat-name").value.trim(),
      icon: document.getElementById("cat-icon").value,
      description: document.getElementById("cat-desc").value.trim()
    };

    if (catId) {
      const idx = data.categories.findIndex(c => c.id === catId);
      if (idx > -1) data.categories[idx] = payload;
    } else {
      data.categories.push(payload);
    }

    StorageManager.save(data);
    this.closeCategoryModal();
    this.renderCategories();
    this.populateCategorySelects();
    App.showToast(`Saved category: ${payload.name}`, "success");
  },

  confirmDeleteCategory(id) {
    const data = StorageManager.get();
    const cat = (data.categories || []).find(c => c.id === id);
    if (!cat) return;

    App.showConfirmModal(
      `Delete Category "${cat.name}"?`,
      "Items under this category will remain in the system.",
      () => {
        data.categories = data.categories.filter(c => c.id !== id);
        StorageManager.save(data);
        this.renderCategories();
        this.populateCategorySelects();
        App.showToast(`Deleted category: ${cat.name}`, "info");
      }
    );
  },

  /* =========================================================
     5. SUPPLIES INVENTORY TAB
     ========================================================= */
  filterInventory(filterType) {
    document.querySelectorAll("#tab-inventory .btn-group .btn").forEach(btn => btn.classList.remove("active"));
    const btn = document.getElementById(`btn-inv-filter-${filterType}`);
    if (btn) btn.classList.add("active");
    this.renderInventoryTable(filterType);
  },

  filterInventoryTable() {
    this.renderInventoryTable();
  },

  renderInventoryTable(forceFilter = null) {
    const tbody = document.getElementById("admin-inventory-table-tbody");
    const banner = document.getElementById("inventory-low-stock-banner");
    if (!tbody) return;

    const data = StorageManager.get();
    // Filter physical supplies only
    let items = (data.products || []).filter(p => !p.isService);

    const lowStockCount = items.filter(p => p.stockQuantity <= (p.lowStockThreshold || 10)).length;
    if (banner) {
      banner.style.display = lowStockCount > 0 ? "flex" : "none";
    }

    const search = (document.getElementById("admin-inventory-search")?.value || "").trim().toLowerCase();
    if (search) {
      items = items.filter(p => p.name.toLowerCase().includes(search) || (p.sku || "").toLowerCase().includes(search));
    }

    let activeFilter = forceFilter;
    if (!activeFilter) {
      if (document.getElementById("btn-inv-filter-low")?.classList.contains("active")) activeFilter = "low";
      else if (document.getElementById("btn-inv-filter-out")?.classList.contains("active")) activeFilter = "out";
    }

    if (activeFilter === "low") {
      items = items.filter(p => p.stockQuantity <= (p.lowStockThreshold || 10) && p.stockQuantity > 0);
    } else if (activeFilter === "out") {
      items = items.filter(p => p.stockQuantity <= 0);
    }

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No supplies inventory matching filter.</td></tr>`;
      return;
    }

    let html = "";
    items.forEach(p => {
      const isOut = p.stockQuantity <= 0;
      const isLow = !isOut && p.stockQuantity <= (p.lowStockThreshold || 10);
      let statusBadge = `<span class="badge-pill badge-active">In Stock</span>`;
      if (isOut) statusBadge = `<span class="badge-pill badge-disabled">Out of Stock</span>`;
      else if (isLow) statusBadge = `<span class="badge-pill badge-warning">Low Stock</span>`;

      html += `
        <tr>
          <td>
            <b>${p.name}</b>
            ${p.brand ? `<span class="badge-brand" style="font-size: 0.68rem; margin-left: 6px;">${p.brand}</span>` : ''}
          </td>
          <td><small class="text-muted">${p.sku || p.barcode || 'N/A'}</small></td>
          <td class="font-bold ${isLow || isOut ? 'text-danger' : ''}" style="cursor: pointer;" onclick="AdminPanel.openAdjustStockModal('${p.id}', 'SET')" title="Click to customize quantity">
            <b>${p.stockQuantity}</b> <small class="text-muted">${p.unit || 'pcs'}</small>
            <i data-lucide="edit-3" style="width:12px; height:12px; vertical-align:middle; opacity:0.6; margin-left:4px;"></i>
          </td>
          <td>${p.lowStockThreshold || 10}</td>
          <td>${statusBadge}</td>
          <td class="text-right">
            <div class="table-actions-flex" style="justify-content: flex-end; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="AdminPanel.openAdjustStockModal('${p.id}')" title="Adjust Stock">
                <i data-lucide="sliders"></i> Adjust
              </button>
              <button class="btn btn-secondary btn-sm" onclick="AdminPanel.editProduct('${p.id}')" title="Edit Supply Info">
                <i data-lucide="edit-2"></i> Edit
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  openAdjustStockModal(productId, defaultType = "ADD") {
    const data = StorageManager.get();
    const prod = (data.products || []).find(p => p.id === productId);
    if (!prod) return;

    document.getElementById("adjust-prod-id").value = prod.id;
    document.getElementById("adjust-product-name").textContent = prod.name;
    document.getElementById("adjust-current-stock").textContent = prod.stockQuantity;
    this.setAdjustType(defaultType);
    if (defaultType === "SET") {
      document.getElementById("adjust-qty").value = prod.stockQuantity;
    } else {
      document.getElementById("adjust-qty").value = "10";
    }
    this.recalcNewStock();

    const modal = document.getElementById("modal-inventory-adjust");
    if (modal) modal.classList.add("active");
  },

  quickAdjustQty(val) {
    this.setAdjustType("ADD");
    document.getElementById("adjust-qty").value = val;
    this.recalcNewStock();
  },

  quickSetExact(val) {
    this.setAdjustType("SET");
    document.getElementById("adjust-qty").value = val;
    this.recalcNewStock();
  },

  closeAdjustStockModal() {
    const modal = document.getElementById("modal-inventory-adjust");
    if (modal) modal.classList.remove("active");
  },

  setAdjustType(type) {
    this.adjustType = type;
    document.getElementById("btn-adjust-add").classList.toggle("active", type === "ADD");
    document.getElementById("btn-adjust-sub").classList.toggle("active", type === "SUB");
    document.getElementById("btn-adjust-set").classList.toggle("active", type === "SET");
    this.recalcNewStock();
  },

  recalcNewStock() {
    const currentStock = parseFloat(document.getElementById("adjust-current-stock").textContent) || 0;
    const qty = parseFloat(document.getElementById("adjust-qty").value) || 0;
    let newStock = currentStock;

    if (this.adjustType === "ADD") newStock = currentStock + qty;
    if (this.adjustType === "SUB") newStock = Math.max(0, currentStock - qty);
    if (this.adjustType === "SET") newStock = Math.max(0, qty);

    const newStockEl = document.getElementById("adjust-new-stock");
    if (newStockEl) newStockEl.textContent = newStock.toString();
  },

  saveStockAdjustment(e) {
    e.preventDefault();
    const data = StorageManager.get();
    const prodId = document.getElementById("adjust-prod-id").value;
    const prod = (data.products || []).find(p => p.id === prodId);
    if (!prod) return;

    const prevStock = prod.stockQuantity;
    const newStock = parseFloat(document.getElementById("adjust-new-stock").textContent) || 0;
    const reason = document.getElementById("adjust-reason").value;
    const notes = document.getElementById("adjust-notes").value.trim();
    const diff = newStock - prevStock;
    const currentUser = App.getCurrentUser();

    prod.stockQuantity = newStock;

    if (!data.inventoryLogs) data.inventoryLogs = [];
    data.inventoryLogs.unshift({
      id: "log-" + Date.now(),
      productId: prod.id,
      productName: prod.name,
      type: diff >= 0 ? "RESTOCK" : "ADJUST",
      quantity: diff,
      previousStock: prevStock,
      newStock: newStock,
      reason: reason,
      notes: notes,
      userName: currentUser ? currentUser.fullName : "Administrator",
      createdAt: new Date().toISOString()
    });

    StorageManager.save(data);
    this.closeAdjustStockModal();
    this.renderInventoryTable();
    this.renderDashboard();
    App.showToast(`Updated stock for ${prod.name} to ${newStock}`, "success");
  },

  openInventoryLogsModal() {
    const modal = document.getElementById("modal-inventory-logs");
    const tbody = document.getElementById("inventory-logs-tbody");
    const data = StorageManager.get();
    const logs = data.inventoryLogs || [];

    if (tbody) {
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No supplies inventory logs yet.</td></tr>`;
      } else {
        let html = "";
        logs.slice(0, 30).forEach(log => {
          const date = new Date(log.createdAt).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
          });
          const isPositive = log.quantity > 0;
          html += `
            <tr>
              <td><small class="text-muted">${date}</small></td>
              <td><b>${log.productName}</b></td>
              <td><span class="badge-pill badge-active">${log.type}</span></td>
              <td class="font-bold ${isPositive ? 'text-success' : 'text-danger'}">${isPositive ? '+' : ''}${log.quantity}</td>
              <td>${log.previousStock} &rarr; ${log.newStock}</td>
              <td>${log.reason} ${log.notes ? `(${log.notes})` : ''}</td>
              <td>${log.userName}</td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }
    }

    if (modal) modal.classList.add("active");
  },

  closeInventoryLogsModal() {
    const modal = document.getElementById("modal-inventory-logs");
    if (modal) modal.classList.remove("active");
  },

  /* =========================================================
     5.1 SUPPLIES AUTO BARCODE SCANNER & ONLINE DETECTOR
     ========================================================= */
  _barcodeHtml5QrCode: null,
  _barcodeCameraActive: false,
  _barcodeCameraFacingMode: "environment",
  _mediaStream: null,
  _barcodeScanInterval: null,
  _isScanLocked: false,
  _currentDetectedProduct: null,

  openBarcodeDetectorModal() {
    const modal = document.getElementById("modal-barcode-detector");
    if (!modal) return;
    this._isScanLocked = false;
    modal.classList.add("active");

    const input = document.getElementById("barcode-detector-input");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 200);
    }

    const resultBox = document.getElementById("barcode-detector-result");
    if (resultBox) resultBox.style.display = "none";

    const loadingBox = document.getElementById("barcode-detector-loading");
    if (loadingBox) loadingBox.style.display = "none";

    this.updateCameraStatusUI(false);
    if (window.lucide) lucide.createIcons();
  },

  closeBarcodeDetectorModal() {
    this.stopBarcodeCamera();
    this._isScanLocked = false;
    const modal = document.getElementById("modal-barcode-detector");
    if (modal) modal.classList.remove("active");
  },

  resetForNextScan() {
    this._isScanLocked = false;
    const input = document.getElementById("barcode-detector-input");
    if (input) {
      input.value = "";
      input.focus();
    }
    const resultBox = document.getElementById("barcode-detector-result");
    if (resultBox) resultBox.style.display = "none";

    if (this._barcodeCameraActive) {
      this.updateCameraStatusUI(true, "Scanning Active");
    }
  },

  updateCameraStatusUI(isActive, text = null) {
    const pill = document.getElementById("camera-status-pill");
    const statusText = document.getElementById("camera-status-text");
    const toggleBtn = document.getElementById("btn-toggle-camera");
    const flipBtn = document.getElementById("btn-flip-camera");
    const laser = document.getElementById("scanner-laser-line");
    const reticle = document.getElementById("scanner-reticle");
    const viewport = document.getElementById("camera-viewport-wrapper");

    if (isActive) {
      if (viewport) viewport.style.display = "flex";
      if (pill) pill.classList.add("active");
      if (statusText) statusText.textContent = text || "Scanning Active";
      if (toggleBtn) {
        toggleBtn.className = "btn btn-sm btn-danger";
        toggleBtn.innerHTML = `<i data-lucide="square"></i> Stop Camera`;
      }
      if (flipBtn) flipBtn.style.display = "inline-flex";
      if (laser) laser.style.display = "block";
      if (reticle) reticle.style.display = "block";
    } else {
      if (viewport) viewport.style.display = "none";
      if (pill) pill.classList.remove("active");
      if (statusText) statusText.textContent = text || "Device Webcam / Camera";
      if (toggleBtn) {
        toggleBtn.className = "btn btn-sm btn-secondary";
        toggleBtn.innerHTML = `<i data-lucide="camera"></i> Start Camera`;
      }
      if (flipBtn) flipBtn.style.display = "none";
      if (laser) laser.style.display = "none";
      if (reticle) reticle.style.display = "none";
    }
    if (window.lucide) lucide.createIcons();
  },

  async toggleBarcodeCamera() {
    if (this._barcodeCameraActive) {
      await this.stopBarcodeCamera();
    } else {
      await this.startBarcodeCamera();
    }
  },

  async startBarcodeCamera() {
    this._isScanLocked = false;
    this.updateCameraStatusUI(true, "Starting camera...");

    // 1. Try Native BarcodeDetector API (Built into Chrome/Edge, GPU-accelerated, zero CPU lag)
    if ('BarcodeDetector' in window) {
      try {
        const supportedFormats = await BarcodeDetector.getSupportedFormats().catch(() => ['ean_13', 'upc_a', 'code_128']);
        const detector = new BarcodeDetector({ formats: supportedFormats });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: this._barcodeCameraFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        this._mediaStream = stream;
        const nativeVideo = document.getElementById("barcode-native-video");
        const streamContainer = document.getElementById("barcode-camera-stream");
        if (nativeVideo) {
          nativeVideo.srcObject = stream;
          nativeVideo.style.display = "block";
          if (streamContainer) {
            streamContainer.style.display = "none";
            streamContainer.innerHTML = "";
          }
          await nativeVideo.play();

          // Throttled detection loop (every 220ms - prevents CPU freeze)
          if (this._barcodeScanInterval) clearInterval(this._barcodeScanInterval);
          this._barcodeScanInterval = setInterval(async () => {
            if (this._isScanLocked || !this._barcodeCameraActive || nativeVideo.readyState < 2) return;
            try {
              const barcodes = await detector.detect(nativeVideo);
              if (barcodes && barcodes.length > 0) {
                const rawValue = barcodes[0].rawValue;
                if (rawValue) {
                  this.onBarcodeDetected(rawValue);
                }
              }
            } catch (detErr) {}
          }, 220);

          this._barcodeCameraActive = true;
          this.updateCameraStatusUI(true, "Scanning Live");
          return;
        }
      } catch (nativeErr) {
        console.warn("Native BarcodeDetector init fallback:", nativeErr);
      }
    }

    // 2. Fallback to Html5Qrcode library
    const streamContainer = document.getElementById("barcode-camera-stream");
    const nativeVideo = document.getElementById("barcode-native-video");
    if (nativeVideo) {
      nativeVideo.style.display = "none";
      nativeVideo.pause();
      nativeVideo.srcObject = null;
    }
    if (!streamContainer) return;
    streamContainer.style.display = "flex";
    streamContainer.innerHTML = "";

    if (typeof Html5Qrcode === "undefined") {
      this._barcodeCameraActive = false;
      this.updateCameraStatusUI(false, "Camera Library Unavailable");
      App.showToast("Camera scanner library unavailable. You can type or use a USB scanner.", "warning");
      return;
    }

    try {
      if (!this._barcodeHtml5QrCode) {
        this._barcodeHtml5QrCode = new Html5Qrcode("barcode-camera-stream");
      }

      const config = {
        fps: 8,
        qrbox: (viewfinderWidth, viewfinderHeight) => ({
          width: Math.floor(Math.min(viewfinderWidth * 0.85, 300)),
          height: Math.floor(Math.min(viewfinderHeight * 0.65, 150))
        }),
        aspectRatio: 1.777778
      };

      await this._barcodeHtml5QrCode.start(
        { facingMode: this._barcodeCameraFacingMode },
        config,
        (decodedText) => {
          if (!this._isScanLocked) {
            this.onBarcodeDetected(decodedText);
          }
        },
        () => {}
      );

      this._barcodeCameraActive = true;
      this.updateCameraStatusUI(true, "Scanning Live");
    } catch (err) {
      console.warn("Camera fallback start error:", err);
      this._barcodeCameraActive = false;
      this.updateCameraStatusUI(false, "Camera Access Denied / Unavailable");
      App.showToast("Camera access unavailable. You can enter or scan barcodes with a USB scanner directly.", "warning");
    }
  },

  async stopBarcodeCamera() {
    if (this._barcodeScanInterval) {
      clearInterval(this._barcodeScanInterval);
      this._barcodeScanInterval = null;
    }

    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach(t => t.stop());
      this._mediaStream = null;
    }

    const nativeVideo = document.getElementById("barcode-native-video");
    if (nativeVideo) {
      nativeVideo.pause();
      nativeVideo.srcObject = null;
      nativeVideo.style.display = "none";
    }

    if (this._barcodeHtml5QrCode && this._barcodeCameraActive) {
      try {
        await this._barcodeHtml5QrCode.stop().catch(() => {});
      } catch (e) {}
    }

    const streamContainer = document.getElementById("barcode-camera-stream");
    if (streamContainer) {
      streamContainer.innerHTML = "";
      streamContainer.style.display = "none";
    }

    this._barcodeCameraActive = false;
    this.updateCameraStatusUI(false, "Camera Standby");
  },

  async flipBarcodeCamera() {
    this._barcodeCameraFacingMode = (this._barcodeCameraFacingMode === "environment") ? "user" : "environment";
    await this.stopBarcodeCamera();
    await this.startBarcodeCamera();
  },

  onBarcodeDetected(code) {
    if (!code || this._isScanLocked) return;
    const cleanCode = String(code).trim();
    if (!cleanCode) return;

    // Immediately lock to prevent rapid-fire freezing
    this._isScanLocked = true;
    this.updateCameraStatusUI(true, `Detected: ${cleanCode}`);

    Sound.playSuccess();
    const input = document.getElementById("barcode-detector-input");
    if (input) input.value = cleanCode;

    this.searchBarcodeOnline(cleanCode);
  },

  testScanPreset(code) {
    this._isScanLocked = true;
    const input = document.getElementById("barcode-detector-input");
    if (input) input.value = code;
    this.searchBarcodeOnline(code);
  },

  triggerBarcodeSearch() {
    const input = document.getElementById("barcode-detector-input");
    const code = (input?.value || "").trim();
    if (!code) {
      App.showToast("Please enter or scan a barcode first.", "warning");
      return;
    }
    this._isScanLocked = true;
    this.searchBarcodeOnline(code);
  },

  triggerBarcodeDebounced() {
    clearTimeout(this._barcodeDebounceTimer);
    this._barcodeDebounceTimer = setTimeout(() => {
      const input = document.getElementById("barcode-detector-input");
      const code = (input?.value || "").trim();
      if (code && code.length >= 12 && !this._isScanLocked) {
        this.triggerBarcodeSearch();
      }
    }, 350);
  },

  async searchBarcodeOnline(code) {
    const loadingBox = document.getElementById("barcode-detector-loading");
    const resultBox = document.getElementById("barcode-detector-result");
    if (loadingBox) loadingBox.style.display = "flex";
    if (resultBox) resultBox.style.display = "none";

    let productDetails = null;

    // 1. Instant 0ms response from local catalog
    productDetails = this.getLocalCatalogItem(code);

    // 2. Query server endpoint with safe 3.5s timeout
    if (!productDetails) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(getApiUrl(`/api/barcode/lookup?code=${encodeURIComponent(code)}`), {
          signal: controller.signal
        }).catch(() => null);

        clearTimeout(timeoutId);

        if (res && res.ok) {
          const json = await res.json().catch(() => null);
          if (json && json.success) {
            productDetails = json;
          }
        }
      } catch (e) {
        console.warn("Server barcode lookup error:", e);
      }
    }

    // 3. Fallback client lookup if server lookup unavailable
    if (!productDetails) {
      productDetails = await this.clientFallbackBarcodeLookup(code);
    }

    if (loadingBox) loadingBox.style.display = "none";

    if (!productDetails) {
      App.showToast(`No details found for barcode ${code}. You can enter details manually.`, "info");
      this._isScanLocked = false;
      return;
    }

    this._currentDetectedProduct = productDetails;
    this.renderDetectedProductCard(productDetails);
  },

  getLocalCatalogItem(code) {
    const CLIENT_CATALOG = {
      // Breeze Variants (Unilever)
      '8934868113034': { name: 'Breeze Liquid Detergent', brand: 'Breeze', unit: 'sachet', cost: 15.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Breeze Liquid Detergent sachet.' },
      '8934868113041': { name: 'Breeze Liquid Detergent', brand: 'Breeze', unit: 'sachet', cost: 28.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Breeze Liquid Detergent twin pack.' },
      '8934868113058': { name: 'Breeze Liquid Detergent', brand: 'Breeze', unit: 'sachet', cost: 16.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Breeze Liquid Detergent sachet.' },
      '8934868128366': { name: 'Breeze Powder Detergent', brand: 'Breeze', unit: 'scoop', cost: 16.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Breeze Powder Detergent.' },
      '8934868164012': { name: 'Breeze Liquid Detergent', brand: 'Breeze', unit: 'sachet', cost: 16.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Breeze Liquid Detergent.' },
      '8934868172901': { name: 'Breeze Powder Detergent', brand: 'Breeze', unit: 'scoop', cost: 17.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Breeze Powder Detergent.' },
      '4800888123456': { name: 'Breeze Powder Detergent', brand: 'Breeze', unit: 'scoop', cost: 16.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Breeze Powder Detergent.' },
      '4800888123463': { name: 'Breeze Liquid Detergent', brand: 'Breeze', unit: 'sachet', cost: 18.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Breeze Liquid Detergent.' },
      '4800888157741': { name: 'Breeze Liquid Detergent', brand: 'Breeze', unit: 'sachet', cost: 16.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Breeze Liquid Detergent.' },

      // Ariel Variants (P&G)
      '4800092330052': { name: 'Ariel Powder Detergent', brand: 'Ariel', unit: 'scoop', cost: 18.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Ariel Powder Detergent.' },
      '4800092330069': { name: 'Ariel Powder Detergent', brand: 'Ariel', unit: 'scoop', cost: 19.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Ariel Powder Detergent.' },
      '4800092330106': { name: 'Ariel Liquid Detergent', brand: 'Ariel', unit: 'sachet', cost: 22.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Ariel Liquid Detergent.' },
      '4800092118834': { name: 'Ariel Powder Detergent', brand: 'Ariel', unit: 'scoop', cost: 18.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Ariel Powder Detergent.' },
      '4800092119107': { name: 'Ariel Powder Detergent', brand: 'Ariel', unit: 'scoop', cost: 19.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Ariel Powder Detergent.' },
      '4800092120028': { name: 'Ariel Liquid Detergent', brand: 'Ariel', unit: 'sachet', cost: 20.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Ariel Liquid Detergent.' },

      // Tide Variants (P&G)
      '4800092113228': { name: 'Tide Powder Detergent', brand: 'Tide', unit: 'scoop', cost: 17.50, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Tide Powder Detergent.' },
      '4800092113235': { name: 'Tide Powder Detergent', brand: 'Tide', unit: 'scoop', cost: 16.50, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Tide Powder Detergent.' },
      '4800092113242': { name: 'Tide Liquid Detergent', brand: 'Tide', unit: 'sachet', cost: 19.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Tide Liquid Detergent.' },
      '4800092113259': { name: 'Tide Powder Detergent', brand: 'Tide', unit: 'scoop', cost: 16.50, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Tide Powder Detergent.' },

      // Downy Variants (P&G)
      '4902430730006': { name: 'Downy Fabric Conditioner', brand: 'Downy', unit: 'sachet', cost: 12.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Downy Fabric Conditioner.' },
      '4902430730013': { name: 'Downy Fabric Conditioner', brand: 'Downy', unit: 'sachet', cost: 12.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Downy Fabric Conditioner.' },
      '4902430730020': { name: 'Downy Fabric Conditioner', brand: 'Downy', unit: 'sachet', cost: 14.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Downy Fabric Conditioner.' },
      '4902430730037': { name: 'Downy Fabric Conditioner', brand: 'Downy', unit: 'sachet', cost: 14.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Downy Fabric Conditioner.' },
      '4902430730051': { name: 'Downy Fabric Conditioner', brand: 'Downy', unit: 'sachet', cost: 13.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Downy Fabric Conditioner.' },

      // Surf Variants (Unilever)
      '8710447385555': { name: 'Surf Powder Detergent', brand: 'Surf', unit: 'scoop', cost: 14.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Surf Powder Detergent.' },
      '8710447385562': { name: 'Surf Powder Detergent', brand: 'Surf', unit: 'scoop', cost: 14.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Surf Powder Detergent.' },
      '8710447385579': { name: 'Surf Powder Detergent', brand: 'Surf', unit: 'scoop', cost: 14.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Surf Powder Detergent.' },
      '8710447385586': { name: 'Surf Powder Detergent', brand: 'Surf', unit: 'scoop', cost: 14.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Surf Powder Detergent.' },
      '8710447441206': { name: 'Surf Fabric Conditioner', brand: 'Surf', unit: 'sachet', cost: 11.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Surf Fabric Conditioner.' },

      // Zonrox Bleach (Green Cross)
      '4800119223344': { name: 'Zonrox Bleach', brand: 'Zonrox', unit: 'bottle', cost: 25.00, categoryName: 'Bleach & Additives', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Zonrox Bleach.' },
      '4800119223306': { name: 'Zonrox Bleach', brand: 'Zonrox', unit: 'bottle', cost: 22.00, categoryName: 'Bleach & Additives', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Zonrox Bleach.' },
      '4800119223351': { name: 'Zonrox Bleach', brand: 'Zonrox', unit: 'sachet', cost: 15.00, categoryName: 'Bleach & Additives', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Zonrox Bleach.' },
      '4800119223368': { name: 'Zonrox Bleach', brand: 'Zonrox', unit: 'bottle', cost: 25.00, categoryName: 'Bleach & Additives', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Zonrox Bleach.' },

      // Pride Detergent (ACS)
      '4800555112233': { name: 'Pride Powder Detergent', brand: 'Pride', unit: 'scoop', cost: 13.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Pride Powder Detergent.' },
      '4800555112240': { name: 'Pride Powder Detergent', brand: 'Pride', unit: 'scoop', cost: 14.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Pride Powder Detergent.' },

      // Champion (Peerless)
      '4800777998811': { name: 'Champion Powder Detergent', brand: 'Champion', unit: 'scoop', cost: 13.50, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Pure clean laundry detergent powder.' },
      '4800777998828': { name: 'Champion Powder Detergent', brand: 'Champion', unit: 'scoop', cost: 13.50, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Ultra-cleaning enzyme detergent powder.' },

      // Callalily
      '4800333221100': { name: 'Callalily Fabric Conditioner', brand: 'Callalily', unit: 'sachet', cost: 11.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Callalily Fabric Conditioner.' },
      '4800333221117': { name: 'Callalily Fabric Conditioner', brand: 'Callalily', unit: 'sachet', cost: 11.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Callalily Fabric Conditioner.' },

      // Gain & International Brands
      '037000806497': { name: 'Gain Detergent Pods', brand: 'Gain', unit: 'sachet', cost: 25.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Gain Detergent Pods.' },
      '037000806480': { name: 'Tide Detergent Pods', brand: 'Tide', unit: 'sachet', cost: 28.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Tide Detergent Pods.' },
      '044600307685': { name: 'Clorox Bleach', brand: 'Clorox', unit: 'bottle', cost: 35.00, categoryName: 'Bleach & Additives', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Clorox Bleach.' }
    };

    if (CLIENT_CATALOG[code]) {
      return {
        found: true,
        source: 'Laundry Catalog',
        barcode: code,
        ...CLIENT_CATALOG[code]
      };
    }
    return null;
  },

  async clientFallbackBarcodeLookup(code) {
    const catalogMatch = this.getLocalCatalogItem(code);
    if (catalogMatch) return catalogMatch;

    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`, {
        signal: AbortSignal.timeout(3000)
      });
      const data = await res.json();
      if (data && data.status === 1 && data.product) {
        const p = data.product;
        const rawName = p.product_name || p.product_name_en || `Supply (${code})`;
        const brand = p.brands || p.brand_owner || this.detectBrand(rawName) || this.detectBrandFromBarcodePrefix(code) || '';
        const cleanName = this.formatBrandAndType(brand, rawName, 'sachet');
        return {
          found: true,
          source: 'Open Product Registry',
          barcode: code,
          name: cleanName,
          brand: brand,
          unit: 'sachet',
          cost: 15.00,
          imageUrl: p.image_url || p.image_front_url || 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80',
          description: `${cleanName} (Barcode: ${code})`
        };
      }
    } catch (e) {}

    // Smart Prefix Detection
    const prefixBrand = this.detectBrandFromBarcodePrefix(code);
    if (prefixBrand) {
      const name = this.formatBrandAndType(prefixBrand, `${prefixBrand} Detergent`, 'sachet');
      return {
        found: true,
        source: `${prefixBrand} Registry Detect`,
        barcode: code,
        name: name,
        brand: prefixBrand,
        unit: 'sachet',
        cost: 15.00,
        imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80',
        description: `${name} (Barcode: ${code})`
      };
    }

    return {
      found: false,
      source: 'Custom Barcode',
      barcode: code,
      name: 'Liquid Detergent',
      brand: 'Custom',
      unit: 'sachet',
      cost: 15.00,
      imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80',
      description: `Custom laundry supply (${code})`
    };
  },

  renderDetectedProductCard(prod) {
    const resultBox = document.getElementById("barcode-detector-result");
    if (!resultBox) return;

    const sourceBadge = document.getElementById("detected-source-badge");
    const brandBadge = document.getElementById("detected-brand-badge");
    const barcodeDisplay = document.getElementById("detected-barcode-display");
    const imageEl = document.getElementById("detected-product-image");
    const nameInput = document.getElementById("detected-product-name");
    const brandInput = document.getElementById("detected-product-brand");
    const unitSelect = document.getElementById("detected-product-unit");
    const costInput = document.getElementById("detected-product-cost");
    const qtyInput = document.getElementById("detected-product-qty");
    const noteBox = document.getElementById("detected-existing-stock-note");
    const actionBtn = document.getElementById("btn-confirm-reflect-supply");

    const detectedBrand = prod.brand || this.detectBrand(prod.name) || this.detectBrandFromBarcodePrefix(prod.barcode) || "";
    const cleanName = this.formatBrandAndType(detectedBrand, prod.name, prod.unit || "sachet");

    if (sourceBadge) sourceBadge.textContent = prod.source || (prod.found ? "Verified Registry" : "Custom Barcode");
    if (brandBadge) {
      if (detectedBrand) {
        brandBadge.textContent = `Brand: ${detectedBrand}`;
        brandBadge.style.display = "inline-block";
      } else {
        brandBadge.style.display = "none";
      }
    }

    if (barcodeDisplay) barcodeDisplay.textContent = prod.barcode;
    if (imageEl) imageEl.src = prod.imageUrl || 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80';
    if (nameInput) nameInput.value = cleanName;
    if (brandInput) brandInput.value = detectedBrand;
    if (unitSelect) unitSelect.value = prod.unit || "sachet";
    if (costInput) costInput.value = (prod.cost !== undefined && prod.cost > 0) ? prod.cost : 15.00;
    
    // Clear quantity so the owner manually types the exact stock quantity
    if (qtyInput) {
      qtyInput.value = "";
      qtyInput.placeholder = "Type quantity here...";
      setTimeout(() => {
        const q = document.getElementById("detected-product-qty");
        if (q) {
          q.focus();
          q.select();
        }
      }, 120);
    }

    // Check if this item is already in supplies inventory
    const data = StorageManager.get();
    const existing = (data.products || []).find(p => !p.isService && (p.barcode === prod.barcode || (p.sku && p.sku === prod.barcode)));

    if (existing) {
      if (noteBox) {
        noteBox.className = "inventory-status-pill is-existing mt-2";
        noteBox.innerHTML = `⚠️ <b>Existing in Inventory:</b> Currently <b>${existing.stockQuantity} ${existing.unit || 'pcs'}</b> in stock. Enter quantity above to replenish.`;
      }
      if (actionBtn) {
        actionBtn.innerHTML = `<i data-lucide="refresh-cw"></i> Restock Existing Supply Item`;
      }
    } else {
      if (noteBox) {
        noteBox.className = "inventory-status-pill is-new mt-2";
        noteBox.innerHTML = `✨ <b>New Supply Item:</b> Type quantity above and press Enter to add to Supplies Inventory.`;
      }
      if (actionBtn) {
        actionBtn.innerHTML = `<i data-lucide="check-circle-2"></i> Reflect into Supplies Inventory Now`;
      }
    }

    resultBox.style.display = "block";
    if (window.lucide) lucide.createIcons();
  },

  adjustDetectedQty(delta) {
    const input = document.getElementById("detected-product-qty");
    if (!input) return;
    const current = parseFloat(input.value) || 0;
    input.value = Math.max(1, current + delta);
  },

  confirmReflectSupplyItem() {
    const nameInput = document.getElementById("detected-product-name");
    const brandInput = document.getElementById("detected-product-brand");
    const unitSelect = document.getElementById("detected-product-unit");
    const costInput = document.getElementById("detected-product-cost");
    const qtyInput = document.getElementById("detected-product-qty");
    const barcodeDisplay = document.getElementById("detected-barcode-display");
    const imageEl = document.getElementById("detected-product-image");

    const barcode = (barcodeDisplay?.textContent || "").trim();
    const rawName = (nameInput?.value || "").trim() || `Supply Item (${barcode})`;
    const brand = (brandInput?.value || this.detectBrand(rawName) || this._currentDetectedProduct?.brand || "").trim();
    const unit = unitSelect?.value || "sachet";
    const name = this.formatBrandAndType(brand, rawName, unit);
    const cost = parseFloat(costInput?.value) || 15.00;
    const rawQty = (qtyInput?.value || "").trim();
    const qty = parseFloat(rawQty);
    const imageUrl = imageEl?.src || 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80';

    if (!barcode) {
      App.showToast("No barcode detected to save.", "warning");
      return;
    }

    if (!rawQty || isNaN(qty) || qty <= 0) {
      App.showToast("Please enter the quantity of the item.", "warning");
      if (qtyInput) qtyInput.focus();
      return;
    }

    const data = StorageManager.get();
    if (!data.products) data.products = [];
    if (!data.inventoryLogs) data.inventoryLogs = [];

    // Find or create category for supplies
    let supplyCat = (data.categories || []).find(c => c.name.toLowerCase().includes("suppl") || c.name.toLowerCase().includes("detergent"));
    if (!supplyCat) {
      supplyCat = {
        id: "cat-supplies",
        name: "Laundry Supplies & Detergents",
        description: "Laundry powders, fabric conditioners, stain boosters, and bags",
        order: (data.categories || []).length + 1
      };
      data.categories.push(supplyCat);
    }

    const existingIndex = data.products.findIndex(p => !p.isService && (p.barcode === barcode || (p.sku && p.sku === barcode)));

    let targetProductId = "";
    let finalStock = qty;

    if (existingIndex > -1) {
      // Restock existing product
      const item = data.products[existingIndex];
      targetProductId = item.id;
      const prevStock = Number(item.stockQuantity) || 0;
      item.stockQuantity = prevStock + qty;
      finalStock = item.stockQuantity;
      if (cost > 0) {
        item.costPrice = cost;
        item.price = cost;
      }
      item.name = name;
      if (brand && (!item.brand || item.brand === 'Custom')) {
        item.brand = brand;
      }
      if (unit) item.unit = unit;

      data.inventoryLogs.unshift({
        id: "log-" + Date.now(),
        productId: item.id,
        productName: item.name,
        type: "RESTOCK",
        quantity: qty,
        previousStock: prevStock,
        newStock: item.stockQuantity,
        reason: `Manual Barcode Restock (${barcode})`,
        notes: brand ? `Brand: ${brand}` : "Manually typed quantity",
        userName: AdminSite?.currentUser?.fullName || "Admin",
        timestamp: new Date().toISOString()
      });
    } else {
      // Create new supply product
      const newProdId = "prod-sup-" + Date.now();
      targetProductId = newProdId;
      const newSupply = {
        id: newProdId,
        name: name,
        brand: brand,
        sku: "BAR-" + barcode.slice(-6),
        categoryId: supplyCat.id,
        unit: unit,
        barcode: barcode,
        price: cost,
        costPrice: cost,
        isService: false, // Physical supply item!
        stockQuantity: qty,
        lowStockThreshold: 10,
        description: `${name} (Barcode: ${barcode})`,
        imageUrl: imageUrl,
        status: "active"
      };
      data.products.push(newSupply);

      data.inventoryLogs.unshift({
        id: "log-" + Date.now(),
        productId: newSupply.id,
        productName: newSupply.name,
        type: "INITIAL_SCAN",
        quantity: qty,
        previousStock: 0,
        newStock: qty,
        reason: `Barcode Initial Stock (${barcode})`,
        notes: brand ? `Detected Brand: ${brand}` : "Registered with manually entered quantity",
        userName: AdminSite?.currentUser?.fullName || "Admin",
        timestamp: new Date().toISOString()
      });
    }

    // Save locally and push to server
    StorageManager.save(data);
    Sound.playSuccess();
    App.showToast(`Successfully added "${name}" (${brand ? brand + ' • ' : ''}${qty} ${unit}) to Supplies Inventory!`, "success");

    // Update the Supplies Inventory table immediately
    this.renderInventoryTable();

    // Briefly highlight the row in the table
    setTimeout(() => {
      const rows = document.querySelectorAll("#admin-inventory-table-tbody tr");
      rows.forEach(r => {
        if (r.textContent.includes(name) || r.textContent.includes(barcode)) {
          r.classList.add("row-highlight-flash");
          r.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }, 150);

    // Refresh existing stock note in modal
    const noteBox = document.getElementById("detected-existing-stock-note");
    if (noteBox) {
      noteBox.className = "inventory-status-pill is-existing mt-2";
      noteBox.innerHTML = `✅ <b>Reflected in Inventory:</b> Total current stock is now <b>${finalStock} ${unit}</b>. You can type another quantity to adjust or scan next barcode.`;
    }

    // Clear barcode input field and unlock scanner for next item
    const barInput = document.getElementById("barcode-detector-input");
    if (barInput) {
      barInput.value = "";
    }
    this._isScanLocked = false;
  },

  /* =========================================================
     6. SALES & CLAIMS HISTORY TAB
     ========================================================= */
  filterSalesTable() {
    this.renderSalesTable();
  },

  renderSalesTable() {
    const tbody = document.getElementById("admin-sales-table-tbody");
    if (!tbody) return;

    const data = StorageManager.get();
    let sales = data.sales || [];
    const search = (document.getElementById("admin-sales-search")?.value || "").trim().toLowerCase();
    const period = document.getElementById("admin-sales-period-filter")?.value || "all";
    const payment = document.getElementById("admin-sales-payment-filter")?.value;

    if (search) {
      sales = sales.filter(s => 
        s.transactionNumber.toLowerCase().includes(search) || 
        (s.claimNumber || "").toLowerCase().includes(search) ||
        (s.customerName || "").toLowerCase().includes(search) || 
        s.cashierName.toLowerCase().includes(search)
      );
    }

    if (payment) {
      sales = sales.filter(s => s.paymentMethod === payment);
    }

    if (period !== "all") {
      const now = new Date();
      sales = sales.filter(s => {
        const d = new Date(s.createdAt);
        if (period === "today") return d.toDateString() === now.toDateString();
        if (period === "yesterday") {
          const y = new Date(); y.setDate(y.getDate() - 1);
          return d.toDateString() === y.toDateString();
        }
        if (period === "week") {
          const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
          return d >= weekAgo;
        }
        if (period === "month") {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }

    if (sales.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No sales found matching filter.</td></tr>`;
      return;
    }

    let html = "";
    sales.forEach(s => {
      const dateStr = new Date(s.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      });
      const itemsStr = s.items.map(it => `${it.quantity}${it.unit || 'pc'} ${it.productName}`).join(", ");
      const status = (s.laundryStatus || 'RECEIVED').replace(/_/g, ' ');

      html += `
        <tr>
          <td><small class="text-muted">${dateStr}</small></td>
          <td><b>${s.claimNumber || '#' + s.transactionNumber}</b></td>
          <td><b>${s.customerName || 'Walk-in'}</b></td>
          <td>${s.cashierName}</td>
          <td class="text-sm">${itemsStr}</td>
          <td><span class="badge-pill badge-active">${s.paymentMethod}</span></td>
          <td class="font-bold text-success">₱${s.total.toFixed(2)}</td>
          <td><span class="badge-pill badge-active">${status}</span></td>
          <td class="text-right">
            <button class="btn btn-secondary btn-sm" onclick="AdminPanel.viewPastReceipt('${s.id}')" title="Reprint Claim Stub">
              <i data-lucide="receipt"></i> Stub
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  viewPastReceipt(saleId) {
    const data = StorageManager.get();
    const sale = (data.sales || []).find(s => s.id === saleId);
    if (!sale) return;

    const modal = document.getElementById("modal-sale-success");
    const txnEl = document.getElementById("success-modal-txnid");
    const previewEl = document.getElementById("receipt-preview-content");

    if (txnEl) txnEl.textContent = sale.claimNumber || `#${sale.transactionNumber}`;
    if (previewEl) {
      previewEl.innerHTML = CashierPOS.generateReceiptHTML(sale);
    }

    CashierPOS.lastCompletedSale = sale;
    if (modal) modal.classList.add("active");
  },

  exportSalesCSV() {
    const data = StorageManager.get();
    const sales = data.sales || [];
    if (sales.length === 0) {
      App.showToast("No sales records to export.", "warning");
      return;
    }

    let csv = "Date,ClaimNumber,TxnNumber,CustomerName,CustomerPhone,Status,WeightKg,Cashier,Items,PaymentMethod,Subtotal,Discount,Total\n";
    sales.forEach(s => {
      const itemsList = s.items.map(it => `${it.quantity}${it.unit || 'pc'} ${it.productName}`).join("; ").replace(/"/g, '""');
      csv += `"${s.createdAt}","${s.claimNumber || ''}","${s.transactionNumber}","${s.customerName || ''}","${s.customerPhone || ''}","${s.laundryStatus || 'RECEIVED'}","${s.totalWeight || 0}","${s.cashierName}","${itemsList}","${s.paymentMethod}",${s.subtotal},${s.discount},${s.total}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laundry_sales_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    App.showToast("Exported sales to CSV.", "success");
  },

  /* =========================================================
     7. REPORTS & ANALYTICS TAB
     ========================================================= */
  renderReports() {
    const data = StorageManager.get();
    const sales = data.sales || [];
    const categories = data.categories || [];

    // Aggregate periods
    const now = new Date();
    const todayStr = now.toDateString();
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

    let salesToday = 0, countToday = 0;
    let salesWeek = 0, countWeek = 0;
    let salesMonth = 0, countMonth = 0;

    sales.forEach(s => {
      const d = new Date(s.createdAt);
      if (d.toDateString() === todayStr) { salesToday += s.total; countToday++; }
      if (d >= weekAgo) { salesWeek += s.total; countWeek++; }
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) { salesMonth += s.total; countMonth++; }
    });

    const avgOrder = sales.length > 0 ? (sales.reduce((sum, s) => sum + s.total, 0) / sales.length) : 0;

    document.getElementById("report-sales-today").textContent = `₱${salesToday.toFixed(2)}`;
    document.getElementById("report-orders-today").textContent = `${countToday} Orders`;
    document.getElementById("report-sales-week").textContent = `₱${salesWeek.toFixed(2)}`;
    document.getElementById("report-orders-week").textContent = `${countWeek} Orders`;
    document.getElementById("report-sales-month").textContent = `₱${salesMonth.toFixed(2)}`;
    document.getElementById("report-orders-month").textContent = `${countMonth} Orders`;
    document.getElementById("report-avg-order").textContent = `₱${avgOrder.toFixed(2)}`;

    // Build Chart.js charts
    this.renderCharts(sales, categories);
  },

  renderCharts(sales, categories) {
    if (typeof Chart === "undefined") return;

    // Destroy existing charts
    Object.values(this.charts).forEach(c => { if (c && typeof c.destroy === "function") c.destroy(); });
    this.charts = {};

    // 1. Revenue Trend Chart
    const trendCtx = document.getElementById("chart-revenue-trend")?.getContext("2d");
    if (trendCtx) {
      const dates = [];
      const revenueByDate = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const str = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dates.push(str);
        revenueByDate[str] = 0;
      }

      sales.forEach(s => {
        const dStr = new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (revenueByDate[dStr] !== undefined) {
          revenueByDate[dStr] += s.total;
        }
      });

      this.charts.trend = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: 'Daily Revenue (₱)',
            data: Object.values(revenueByDate),
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.15)',
            fill: true,
            tension: 0.35,
            borderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
    }

    // 2. Revenue by Laundry Category
    const catCtx = document.getElementById("chart-sales-category")?.getContext("2d");
    if (catCtx) {
      const catMap = {};
      categories.forEach(c => { catMap[c.id] = { name: c.name, revenue: 0 }; });

      const data = StorageManager.get();
      const prodMap = {};
      (data.products || []).forEach(p => { prodMap[p.id] = p.categoryId; });

      sales.forEach(s => {
        s.items.forEach(it => {
          const catId = prodMap[it.productId] || "cat-1";
          if (catMap[catId]) catMap[catId].revenue += it.subtotal;
        });
      });

      const labels = Object.values(catMap).map(c => c.name);
      const values = Object.values(catMap).map(c => c.revenue);

      this.charts.cat = new Chart(catCtx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: ['#0284c7', '#06b6d4', '#818cf8', '#10b981', '#f59e0b', '#ec4899']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }

    // 3. Payment Methods
    const payCtx = document.getElementById("chart-payment-methods")?.getContext("2d");
    if (payCtx) {
      const payMap = { CASH: 0, GCASH: 0, CARD: 0 };
      sales.forEach(s => {
        if (payMap[s.paymentMethod] !== undefined) payMap[s.paymentMethod] += s.total;
        else payMap.CASH += s.total;
      });

      this.charts.pay = new Chart(payCtx, {
        type: 'pie',
        data: {
          labels: ['CASH', 'GCASH', 'CARD / DEBIT'],
          datasets: [{
            data: [payMap.CASH, payMap.GCASH, payMap.CARD],
            backgroundColor: ['#10b981', '#0284c7', '#8b5cf6']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }

    // 4. Sales by Cashier
    const cashierCtx = document.getElementById("chart-sales-cashier")?.getContext("2d");
    if (cashierCtx) {
      const cashierMap = {};
      sales.forEach(s => {
        cashierMap[s.cashierName] = (cashierMap[s.cashierName] || 0) + s.total;
      });

      this.charts.cashier = new Chart(cashierCtx, {
        type: 'bar',
        data: {
          labels: Object.keys(cashierMap),
          datasets: [{
            label: 'Sales Revenue (₱)',
            data: Object.values(cashierMap),
            backgroundColor: '#0284c7',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
    }
  },

  /* =========================================================
     8. STAFF ACCOUNTS TAB
     ========================================================= */
  renderUsers() {
    const grid = document.getElementById("admin-users-grid");
    if (!grid) return;

    const data = StorageManager.get();
    const users = data.users || [];

    let html = "";
    users.forEach(u => {
      const initials = u.fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
      const isSelf = u.id === App.getCurrentUser()?.id;
      const isMaster = u.isMaster || u.id === "usr-admin";
      const isOwnerOrAdmin = isMaster || u.role === "ADMIN" || u.id === "usr-admin";
      const isOnlineNow = u.isOnline && u.lastHeartbeat && (Date.now() - u.lastHeartbeat < 45000);
      const isDisabled = u.status === "disabled";

      let deviceStatusBadge = "";
      if (isOwnerOrAdmin) {
        deviceStatusBadge = `<span class="badge badge-primary" style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; padding:2px 8px; border-radius:9999px; background:rgba(56, 189, 248, 0.15); border:1px solid rgba(56, 189, 248, 0.3); color:#38bdf8;"><i data-lucide="layers" style="width:11px; height:11px;"></i> Multi-Device</span>`;
      } else {
        deviceStatusBadge = isOnlineNow
          ? `<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; padding:2px 8px; border-radius:9999px; background:rgba(34, 197, 94, 0.15); border:1px solid rgba(34, 197, 94, 0.3); color:#22c55e;"><i data-lucide="radio" style="width:11px; height:11px;"></i> Active (1 Device)</span>`
          : `<span class="badge badge-secondary" style="font-size:0.75rem; padding:2px 8px; border-radius:9999px; background:rgba(148, 163, 184, 0.12); color:var(--text-muted);">Offline</span>`;
      }

      let statusBadge = "";
      if (isDisabled) {
        statusBadge = `<span class="badge badge-danger" style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; padding:2px 8px; border-radius:9999px; background:rgba(239, 68, 68, 0.15); border:1px solid rgba(239, 68, 68, 0.3); color:#ef4444;"><i data-lucide="user-x" style="width:11px; height:11px;"></i> Disabled</span>`;
      } else {
        statusBadge = `<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; padding:2px 8px; border-radius:9999px; background:rgba(16, 185, 129, 0.15); border:1px solid rgba(16, 185, 129, 0.3); color:#10b981;"><i data-lucide="user-check" style="width:11px; height:11px;"></i> Active</span>`;
      }

      let autoDisableNotice = "";
      if (!isOwnerOrAdmin) {
        if (isDisabled && u.autoDisableReason) {
          autoDisableNotice = `<div style="font-size:0.72rem; color:var(--warning, #f59e0b); display:flex; align-items:center; gap:4px; margin-top:3px;" title="${u.autoDisableReason}"><i data-lucide="alert-circle" style="width:11px; height:11px; flex-shrink:0;"></i> <span>${u.autoDisableReason}</span></div>`;
        } else if (!isDisabled && u.autoDisableEnabled) {
          if (u.autoDisableType === "daily") {
            const formatTime12 = (tStr) => {
              try {
                const parts = (tStr || "00:00").split(":").map(Number);
                const h = parts[0];
                const m = parts[1] || 0;
                const ampm = h >= 12 ? "PM" : "AM";
                const h12 = h % 12 || 12;
                return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
              } catch (e) {
                return tStr;
              }
            };
            const inFormatted = formatTime12(u.autoDisableDailyIn || "08:00");
            const outFormatted = formatTime12(u.autoDisableDailyOut || u.autoDisableDailyTime || "17:00");
            autoDisableNotice = `<div style="font-size:0.72rem; color:#38bdf8; display:flex; align-items:center; gap:4px; margin-top:3px;"><i data-lucide="clock" style="width:11px; height:11px; flex-shrink:0;"></i> <span>Daily Shift: ${inFormatted} - ${outFormatted}</span></div>`;
          } else if (u.autoDisableAt) {
            const d = new Date(u.autoDisableAt);
            const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            autoDisableNotice = `<div style="font-size:0.72rem; color:#38bdf8; display:flex; align-items:center; gap:4px; margin-top:3px;"><i data-lucide="timer" style="width:11px; height:11px; flex-shrink:0;"></i> <span>Auto-off: ${dateStr} ${timeStr}</span></div>`;
          }
        }
      }

      html += `
        <div class="user-account-card ${isMaster ? 'master-admin-card' : ''} ${isDisabled ? 'account-disabled' : ''}">
          <div class="user-card-header">
            <div class="user-card-avatar ${isMaster ? 'gold' : ''}">${initials}</div>
            <div class="user-card-info">
              <div class="user-card-title-row">
                <h4 class="user-card-name">${u.fullName}</h4>
                ${isMaster ? `<span class="mother-badge"><i data-lucide="crown" style="width:11px; height:11px;"></i> Mother Account</span>` : ''}
              </div>
              <span class="user-card-username">@${u.username}</span>
            </div>
          </div>
          <div class="user-card-body">
            <div class="user-meta-row">
              <span class="user-meta-label">Role:</span>
              <span class="role-badge ${u.role.toLowerCase()}">${u.role}</span>
            </div>
            <div class="user-meta-row">
              <span class="user-meta-label">Status:</span>
              ${statusBadge}
            </div>
            <div class="user-meta-row">
              <span class="user-meta-label">Device:</span>
              ${deviceStatusBadge}
            </div>
            ${autoDisableNotice}
          </div>
          <div class="user-card-footer">
            <button type="button" class="btn btn-secondary btn-sm" onclick="AdminPanel.editUser('${u.id}')">
              <i data-lucide="edit-3"></i> Edit
            </button>
            ${!isOwnerOrAdmin && !isSelf ? `
              ${isDisabled ? `
                <button type="button" class="btn btn-success btn-sm" onclick="AdminPanel.quickToggleUserStatus('${u.id}', 'active')" title="Enable staff account access">
                  <i data-lucide="user-check"></i> Enable
                </button>
              ` : `
                <button type="button" class="btn btn-secondary btn-sm" onclick="AdminPanel.quickToggleUserStatus('${u.id}', 'disabled')" title="Disable staff account">
                  <i data-lucide="user-x"></i> Disable
                </button>
              `}
            ` : ''}
            ${!isOwnerOrAdmin && isOnlineNow && !isSelf ? `
              <button type="button" class="btn btn-warning btn-sm" onclick="AdminPanel.forceDisconnectUser('${u.id}', '${u.fullName.replace(/'/g, "\\'")}')" title="Disconnect device to free login">
                <i data-lucide="log-out"></i> Free Device
              </button>
            ` : ''}
            ${isMaster 
              ? `<div class="locked-badge" style="grid-column: span 2; justify-content: center; width: 100%;"><i data-lucide="shield-check" style="width:13px; height:13px; color:var(--warning);"></i> Protected Root</div>` 
              : (!isSelf 
                ? `<button type="button" class="btn btn-danger btn-sm" onclick="AdminPanel.confirmDeleteUser('${u.id}')"><i data-lucide="trash-2"></i> Delete</button>` 
                : `<div class="text-muted font-italic text-center" style="grid-column: span 2; font-size: 0.8rem; padding: 4px; width: 100%;">Active Session</div>`
              )
            }
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  async quickToggleUserStatus(userId, newStatus) {
    const data = StorageManager.get();
    const user = (data.users || []).find(u => u.id === userId);
    if (!user) return;

    try {
      await StorageManager.updateUser(userId, { status: newStatus });
      this.renderUsers();
      Sound.playSuccess();
      App.showToast(`Account for ${user.fullName} is now ${newStatus}.`, "success");
    } catch (err) {
      console.error("Quick toggle user status error:", err);
      Sound.playError();
      App.showToast(`Error: ${err.message || 'Failed to update user status.'}`, "danger");
    }
  },

  forceDisconnectUser(userId, userName) {
    App.showConfirmModal(
      `Free Device for ${userName}?`,
      "This will immediately disconnect the active device session for this account so they can log in from another device.",
      async () => {
        try {
          await StorageManager.forceDisconnectUser(userId);
          this.renderUsers();
          Sound.playSuccess();
          App.showToast(`Device session freed for ${userName}.`, "success");
        } catch (err) {
          console.error("Force disconnect error:", err);
          Sound.playError();
          App.showToast(`Error: ${err.message || 'Failed to disconnect session.'}`, "danger");
        }
      }
    );
  },

  toggleAutoDisableFields(enable) {
    const fields = document.getElementById("user-autodisable-fields");
    if (fields) {
      fields.style.display = enable ? "flex" : "none";
    }
  },

  handleAutoDisableTypeChange(type) {
    const dtGroup = document.getElementById("user-autodisable-datetime-group");
    const dailyGroup = document.getElementById("user-autodisable-daily-group");
    if (dtGroup) dtGroup.style.display = (type === "datetime") ? "block" : "none";
    if (dailyGroup) dailyGroup.style.display = (type === "daily") ? "block" : "none";
  },

  presetAutoDisable(preset) {
    const dtInput = document.getElementById("user-autodisable-datetime");
    if (!dtInput) return;

    const now = new Date();
    if (typeof preset === "number") {
      now.setHours(now.getHours() + preset);
    } else if (preset === "today-10pm") {
      now.setHours(22, 0, 0, 0);
    } else if (preset === "tomorrow-10pm") {
      now.setDate(now.getDate() + 1);
      now.setHours(22, 0, 0, 0);
    }

    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    dtInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  },

  openUserModal(isEdit = false, isMaster = false) {
    const modal = document.getElementById("modal-user-form");
    const title = document.getElementById("user-modal-title");
    const pwdHelp = document.getElementById("user-pwd-help");
    const pwdInput = document.getElementById("user-password");
    const roleSelect = document.getElementById("user-role");
    const statusSelect = document.getElementById("user-status");
    const autoDisableSection = document.getElementById("user-auto-disable-section");
    const autoDisableEnable = document.getElementById("user-autodisable-enable");
    const autoDisableNotice = document.getElementById("user-autodisable-info");

    if (title) {
      if (isMaster) title.textContent = "Edit Master Account (Owner)";
      else title.textContent = isEdit ? "Edit Staff Account" : "Add Staff Account";
    }
    if (pwdHelp) pwdHelp.style.display = isEdit ? "block" : "none";
    if (pwdInput) pwdInput.required = !isEdit;

    // Lock role, status, and auto-disable for Master Admin
    if (roleSelect) {
      roleSelect.disabled = isMaster;
      if (isMaster) roleSelect.value = "ADMIN";
    }
    if (statusSelect) {
      statusSelect.disabled = isMaster;
      if (isMaster) statusSelect.value = "active";
    }
    if (autoDisableSection) {
      autoDisableSection.style.display = isMaster ? "none" : "block";
    }

    if (!isEdit) {
      document.getElementById("user-form").reset();
      document.getElementById("user-id").value = "";
      if (roleSelect) roleSelect.disabled = false;
      if (statusSelect) statusSelect.disabled = false;
      if (autoDisableEnable) {
        autoDisableEnable.checked = false;
        this.toggleAutoDisableFields(false);
      }
      if (autoDisableNotice) autoDisableNotice.style.display = "none";
    }

    if (modal) modal.classList.add("active");
    if (window.lucide) lucide.createIcons();
  },

  closeUserModal() {
    const modal = document.getElementById("modal-user-form");
    if (modal) modal.classList.remove("active");
  },

  editUser(id) {
    const data = StorageManager.get();
    const u = (data.users || []).find(user => user.id === id);
    if (!u) return;

    const isMaster = u.isMaster || u.id === "usr-admin";
    this.openUserModal(true, isMaster);
    document.getElementById("user-id").value = u.id;
    document.getElementById("user-fullname").value = u.fullName;
    document.getElementById("user-username").value = u.username;
    document.getElementById("user-password").value = "";
    document.getElementById("user-role").value = u.role;
    document.getElementById("user-status").value = u.status;

    // Auto-disable configuration
    const enableCheckbox = document.getElementById("user-autodisable-enable");
    const typeSelect = document.getElementById("user-autodisable-type");
    const dtInput = document.getElementById("user-autodisable-datetime");
    const dailyInInput = document.getElementById("user-autodisable-daily-in");
    const dailyOutInput = document.getElementById("user-autodisable-daily-out");
    const notice = document.getElementById("user-autodisable-info");

    const isAutoDisableActive = !!u.autoDisableEnabled;
    if (enableCheckbox) enableCheckbox.checked = isAutoDisableActive;
    this.toggleAutoDisableFields(isAutoDisableActive);

    const type = u.autoDisableType || "datetime";
    if (typeSelect) typeSelect.value = type;
    this.handleAutoDisableTypeChange(type);

    if (dtInput) {
      if (u.autoDisableAt) {
        // Parse ISO or formatted date to datetime-local
        try {
          const d = new Date(u.autoDisableAt);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const hours = String(d.getHours()).padStart(2, "0");
          const minutes = String(d.getMinutes()).padStart(2, "0");
          dtInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        } catch (e) {
          dtInput.value = u.autoDisableAt;
        }
      } else {
        dtInput.value = "";
      }
    }

    if (dailyInInput) {
      dailyInInput.value = u.autoDisableDailyIn || "08:00";
    }
    if (dailyOutInput) {
      dailyOutInput.value = u.autoDisableDailyOut || u.autoDisableDailyTime || "17:00";
    }

    if (notice) {
      if (u.status === "disabled" && u.autoDisableReason) {
        notice.textContent = `Current status: Disabled (${u.autoDisableReason})`;
        notice.style.display = "block";
      } else {
        notice.style.display = "none";
      }
    }
  },

  async saveUser(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn ? btn.innerHTML : "Save Staff Member";
    
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Saving to Database...`;
        if (window.lucide) lucide.createIcons();
      }

      const data = StorageManager.get();
      const userId = document.getElementById("user-id").value;
      const pwd = document.getElementById("user-password").value;

      const isMaster = userId === "usr-admin" || (userId && (data.users.find(u => u.id === userId)?.isMaster));
      const autoDisableEnabled = !isMaster && (document.getElementById("user-autodisable-enable")?.checked || false);
      const autoDisableType = document.getElementById("user-autodisable-type")?.value || "datetime";
      const autoDisableAt = document.getElementById("user-autodisable-datetime")?.value || null;
      const autoDisableDailyIn = document.getElementById("user-autodisable-daily-in")?.value || "08:00";
      const autoDisableDailyOut = document.getElementById("user-autodisable-daily-out")?.value || "17:00";

      const payload = {
        id: userId || "usr-" + Date.now(),
        fullName: document.getElementById("user-fullname").value.trim(),
        username: document.getElementById("user-username").value.trim().toLowerCase(),
        role: isMaster ? "ADMIN" : document.getElementById("user-role").value,
        status: isMaster ? "active" : document.getElementById("user-status").value,
        isMaster: !!isMaster,
        autoDisableEnabled: autoDisableEnabled,
        autoDisableType: autoDisableType,
        autoDisableAt: autoDisableAt,
        autoDisableDailyIn: autoDisableDailyIn,
        autoDisableDailyOut: autoDisableDailyOut,
        autoDisableDailyTime: autoDisableDailyOut,
        createdAt: new Date().toISOString()
      };

      // Check shift window immediately if daily auto-disable is active
      if (autoDisableEnabled && autoDisableType === "daily" && !isMaster) {
        const now = new Date();
        const currMins = now.getHours() * 60 + now.getMinutes();
        const inParts = autoDisableDailyIn.split(":").map(Number);
        const outParts = autoDisableDailyOut.split(":").map(Number);
        const inMins = (inParts[0] || 0) * 60 + (inParts[1] || 0);
        const outMins = (outParts[0] || 0) * 60 + (outParts[1] || 0);
        let isWithin = inMins <= outMins ? (currMins >= inMins && currMins < outMins) : (currMins >= inMins || currMins < outMins);
        
        const formatTime12 = (tStr) => {
          try {
            const p = (tStr || "00:00").split(":").map(Number);
            const h = p[0];
            const ampm = h >= 12 ? "PM" : "AM";
            const h12 = h % 12 || 12;
            return `${String(h12).padStart(2, "0")}:${String(p[1] || 0).padStart(2, "0")} ${ampm}`;
          } catch (e) { return tStr; }
        };

        if (!isWithin) {
          payload.status = "disabled";
          payload.autoDisableReason = `Outside daily shift window (${formatTime12(autoDisableDailyIn)} - ${formatTime12(autoDisableDailyOut)})`;
          payload.autoDisabledAt = now.toISOString();
        } else {
          payload.autoDisableReason = null;
          payload.autoDisabledAt = null;
        }
      }

      if (userId) {
        const existing = data.users.find(u => u.id === userId);
        if (existing) {
          payload.password = pwd ? pwd : existing.password;
          payload.createdAt = existing.createdAt;
        }
        await StorageManager.updateUser(userId, payload);
      } else {
        payload.password = pwd || "123456";
        await StorageManager.addUser(payload);
      }

      this.closeUserModal();
      this.renderUsers();
      Sound.playSuccess();
      App.showToast(`Saved staff account: ${payload.fullName}`, "success");
    } catch (err) {
      console.error("Save user error:", err);
      Sound.playError();
      App.showToast(`Database Error: ${err.message || 'Failed to save account to database.'}`, "danger");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  confirmDeleteUser(id) {
    const data = StorageManager.get();
    const u = (data.users || []).find(user => user.id === id);
    if (!u) return;

    if (u.isMaster || u.id === "usr-admin" || u.role === "ADMIN") {
      Sound.playError();
      App.showToast("The Mother Admin account is the permanent root account and cannot be deleted.", "danger");
      return;
    }

    App.showConfirmModal(
      `Delete User "${u.fullName}"?`,
      "This staff member will be permanently removed from the Railway database.",
      async () => {
        try {
          await StorageManager.deleteUser(id);
          this.renderUsers();
          Sound.playSuccess();
          App.showToast(`Deleted staff account: ${u.fullName}`, "info");
        } catch (err) {
          console.error("Delete user error:", err);
          Sound.playError();
          App.showToast(`Database Error: ${err.message || 'Failed to delete from database.'}`, "danger");
        }
      }
    );
  },

  /* =========================================================
     9. STAFF ATTENDANCE & TIMESHEETS
     ========================================================= */
  renderAttendance() {
    const data = StorageManager.get();
    const allUsers = data.users || [];
    // Focus strictly on staff/employees (exclude ADMIN accounts)
    const users = allUsers.filter(u => u.role !== "ADMIN");
    const allAttendance = (data.attendance || []).filter(a => a.userRole !== "ADMIN");

    // Ensure attendanceMonth is set
    if (!this.attendanceMonth) {
      const now = new Date();
      this.attendanceMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // Populate Staff Filter Dropdown
    const staffSelect = document.getElementById("admin-attendance-staff-filter");
    if (staffSelect) {
      const currentVal = staffSelect.value || this.attendanceStaffFilter || "ALL";
      let optHtml = `<option value="ALL">All Staff Members (${users.length})</option>`;
      if (users.length === 0) {
        optHtml = `<option value="ALL">All Staff Members (0)</option>`;
      }
      users.forEach(u => {
        optHtml += `<option value="${u.id}">${u.fullName} (${u.role})</option>`;
      });
      staffSelect.innerHTML = optHtml;
      staffSelect.value = currentVal;
    }

    // Update Month Label in Toolbar
    const [yearStr, monthStr] = this.attendanceMonth.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1; // 0-indexed
    const monthDate = new Date(year, month, 1);
    const monthLabelEl = document.getElementById("attendance-month-label");
    if (monthLabelEl) {
      monthLabelEl.textContent = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    const matrixTitleEl = document.getElementById("matrix-table-title");
    if (matrixTitleEl) {
      matrixTitleEl.textContent = `Staff Timesheet Matrix — ${monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
    }

    // Filter by selected month: a.date starts with "YYYY-MM"
    const monthPrefix = this.attendanceMonth;
    const monthRecords = allAttendance.filter(a => a.date && a.date.startsWith(monthPrefix));

    // Calculate Monthly KPIs
    const totalShifts = monthRecords.length;
    const totalMinutes = monthRecords.reduce((sum, a) => sum + (a.totalMinutes || 0), 0);
    const avgMinutes = totalShifts > 0 ? Math.round(totalMinutes / totalShifts) : 0;

    // Active now across all records
    const activeStaff = allAttendance.filter(a => a.status === "CLOCKED_IN");
    const activeStaffCount = activeStaff.length;

    // Update KPIs
    const kpiShifts = document.getElementById("att-kpi-total-shifts");
    const kpiShiftsSub = document.getElementById("att-kpi-shifts-subtext");
    const kpiHours = document.getElementById("att-kpi-total-hours");
    const kpiHoursSub = document.getElementById("att-kpi-hours-subtext");
    const kpiAvg = document.getElementById("att-kpi-avg-shift");
    const kpiActive = document.getElementById("att-kpi-active-now");
    const kpiActiveNames = document.getElementById("att-kpi-active-staff-names");
    const sidebarBadge = document.getElementById("sidebar-active-attendance-count");

    if (kpiShifts) kpiShifts.textContent = totalShifts;
    if (kpiShiftsSub) kpiShiftsSub.textContent = `${activeStaffCount} active today`;
    if (kpiHours) kpiHours.textContent = typeof AttendanceManager !== "undefined" ? AttendanceManager.formatDuration(totalMinutes) : `${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m`;
    if (kpiHoursSub) kpiHoursSub.textContent = `Across ${totalShifts} shift logs`;
    if (kpiAvg) kpiAvg.textContent = typeof AttendanceManager !== "undefined" ? AttendanceManager.formatDuration(avgMinutes) : `${Math.floor(avgMinutes/60)}h`;
    if (kpiActive) kpiActive.textContent = activeStaffCount;
    if (kpiActiveNames) {
      if (activeStaffCount > 0) {
        kpiActiveNames.textContent = activeStaff.map(a => a.userName).join(", ");
      } else {
        kpiActiveNames.textContent = "No staff clocked in right now";
      }
    }
    if (sidebarBadge) {
      sidebarBadge.textContent = activeStaffCount;
      sidebarBadge.style.display = activeStaffCount > 0 ? "inline-flex" : "none";
    }

    // Apply Staff and Status Filters for table/matrix display
    const selectedStaff = document.getElementById("admin-attendance-staff-filter")?.value || "ALL";
    const selectedStatus = document.getElementById("admin-attendance-status-filter")?.value || "ALL";

    let filteredRecords = monthRecords;
    if (selectedStaff !== "ALL") {
      filteredRecords = filteredRecords.filter(a => a.userId === selectedStaff);
    }
    if (selectedStatus !== "ALL") {
      filteredRecords = filteredRecords.filter(a => a.status === selectedStatus);
    }

    // Render Table and Matrix views
    this.renderAttendanceTable(filteredRecords);
    this.renderAttendanceMatrix(monthRecords, users, year, month);

    if (window.lucide) lucide.createIcons();
  },

  changeAttendanceMonth(delta) {
    if (!this.attendanceMonth) {
      const now = new Date();
      this.attendanceMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    const [y, m] = this.attendanceMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    this.attendanceMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.renderAttendance();
  },

  switchAttendanceView(mode) {
    this.attendanceViewMode = mode;
    const tableContainer = document.getElementById("attendance-table-container");
    const matrixContainer = document.getElementById("attendance-matrix-container");
    const btnTable = document.getElementById("btn-att-table-view");
    const btnMatrix = document.getElementById("btn-att-matrix-view");

    if (mode === "table") {
      if (tableContainer) tableContainer.style.display = "block";
      if (matrixContainer) matrixContainer.style.display = "none";
      if (btnTable) btnTable.classList.add("active");
      if (btnMatrix) btnMatrix.classList.remove("active");
    } else {
      if (tableContainer) tableContainer.style.display = "none";
      if (matrixContainer) matrixContainer.style.display = "block";
      if (btnTable) btnTable.classList.remove("active");
      if (btnMatrix) btnMatrix.classList.add("active");
    }
    if (window.lucide) lucide.createIcons();
  },

  filterAttendance() {
    this.renderAttendance();
  },

  renderAttendanceTable(records) {
    const tbody = document.getElementById("admin-attendance-tbody");
    if (!tbody) return;

    if (records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-5 text-muted">
            <i data-lucide="calendar-x" style="width:36px; height:36px; stroke-width:1.5; margin-bottom:8px; display:inline-block;"></i>
            <p>No attendance logs found for the selected month and filter criteria.</p>
          </td>
        </tr>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Sort descending by date and timeIn
    const sorted = [...records].sort((a, b) => new Date(b.timeIn || b.date) - new Date(a.timeIn || a.date));

    let html = "";
    sorted.forEach(r => {
      const d = new Date(r.date + "T00:00:00");
      const dateFormatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", weekday: "short" });

      const timeInFmt = r.timeIn ? new Date(r.timeIn).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }) : "--";

      let timeOutFmt = "--";
      if (r.status === "CLOCKED_IN") {
        timeOutFmt = `<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:4px;"><i data-lucide="radio" style="width:12px; height:12px;"></i> Currently Clocked In</span>`;
      } else if (r.timeOut) {
        timeOutFmt = new Date(r.timeOut).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
      }

      let durationFmt = r.totalHoursFormatted || "--";
      if (r.status === "CLOCKED_IN" && r.timeIn) {
        const liveMins = Math.max(1, Math.round((new Date() - new Date(r.timeIn)) / 60000));
        durationFmt = `<span class="text-success" style="font-weight:700;">${AttendanceManager.formatDuration(liveMins)} (Live)</span>`;
      }

      const statusBadge = r.status === "CLOCKED_IN"
        ? `<span class="badge badge-success">ACTIVE</span>`
        : `<span class="badge badge-secondary">COMPLETED</span>`;

      const initials = (r.userName || "U").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

      html += `
        <tr>
          <td><strong>${dateFormatted}</strong></td>
          <td>
            <div class="table-user-cell" style="display:flex; align-items:center; gap:8px;">
              <div class="avatar-circle small" style="width:30px; height:30px; font-size:0.75rem;">${initials}</div>
              <div>
                <strong>${r.userName}</strong>
              </div>
            </div>
          </td>
          <td><span class="role-badge ${(r.userRole || '').toLowerCase()}">${r.userRole || 'STAFF'}</span></td>
          <td><span class="font-mono text-muted"><i data-lucide="log-in" style="width:13px; height:13px; vertical-align:middle;"></i> ${timeInFmt}</span></td>
          <td><span class="font-mono text-muted">${timeOutFmt}</span></td>
          <td><strong>${durationFmt}</strong></td>
          <td>${statusBadge}</td>
          <td><small class="text-muted">${r.notes || "—"}</small></td>
          <td class="text-right">
            <div class="table-actions-flex">
              ${r.status === "CLOCKED_IN" ? `
                <button type="button" class="btn btn-warning btn-sm" onclick="AdminPanel.manualClockOut('${r.id}')" title="Force Time-Out Now">
                  <i data-lucide="log-out"></i> Time-Out
                </button>
              ` : ''}
              <button type="button" class="btn btn-secondary btn-sm" onclick="AdminPanel.openAttendanceModal('${r.id}')" title="Edit Punch Log">
                <i data-lucide="edit-2"></i>
              </button>
              <button type="button" class="btn btn-danger btn-sm" onclick="AdminPanel.confirmDeleteAttendance('${r.id}')" title="Delete Log">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  renderAttendanceMatrix(records, users, year, month) {
    const thead = document.getElementById("admin-attendance-matrix-thead");
    const tbody = document.getElementById("admin-attendance-matrix-tbody");
    if (!thead || !tbody) return;

    const totalDays = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const currentDay = today.getDate();

    // Generate Thead with all month days
    let thHtml = `<tr><th style="min-width:180px; position:sticky; left:0; z-index:2; background:var(--bg-surface);">Staff Member</th>`;
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      const dayName = d.toLocaleDateString("en-US", { weekday: "narrow" });
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const isToday = isCurrentMonth && day === currentDay;
      const thStyle = isToday ? 'background:rgba(2,132,199,0.25); color:var(--primary); font-weight:bold;' : (isWeekend ? 'opacity:0.75;' : '');

      thHtml += `<th class="text-center" style="min-width:38px; padding:6px 2px; ${thStyle}" title="${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}">
        <div style="font-size:0.7rem;">${dayName}</div>
        <div>${day}</div>
      </th>`;
    }
    thHtml += `<th class="text-center" style="min-width:70px;">Days</th><th class="text-center" style="min-width:85px;">Total Hrs</th></tr>`;
    thead.innerHTML = thHtml;

    // Filter staff if a specific staff filter is active (focus strictly on staff)
    const selectedStaff = document.getElementById("admin-attendance-staff-filter")?.value || "ALL";
    const staffList = (selectedStaff === "ALL" ? users : users.filter(u => u.id === selectedStaff)).filter(u => u.role !== "ADMIN");

    if (staffList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${totalDays + 3}" class="text-center py-5 text-muted">
        <i data-lucide="users" style="width:36px; height:36px; stroke-width:1.5; margin-bottom:8px; display:inline-block;"></i>
        <p style="margin:0 0 10px;">No staff members registered yet.</p>
        <button type="button" class="btn btn-primary btn-sm" onclick="AdminPanel.switchTab('cashiers')">
          <i data-lucide="user-plus"></i> Add Staff Member
        </button>
      </td></tr>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    let tbHtml = "";
    staffList.forEach(u => {
      const userRecords = records.filter(r => r.userId === u.id);
      const initials = (u.fullName || "U").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

      let totalStaffMinutes = 0;
      let daysPresentCount = 0;

      let daysCells = "";
      for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayLogs = userRecords.filter(r => r.date === dateStr);
        const isToday = isCurrentMonth && day === currentDay;

        if (dayLogs.length > 0) {
          daysPresentCount++;
          const dayMins = dayLogs.reduce((sum, l) => sum + (l.totalMinutes || 0), 0);
          totalStaffMinutes += dayMins;
          const hasActive = dayLogs.some(l => l.status === "CLOCKED_IN");

          const hrsDecimal = (dayMins / 60).toFixed(1);
          const cellBadgeBg = hasActive ? "var(--success)" : "var(--primary)";
          const timeInStr = dayLogs[0].timeIn ? new Date(dayLogs[0].timeIn).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
          const timeOutStr = dayLogs[0].timeOut ? new Date(dayLogs[0].timeOut).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : (hasActive ? 'Active' : '');

          daysCells += `<td class="text-center" style="padding:4px 2px; ${isToday ? 'background:rgba(2,132,199,0.1);' : ''}">
            <span class="matrix-cell-pill" style="display:inline-block; font-size:0.7rem; font-weight:700; padding:2px 4px; border-radius:4px; background:${cellBadgeBg}; color:#fff; cursor:help;" title="${dateStr}: ${timeInStr} - ${timeOutStr} (${AttendanceManager.formatDuration(dayMins)})">
              ${hrsDecimal}h
            </span>
          </td>`;
        } else {
          daysCells += `<td class="text-center text-muted" style="padding:4px 2px; font-size:0.7rem; ${isToday ? 'background:rgba(2,132,199,0.05);' : ''}">
            <span style="opacity:0.25;">—</span>
          </td>`;
        }
      }

      const totalHrsDecimal = (totalStaffMinutes / 60).toFixed(1);

      tbHtml += `<tr>
        <td style="position:sticky; left:0; z-index:1; background:var(--bg-surface); font-weight:600;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="avatar-circle small" style="width:26px; height:26px; font-size:0.7rem;">${initials}</div>
            <div>
              <div>${u.fullName}</div>
              <small class="text-muted" style="font-size:0.7rem;">${u.role}</small>
            </div>
          </div>
        </td>
        ${daysCells}
        <td class="text-center font-weight-bold"><span class="badge badge-secondary">${daysPresentCount} d</span></td>
        <td class="text-center font-weight-bold text-primary">${totalHrsDecimal} hrs</td>
      </tr>`;
    });

    tbody.innerHTML = tbHtml;
  },

  openAttendanceModal(recordId = null) {
    const modal = document.getElementById("modal-attendance");
    const title = document.getElementById("attendance-modal-title");
    const userSelect = document.getElementById("att-user-select");
    const form = document.getElementById("form-attendance");

    if (form) form.reset();

    // Populate staff dropdown
    const data = StorageManager.get();
    const users = data.users || [];
    if (userSelect) {
      userSelect.innerHTML = users.map(u => `<option value="${u.id}">${u.fullName} (${u.role})</option>`).join("");
    }

    if (recordId) {
      if (title) title.textContent = "Edit Staff Attendance Punch";
      const record = (data.attendance || []).find(a => a.id === recordId);
      if (record) {
        document.getElementById("att-record-id").value = record.id;
        if (userSelect) userSelect.value = record.userId;
        document.getElementById("att-date-input").value = record.date;
        if (record.timeIn) {
          const tIn = new Date(record.timeIn);
          document.getElementById("att-timein-input").value = `${String(tIn.getHours()).padStart(2, '0')}:${String(tIn.getMinutes()).padStart(2, '0')}`;
        }
        if (record.timeOut) {
          const tOut = new Date(record.timeOut);
          document.getElementById("att-timeout-input").value = `${String(tOut.getHours()).padStart(2, '0')}:${String(tOut.getMinutes()).padStart(2, '0')}`;
        } else {
          document.getElementById("att-timeout-input").value = "";
        }
        document.getElementById("att-notes-input").value = record.notes || "";
      }
    } else {
      if (title) title.textContent = "Record Staff Attendance Log";
      document.getElementById("att-record-id").value = "";
      document.getElementById("att-date-input").value = AttendanceManager.getLocalDateString();
      const now = new Date();
      document.getElementById("att-timein-input").value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      document.getElementById("att-timeout-input").value = "";
      document.getElementById("att-notes-input").value = "Manual entry by Admin";
    }

    if (modal) modal.classList.add("active");
    if (window.lucide) lucide.createIcons();
  },

  closeAttendanceModal() {
    const modal = document.getElementById("modal-attendance");
    if (modal) modal.classList.remove("active");
  },

  saveAttendanceForm(e) {
    e.preventDefault();
    const data = StorageManager.get();
    const recordId = document.getElementById("att-record-id").value;
    const userId = document.getElementById("att-user-select").value;
    const dateStr = document.getElementById("att-date-input").value;
    const timeInVal = document.getElementById("att-timein-input").value;
    const timeOutVal = document.getElementById("att-timeout-input").value;
    const notesVal = document.getElementById("att-notes-input").value.trim();

    const user = (data.users || []).find(u => u.id === userId);
    if (!user) return;

    const timeInIso = new Date(`${dateStr}T${timeInVal}:00`).toISOString();
    let timeOutIso = null;
    if (timeOutVal) {
      timeOutIso = new Date(`${dateStr}T${timeOutVal}:00`).toISOString();
    }

    const payload = {
      id: recordId || undefined,
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      date: dateStr,
      timeIn: timeInIso,
      timeOut: timeOutIso,
      notes: notesVal || (recordId ? "Manually edited by Admin" : "Manual entry by Admin")
    };

    AttendanceManager.saveRecord(payload);
    this.closeAttendanceModal();
    this.renderAttendance();
    App.showToast(`Attendance saved for ${user.fullName}`, "success");
  },

  manualClockOut(recordId) {
    const data = StorageManager.get();
    const record = (data.attendance || []).find(a => a.id === recordId);
    if (!record) return;

    record.timeOut = new Date().toISOString();
    record.status = "COMPLETED";
    record.timedOutByAdmin = true;
    const diffMs = new Date(record.timeOut) - new Date(record.timeIn);
    record.totalMinutes = Math.max(1, Math.round(diffMs / 60000));
    record.totalHoursFormatted = AttendanceManager.formatDuration(record.totalMinutes);
    record.notes = (record.notes ? record.notes + " • " : "") + "Admin Time-Out (Session Ended)";

    StorageManager.save(data);
    this.renderAttendance();
    Sound.playSuccess();
    App.showToast(`Clocked out ${record.userName}. Account logged out from active device.`, "info");
  },

  confirmDeleteAttendance(recordId) {
    App.showConfirmModal(
      "Delete Attendance Log?",
      "Are you sure you want to remove this attendance record?",
      () => {
        AttendanceManager.deleteRecord(recordId);
        this.renderAttendance();
        App.showToast("Attendance record deleted.", "info");
      }
    );
  },

  exportAttendanceCSV() {
    const data = StorageManager.get();
    const allAttendance = data.attendance || [];
    const monthPrefix = this.attendanceMonth || new Date().toISOString().slice(0, 7);
    const records = allAttendance.filter(a => a.date && a.date.startsWith(monthPrefix));

    if (records.length === 0) {
      App.showToast("No records to export for this month.", "warning");
      return;
    }

    let csv = "Date,Staff Name,User Role,Time In,Time Out,Total Minutes,Total Hours,Status,Notes\n";
    records.forEach(r => {
      const tIn = r.timeIn ? new Date(r.timeIn).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : "";
      const tOut = r.timeOut ? new Date(r.timeOut).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : (r.status === "CLOCKED_IN" ? "Clocked In" : "");
      csv += `"${r.date}","${r.userName}","${r.userRole}","${tIn}","${tOut}",${r.totalMinutes || 0},"${r.totalHoursFormatted || ''}","${r.status}","${(r.notes || '').replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `staff_attendance_${monthPrefix}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    App.showToast(`Exported timesheet for ${monthPrefix}`, "success");
  },

  /* =========================================================
     10. STORE SETTINGS TAB
     ========================================================= */
  loadStoreSettings() {
    const data = StorageManager.get();
    const s = data.settings || {};

    document.getElementById("setting-store-name").value = s.storeName || "Brand Name POS";
    document.getElementById("setting-tagline").value = s.tagline || "Professional Laundry • Dry Cleaning";
    document.getElementById("setting-store-address").value = s.address || "";
    document.getElementById("setting-store-contact").value = s.contact || "";
    document.getElementById("setting-claim-prefix").value = s.claimPrefix || "LND-2026-";
    document.getElementById("setting-turnaround-hours").value = s.defaultTurnaroundHours || 48;
    document.getElementById("setting-tax-rate").value = s.taxRate !== undefined ? s.taxRate : 12;
    document.getElementById("setting-receipt-footer").value = s.receiptFooter || "Maraming Salamat! Keep this stub safe.";
  },

  saveStoreSettings(e) {
    e.preventDefault();
    const data = StorageManager.get();
    data.settings = {
      storeName: document.getElementById("setting-store-name").value.trim(),
      tagline: document.getElementById("setting-tagline").value.trim(),
      address: document.getElementById("setting-store-address").value.trim(),
      contact: document.getElementById("setting-store-contact").value.trim(),
      claimPrefix: document.getElementById("setting-claim-prefix").value.trim(),
      defaultTurnaroundHours: parseInt(document.getElementById("setting-turnaround-hours").value) || 48,
      taxRate: parseFloat(document.getElementById("setting-tax-rate").value) || 12,
      receiptFooter: document.getElementById("setting-receipt-footer").value.trim()
    };

    StorageManager.save(data);
    App.updateBrandDisplay();
    App.showToast("✓ Store settings updated successfully.", "success");
  },

  exportBackupJSON() {
    StorageManager.exportJSON();
    App.showToast("Database exported.", "success");
  },

  importBackupJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const ok = StorageManager.importJSON(event.target.result);
      if (ok) {
        Sound.playSuccess();
        App.showToast("Backup restored successfully!", "success");
        setTimeout(() => location.reload(), 600);
      } else {
        Sound.playError();
        App.showToast("Failed to restore backup. Invalid file.", "danger");
      }
    };
    reader.readAsText(file);
  },

  confirmClearSales() {
    App.showConfirmModal(
      "Clear All Sales & Claims?",
      "Warning: This will permanently delete all completed sales transactions and active laundry claim records. Your services, categories, supplies, and staff accounts will remain untouched. This action cannot be undone.",
      async () => {
        try {
          await StorageManager.clearSalesAndClaims();
          Sound.playSuccess();
          App.showToast("All sales and claims history cleared. Reloading...", "info");
          setTimeout(() => location.reload(), 600);
        } catch (e) {
          const data = StorageManager.get();
          data.sales = [];
          StorageManager.save(data);
          Sound.playSuccess();
          App.showToast("Sales and claims cleared. Reloading...", "info");
          setTimeout(() => location.reload(), 600);
        }
      }
    );
  },

  confirmFactoryReset() {
    this.confirmClearSales();
  }
};
