/**
 * Brand Name POS - Cashier POS Logic Module
 * Implements laundry services browsing, weight & piece cart items, customer claim orders,
 * turnaround due date calculation, Laundry Status Tracker & Pickups, and Official Claim Stub printing.
 */

const CashierPOS = {
  cart: [], // Array of { productId, name, price, quantity, unit, isService, imageUrl, sku }
  selectedCategory: "ALL",
  searchQuery: "",
  trackerFilterStatus: "ALL",
  trackerSearchQuery: "",
  discount: {
    label: "None",
    type: "none", // 'percentage', 'fixed', 'none'
    value: 0
  },
  currentPaymentMethod: "CASH",
  lastCompletedSale: null,

  init() {
    this.renderCategoryPills();
    this.renderProducts();
    this.renderCart();
    this.setupSearchInput();
    this.updateDueDateDisplay();
    this.updateLaundryTrackerBadge();

    if (!this._syncListenerAttached) {
      this._syncListenerAttached = true;
      window.addEventListener("pos-data-synced", () => {
        this.renderCategoryPills();
        this.renderProducts();
        this.updateLaundryTrackerBadge();
      });
    }
  },

  setupSearchInput() {
    const input = document.getElementById("pos-search-input");
    const clearBtn = document.getElementById("btn-clear-search");
    if (!input) return;

    input.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      if (clearBtn) {
        clearBtn.style.display = this.searchQuery ? "flex" : "none";
      }
      this.renderProducts();
    });
  },

  clearSearch() {
    const input = document.getElementById("pos-search-input");
    const clearBtn = document.getElementById("btn-clear-search");
    if (input) input.value = "";
    if (clearBtn) clearBtn.style.display = "none";
    this.searchQuery = "";
    this.renderProducts();
  },

  resetFilters() {
    this.clearSearch();
    this.filterCategory("ALL");
  },

  renderCategoryPills() {
    const container = document.getElementById("pos-category-pills");
    if (!container) return;

    const data = StorageManager.get();
    const categories = data.categories || [];

    let html = `
      <button type="button" class="category-tab-btn ${this.selectedCategory === "ALL" ? "active" : ""}" onclick="CashierPOS.filterCategory('ALL')">
        <i data-lucide="layout-grid"></i>
        <span>ALL SERVICES</span>
      </button>
    `;

    categories.forEach(cat => {
      const isActive = this.selectedCategory === cat.id;
      html += `
        <button type="button" class="category-tab-btn ${isActive ? "active" : ""}" onclick="CashierPOS.filterCategory('${cat.id}')">
          <i data-lucide="${cat.icon || 'shirt'}"></i>
          <span>${cat.name.toUpperCase()}</span>
        </button>
      `;
    });

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  filterCategory(catId) {
    this.selectedCategory = catId;
    this.renderCategoryPills();
    this.renderProducts();
  },

  renderProducts() {
    const grid = document.getElementById("pos-product-grid");
    const emptyState = document.getElementById("pos-empty-products");
    if (!grid) return;

    const data = StorageManager.get();
    let products = data.products || [];

    // Filter by Active status
    products = products.filter(p => p.status !== "inactive");

    // Filter by category
    if (this.selectedCategory !== "ALL") {
      products = products.filter(p => p.categoryId === this.selectedCategory);
    }

    // Filter by search query
    if (this.searchQuery) {
      products = products.filter(p => {
        const matchName = p.name.toLowerCase().includes(this.searchQuery);
        const matchSku = (p.sku || "").toLowerCase().includes(this.searchQuery);
        const matchBarcode = (p.barcode || "").toLowerCase().includes(this.searchQuery);
        const matchDesc = (p.description || "").toLowerCase().includes(this.searchQuery);
        return matchName || matchSku || matchBarcode || matchDesc;
      });
    }

    if (products.length === 0) {
      grid.innerHTML = "";
      if (emptyState) emptyState.style.display = "flex";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    // Category Map for badge lookup
    const catMap = {};
    (data.categories || []).forEach(c => { catMap[c.id] = c.name; });

    let html = "";
    products.forEach(p => {
      const isSupply = !p.isService;
      const isOutOfStock = isSupply && p.stockQuantity <= 0;
      const isLowStock = isSupply && !isOutOfStock && p.stockQuantity <= (p.lowStockThreshold || 10);
      const unit = p.unit || "pc";

      let badgeClass = "badge-service";
      let badgeText = `Service / ${unit}`;

      if (isSupply) {
        if (isOutOfStock) {
          badgeClass = "badge-stock-out";
          badgeText = "OUT OF STOCK";
        } else if (isLowStock) {
          badgeClass = "badge-stock-low";
          badgeText = `Low: ${p.stockQuantity} ${unit}s`;
        } else {
          badgeClass = "badge-stock-good";
          badgeText = `Stock: ${p.stockQuantity} ${unit}s`;
        }
      }

      const imgPlaceholder = "https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=400&q=80";
      const displayImg = p.imageUrl || imgPlaceholder;

      html += `
        <div class="product-card ${isOutOfStock ? "out-of-stock" : ""}" 
             onclick="${isOutOfStock ? "" : `CashierPOS.addToCart('${p.id}')`}">
          <div class="product-card-img-wrapper">
            <img src="${displayImg}" alt="${p.name}" loading="lazy" onerror="this.src='${imgPlaceholder}'">
            <span class="product-card-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="product-card-body">
            <div>
              <span class="product-card-category">${catMap[p.categoryId] || 'General'}</span>
              <h4 class="product-card-title">${p.name}</h4>
              <p class="product-card-desc">${p.description || ''}</p>
            </div>
            <div class="product-card-footer">
              <span class="product-card-price">₱${p.price.toFixed(2)} <small>/ ${unit}</small></span>
              <button type="button" class="btn btn-add-product" ${isOutOfStock ? "disabled" : ""} 
                      onclick="event.stopPropagation(); CashierPOS.addToCart('${p.id}')">
                <i data-lucide="plus"></i> ADD
              </button>
            </div>
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  /* =========================================================
     CART MANAGEMENT (WEIGHT & PIECE SUPPORT)
     ========================================================= */
  addToCart(productId, customQty = null) {
    const data = StorageManager.get();
    const product = (data.products || []).find(p => p.id === productId);
    if (!product) return;

    const isSupply = !product.isService;
    if (isSupply && product.stockQuantity <= 0) {
      Sound.playError();
      App.showToast(`"${product.name}" is currently out of stock.`, "danger");
      return;
    }

    const existingIndex = this.cart.findIndex(item => item.productId === productId);
    const unit = product.unit || "pc";
    // For kg-based items, default addition is 1 kg or minimum 4 kg for wash-dry-fold on first add if empty
    const defaultAddQty = customQty !== null ? customQty : (unit === "kg" && existingIndex === -1 ? 4.0 : 1.0);

    if (existingIndex > -1) {
      const item = this.cart[existingIndex];
      const step = unit === "kg" ? 1.0 : 1;
      const newQty = item.quantity + (customQty !== null ? customQty : step);

      if (isSupply && newQty > product.stockQuantity) {
        Sound.playError();
        App.showToast(`Cannot add more. Stock limit of ${product.stockQuantity} ${unit}s reached.`, "warning");
        return;
      }

      item.quantity = Math.round(newQty * 100) / 100;
    } else {
      this.cart.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        unit: unit,
        quantity: defaultAddQty,
        isService: product.isService,
        maxStock: isSupply ? product.stockQuantity : 9999,
        imageUrl: product.imageUrl,
        sku: product.sku
      });
    }

    Sound.playBeep();
    this.renderCart();
    App.showToast(`Added: ${product.name} (${defaultAddQty} ${unit})`, "info");
  },

  updateQuantity(productId, delta) {
    const item = this.cart.find(it => it.productId === productId);
    if (!item) return;

    const step = item.unit === "kg" ? 0.5 : 1;
    const newQty = Math.round((item.quantity + (delta * step)) * 100) / 100;

    if (newQty <= 0) {
      this.removeFromCart(productId);
      return;
    }

    if (!item.isService && newQty > item.maxStock) {
      Sound.playError();
      App.showToast(`Cannot exceed current stock level of ${item.maxStock} ${item.unit}s.`, "warning");
      return;
    }

    item.quantity = newQty;
    this.renderCart();
  },

  setDirectWeight(productId, newWeightStr) {
    const item = this.cart.find(it => it.productId === productId);
    if (!item) return;

    const val = parseFloat(newWeightStr);
    if (isNaN(val) || val <= 0) {
      this.renderCart();
      return;
    }

    item.quantity = Math.round(val * 100) / 100;
    this.renderCart();
  },

  removeFromCart(productId) {
    const idx = this.cart.findIndex(it => it.productId === productId);
    if (idx > -1) {
      const removed = this.cart.splice(idx, 1)[0];
      this.renderCart();
      App.showToast(`Removed: ${removed.name}`, "info");
    }
  },

  confirmClearCart() {
    if (this.cart.length === 0) return;
    App.showConfirmModal(
      "Clear Laundry Order?",
      "Are you sure you want to remove all items from the current order?",
      () => {
        this.cart = [];
        this.discount = { label: "None", type: "none", value: 0 };
        this.renderCart();
        App.showToast("Order cart cleared.", "info");
      }
    );
  },

  renderCart() {
    const container = document.getElementById("cart-items-list");
    const emptyState = document.getElementById("cart-empty-state");
    const countBadge = document.getElementById("cart-item-count");
    const subtotalEl = document.getElementById("cart-subtotal");
    const discountRow = document.getElementById("cart-discount-row");
    const discountNameEl = document.getElementById("cart-discount-name");
    const discountAmtEl = document.getElementById("cart-discount-amt");
    const taxAmtEl = document.getElementById("cart-tax-amt");
    const grandTotalEl = document.getElementById("cart-grand-total");
    const checkoutBtn = document.getElementById("btn-checkout");
    const discountBtnLabel = document.getElementById("discount-btn-label");

    if (!container) return;

    const totalQty = this.cart.reduce((sum, it) => sum + it.quantity, 0);
    if (countBadge) {
      countBadge.textContent = `${this.cart.length} service(s) • ${totalQty % 1 === 0 ? totalQty : totalQty.toFixed(1)} units`;
    }

    if (this.cart.length === 0) {
      container.innerHTML = `
        <div class="cart-empty-placeholder" id="cart-empty-state">
          <div class="cart-empty-icon"><i data-lucide="shirt"></i></div>
          <h4>No Laundry Items Added</h4>
          <p>Tap laundry services on the left (Wash & Fold, Dry Cleaning, Pressing) to begin order.</p>
        </div>
      `;
      if (subtotalEl) subtotalEl.textContent = "₱0.00";
      if (discountRow) discountRow.style.display = "none";
      if (taxAmtEl) taxAmtEl.textContent = "₱0.00";
      if (grandTotalEl) grandTotalEl.textContent = "₱0.00";
      if (checkoutBtn) checkoutBtn.disabled = true;
      if (discountBtnLabel) discountBtnLabel.textContent = "Apply Discount";
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    let html = "";
    let subtotal = 0;

    this.cart.forEach(item => {
      const lineTotal = item.price * item.quantity;
      subtotal += lineTotal;
      const imgPlaceholder = "https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=100&q=80";
      const unit = item.unit || "pc";
      const isKg = unit === "kg";

      html += `
        <div class="cart-item-card">
          <img src="${item.imageUrl || imgPlaceholder}" alt="${item.name}" class="cart-item-thumb" onerror="this.src='${imgPlaceholder}'">
          <div class="cart-item-details">
            <h5 class="cart-item-name" title="${item.name}">${item.name}</h5>
            <span class="cart-item-unit-price">₱${item.price.toFixed(2)} / ${unit}</span>
            
            <div class="cart-item-controls">
              <button type="button" class="btn-qty" onclick="CashierPOS.updateQuantity('${item.productId}', -1)" title="Decrease ${isKg ? '0.5 kg' : '1'}">-</button>
              
              <div class="cart-qty-input-wrap">
                <input type="number" step="${isKg ? '0.1' : '1'}" min="0.1" value="${item.quantity}" 
                       class="cart-qty-direct-input" 
                       onchange="CashierPOS.setDirectWeight('${item.productId}', this.value)"
                       title="Edit ${unit} count">
                <span class="unit-tag">${unit}</span>
              </div>

              <button type="button" class="btn-qty" onclick="CashierPOS.updateQuantity('${item.productId}', 1)" title="Increase ${isKg ? '0.5 kg' : '1'}">+</button>
            </div>
          </div>
          <div class="cart-item-subtotal-box">
            <button type="button" class="btn-item-remove" onclick="CashierPOS.removeFromCart('${item.productId}')" title="Remove service">
              <i data-lucide="trash-2"></i>
            </button>
            <span class="cart-item-total">₱${lineTotal.toFixed(2)}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Calculate Discounts & Totals
    let discountAmount = 0;
    if (this.discount.type === "percentage") {
      discountAmount = (subtotal * this.discount.value) / 100;
    } else if (this.discount.type === "fixed") {
      discountAmount = Math.min(this.discount.value, subtotal);
    }

    const grandTotal = Math.max(0, subtotal - discountAmount);
    // 12% VAT estimation included in total
    const vatEstimate = grandTotal - (grandTotal / 1.12);

    if (subtotalEl) subtotalEl.textContent = `₱${subtotal.toFixed(2)}`;
    
    if (discountAmount > 0) {
      if (discountRow) discountRow.style.display = "flex";
      if (discountNameEl) discountNameEl.textContent = this.discount.label;
      if (discountAmtEl) discountAmtEl.textContent = `-₱${discountAmount.toFixed(2)}`;
      if (discountBtnLabel) discountBtnLabel.textContent = `Discount (${this.discount.label})`;
    } else {
      if (discountRow) discountRow.style.display = "none";
      if (discountBtnLabel) discountBtnLabel.textContent = "Apply Discount";
    }

    if (taxAmtEl) taxAmtEl.textContent = `₱${vatEstimate.toFixed(2)}`;
    if (grandTotalEl) grandTotalEl.textContent = `₱${grandTotal.toFixed(2)}`;
    if (checkoutBtn) checkoutBtn.disabled = false;

    if (window.lucide) lucide.createIcons();
  },

  getCartCalculations() {
    let subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discountAmount = 0;

    if (this.discount.type === "percentage") {
      discountAmount = (subtotal * this.discount.value) / 100;
    } else if (this.discount.type === "fixed") {
      discountAmount = Math.min(this.discount.value, subtotal);
    }

    const total = Math.max(0, subtotal - discountAmount);
    const totalWeight = this.cart
      .filter(it => it.unit === "kg")
      .reduce((sum, it) => sum + it.quantity, 0);

    return { subtotal, discountAmount, total, totalWeight };
  },

  /* --- DUE DATE CALCULATOR --- */
  calculateDueDate(hours = 48) {
    const d = new Date();
    d.setHours(d.getHours() + parseInt(hours));
    return d;
  },

  updateDueDateDisplay() {
    const select = document.getElementById("checkout-turnaround");
    const preview = document.getElementById("checkout-due-date-display");
    if (!select || !preview) return;

    const hours = parseInt(select.value) || 48;
    const dueDate = this.calculateDueDate(hours);
    const formatted = dueDate.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
    preview.textContent = formatted;
  },

  /* --- DISCOUNT MODAL CONTROLS --- */
  openDiscountModal() {
    const modal = document.getElementById("modal-discount");
    if (modal) modal.classList.add("active");
  },

  closeDiscountModal() {
    const modal = document.getElementById("modal-discount");
    if (modal) modal.classList.remove("active");
  },

  applyDiscountPreset(label, val, type) {
    this.discount = { label, value: val, type };
    this.closeDiscountModal();
    this.renderCart();
    App.showToast(`Applied discount: ${label}`, "success");
  },

  applyCustomDiscount() {
    const type = document.getElementById("custom-discount-type").value;
    const valInput = document.getElementById("custom-discount-val");
    const val = parseFloat(valInput.value) || 0;

    if (val <= 0) {
      App.showToast("Please enter a valid discount amount.", "warning");
      return;
    }

    const label = type === "percentage" ? `Custom (${val}%)` : `Custom (₱${val.toFixed(2)})`;
    this.discount = { label, value: val, type };
    this.closeDiscountModal();
    this.renderCart();
    App.showToast(`Applied ${label}`, "success");
    valInput.value = "";
  },

  removeDiscount() {
    this.discount = { label: "None", type: "none", value: 0 };
    this.closeDiscountModal();
    this.renderCart();
    App.showToast("Discount removed.", "info");
  },

  /* --- CHECKOUT MODAL CONTROLS --- */
  openCheckoutModal() {
    if (this.cart.length === 0) return;

    const { total } = this.getCartCalculations();
    const displayTotal = document.getElementById("checkout-display-total");
    const cashInput = document.getElementById("cash-received-input");
    const modal = document.getElementById("modal-checkout");

    // Prepopulate customer details from quick cart bar
    const cartCustName = document.getElementById("cart-customer-name");
    const cartCustPhone = document.getElementById("cart-customer-phone");
    const checkoutCustName = document.getElementById("checkout-customer-name");
    const checkoutCustPhone = document.getElementById("checkout-customer-phone");

    if (checkoutCustName && cartCustName) checkoutCustName.value = cartCustName.value;
    if (checkoutCustPhone && cartCustPhone) checkoutCustPhone.value = cartCustPhone.value;

    if (displayTotal) displayTotal.textContent = `₱${total.toFixed(2)}`;
    if (cashInput) cashInput.value = "";

    this.selectPaymentMethod("CASH");
    this.calculateChange();
    this.updateDueDateDisplay();

    if (modal) modal.classList.add("active");
    setTimeout(() => {
      if (checkoutCustName && !checkoutCustName.value) {
        checkoutCustName.focus();
      } else if (cashInput) {
        cashInput.focus();
      }
    }, 150);
  },

  closeCheckoutModal() {
    const modal = document.getElementById("modal-checkout");
    if (modal) modal.classList.remove("active");
  },

  selectPaymentMethod(method) {
    this.currentPaymentMethod = method;
    
    // Update tabs active state
    document.querySelectorAll(".payment-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.method === method);
    });

    // Update views
    const cashView = document.getElementById("payment-view-cash");
    const gcashView = document.getElementById("payment-view-gcash");
    const cardView = document.getElementById("payment-view-card");

    if (cashView) cashView.classList.toggle("active", method === "CASH");
    if (gcashView) gcashView.classList.toggle("active", method === "GCASH");
    if (cardView) cardView.classList.toggle("active", method === "CARD");

    this.calculateChange();
  },

  setExactCash() {
    const { total } = this.getCartCalculations();
    const cashInput = document.getElementById("cash-received-input");
    if (cashInput) {
      cashInput.value = total.toFixed(2);
      this.calculateChange();
    }
  },

  addCash(amount) {
    const cashInput = document.getElementById("cash-received-input");
    if (cashInput) {
      const current = parseFloat(cashInput.value) || 0;
      cashInput.value = (current + amount).toFixed(2);
      this.calculateChange();
    }
  },

  calculateChange() {
    const { total } = this.getCartCalculations();
    const cashInput = document.getElementById("cash-received-input");
    const changeAmountEl = document.getElementById("checkout-change-amount");
    const insufficientMsg = document.getElementById("insufficient-cash-msg");
    const remainingAmtEl = document.getElementById("remaining-amount");
    const completeBtn = document.getElementById("btn-complete-sale");

    if (this.currentPaymentMethod === "CASH") {
      const received = parseFloat(cashInput ? cashInput.value : 0) || 0;
      const difference = received - total;

      if (received < total) {
        const remaining = total - received;
        if (changeAmountEl) changeAmountEl.textContent = "₱0.00";
        if (insufficientMsg) insufficientMsg.style.display = "flex";
        if (remainingAmtEl) remainingAmtEl.textContent = `₱${remaining.toFixed(2)}`;
        if (completeBtn) completeBtn.disabled = true;
      } else {
        if (changeAmountEl) changeAmountEl.textContent = `₱${difference.toFixed(2)}`;
        if (insufficientMsg) insufficientMsg.style.display = "none";
        if (completeBtn) completeBtn.disabled = false;
      }
    } else {
      // GCash & Card are exact payment
      if (changeAmountEl) changeAmountEl.textContent = "₱0.00";
      if (insufficientMsg) insufficientMsg.style.display = "none";
      if (completeBtn) completeBtn.disabled = false;
    }
  },

  /* --- PROCESS LAUNDRY SALE & ISSUE CLAIM STUB --- */
  processSale() {
    const { subtotal, discountAmount, total, totalWeight } = this.getCartCalculations();
    const data = StorageManager.get();
    const currentUser = App.getCurrentUser();

    // Customer & turnaround inputs
    const custNameInput = document.getElementById("checkout-customer-name");
    const custPhoneInput = document.getElementById("checkout-customer-phone");
    const turnaroundSelect = document.getElementById("checkout-turnaround");
    const instructionsInput = document.getElementById("checkout-instructions");

    const customerName = (custNameInput && custNameInput.value.trim()) ? custNameInput.value.trim() : "Walk-in Customer";
    const customerPhone = (custPhoneInput && custPhoneInput.value.trim()) ? custPhoneInput.value.trim() : "None";
    const turnaroundHours = turnaroundSelect ? parseInt(turnaroundSelect.value) : 48;
    const dueDate = this.calculateDueDate(turnaroundHours).toISOString();
    const specialInstructions = (instructionsInput && instructionsInput.value.trim()) ? instructionsInput.value.trim() : "Standard wash & fold care.";

    let amountReceived = total;
    let changeAmount = 0;
    let referenceNumber = "";

    if (this.currentPaymentMethod === "CASH") {
      const cashInput = document.getElementById("cash-received-input");
      amountReceived = parseFloat(cashInput ? cashInput.value : 0) || 0;
      if (amountReceived < total) {
        Sound.playError();
        App.showToast("Payment amount is insufficient.", "danger");
        return;
      }
      changeAmount = amountReceived - total;
    } else if (this.currentPaymentMethod === "GCASH") {
      const gcashInput = document.getElementById("gcash-ref-input");
      referenceNumber = gcashInput ? gcashInput.value.trim() : "";
      if (!referenceNumber) {
        referenceNumber = "GC-" + Math.floor(100000000 + Math.random() * 900000000);
      }
    } else if (this.currentPaymentMethod === "CARD") {
      const cardInput = document.getElementById("card-ref-input");
      referenceNumber = cardInput ? cardInput.value.trim() : "";
      if (!referenceNumber) {
        referenceNumber = "AUTH-" + Math.floor(100000 + Math.random() * 900000);
      }
    }

    // Generate sequential transaction and claim number
    const existingSales = data.sales || [];
    const nextTxnNum = String(existingSales.length + 125).padStart(6, "0");
    const claimPrefix = data.settings?.claimPrefix || "LND-2026-";
    const claimNumber = `${claimPrefix}${String(existingSales.length + 125).slice(-3)}`;

    const saleRecord = {
      id: "sale-" + Date.now(),
      transactionNumber: nextTxnNum,
      claimNumber: claimNumber,
      customerName: customerName,
      customerPhone: customerPhone,
      laundryStatus: "RECEIVED", // Initial state
      dueDate: dueDate,
      specialInstructions: specialInstructions,
      totalWeight: totalWeight,
      cashierId: currentUser ? currentUser.id : "usr-2",
      cashierName: currentUser ? currentUser.fullName : "Cashier",
      items: this.cart.map(item => ({
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        unit: item.unit || "pc",
        unitPrice: item.price,
        subtotal: item.price * item.quantity
      })),
      subtotal: subtotal,
      discount: discountAmount,
      discountLabel: this.discount.label,
      total: total,
      paymentMethod: this.currentPaymentMethod,
      paymentStatus: "PAID",
      referenceNumber: referenceNumber,
      amountReceived: amountReceived,
      changeAmount: changeAmount,
      createdAt: new Date().toISOString()
    };

    // Deduct stock for supplies and add audit logs
    this.cart.forEach(cartItem => {
      const prod = data.products.find(p => p.id === cartItem.productId);
      if (prod && !prod.isService) {
        const prevStock = prod.stockQuantity;
        prod.stockQuantity = Math.max(0, prod.stockQuantity - cartItem.quantity);

        data.inventoryLogs.unshift({
          id: "log-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
          productId: prod.id,
          productName: prod.name,
          type: "SALE",
          quantity: -cartItem.quantity,
          previousStock: prevStock,
          newStock: prod.stockQuantity,
          reason: `Laundry Sale #${nextTxnNum}`,
          notes: `Supplies used/sold to ${customerName}`,
          userName: currentUser ? currentUser.fullName : 'Cashier',
          createdAt: new Date().toISOString()
        });
      }
    });

    // Save Sale Record
    data.sales.unshift(saleRecord);
    StorageManager.save(data);

    this.lastCompletedSale = saleRecord;

    // Audio & Visual Celebration
    Sound.playSuccess();
    if (window.confetti) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }

    // Close Checkout, Open Claim Stub / Receipt Modal
    this.closeCheckoutModal();
    this.showReceiptSuccessModal(saleRecord);

    // Reset Cart & Quick Inputs
    this.cart = [];
    this.discount = { label: "None", type: "none", value: 0 };
    const cartCustName = document.getElementById("cart-customer-name");
    const cartCustPhone = document.getElementById("cart-customer-phone");
    if (cartCustName) cartCustName.value = "";
    if (cartCustPhone) cartCustPhone.value = "";

    this.renderCart();
    this.renderProducts();
    this.updateLaundryTrackerBadge();
    App.showToast(`✓ Order created! Claim Ticket #${saleRecord.claimNumber}`, "success");
  },

  showReceiptSuccessModal(sale) {
    const modal = document.getElementById("modal-sale-success");
    const txnIdEl = document.getElementById("success-modal-txnid");
    const previewEl = document.getElementById("receipt-preview-content");

    if (txnIdEl) txnIdEl.textContent = `#${sale.claimNumber || sale.transactionNumber}`;
    if (previewEl) {
      previewEl.innerHTML = this.generateReceiptHTML(sale);
    }

    if (modal) modal.classList.add("active");
  },

  closeReceiptModal() {
    const modal = document.getElementById("modal-sale-success");
    if (modal) modal.classList.remove("active");
  },

  startNewTransaction() {
    this.closeReceiptModal();
    const searchInput = document.getElementById("pos-search-input");
    if (searchInput) searchInput.focus();
  },

  /* --- OFFICIAL RECEIPT & LAUNDRY CLAIM STUB GENERATOR --- */
  generateReceiptHTML(sale) {
    const data = StorageManager.get();
    const settings = data.settings || {};
    const dateFormatted = new Date(sale.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
    const dueFormatted = sale.dueDate ? new Date(sale.dueDate).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    }) : "48 Hours";

    let itemsHtml = "";
    sale.items.forEach(item => {
      const unit = item.unit || "pc";
      itemsHtml += `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.82rem;">
          <span style="max-width: 68%;">
            <b>${item.productName}</b><br>
            <span style="color:#555;">${item.quantity} ${unit} × ₱${item.unitPrice.toFixed(2)}</span>
          </span>
          <span style="font-weight: 700;">₱${item.subtotal.toFixed(2)}</span>
        </div>
      `;
    });

    const statusBadge = `<span style="background:#e0f2fe; color:#0369a1; padding: 2px 8px; border-radius: 9999px; font-weight:700; font-size:0.75rem;">${(sale.laundryStatus || 'RECEIVED').replace(/_/g, ' ')}</span>`;

    return `
      <!-- TOP PORTION: OFFICIAL STORE RECEIPT -->
      <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 10px;">
        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; letter-spacing: 0.5px;">${settings.storeName || 'Brand Name'}</h3>
        <div style="font-size: 0.75rem; color: #444; margin-top: 2px;">${settings.tagline || 'Professional Laundry & Dry Cleaning'}</div>
        <div style="font-size: 0.72rem; color: #444; margin-top: 2px;">${settings.address || ''}</div>
        <div style="font-size: 0.72rem; color: #444;">${settings.contact || ''}</div>
        <div style="margin-top: 6px; font-weight: 800; font-size: 0.85rem; letter-spacing: 1px; color: #0284c7;">OFFICIAL SALES RECEIPT</div>
      </div>

      <div style="font-size: 0.78rem; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 6px;">
        <div style="display:flex; justify-content:space-between;"><span><b>Txn Ref:</b> #${sale.transactionNumber}</span> <span><b>Date:</b> ${dateFormatted}</span></div>
        <div style="display:flex; justify-content:space-between; margin-top:2px;"><span><b>Cashier:</b> ${sale.cashierName}</span> <span><b>Payment:</b> ${sale.paymentMethod}</span></div>
      </div>

      <div style="margin-bottom: 8px;">
        ${itemsHtml}
      </div>

      <div style="border-top: 1px dashed #000; padding-top: 6px; font-size: 0.85rem;">
        <div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
          <span>Subtotal:</span>
          <span>₱${sale.subtotal.toFixed(2)}</span>
        </div>
        ${sale.discount > 0 ? `
          <div style="display:flex; justify-content:space-between; margin-bottom: 2px; color: #059669; font-weight: 600;">
            <span>Discount (${sale.discountLabel}):</span>
            <span>-₱${sale.discount.toFixed(2)}</span>
          </div>
        ` : ''}
        <div style="display:flex; justify-content:space-between; font-weight: 900; font-size: 1.1rem; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin: 4px 0;">
          <span>TOTAL PAID:</span>
          <span>₱${sale.total.toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 0.8rem; margin-top: 4px;">
          <span>Amount Received:</span>
          <span>₱${sale.amountReceived.toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 0.85rem; font-weight: 700;">
          <span>Change:</span>
          <span>₱${sale.changeAmount.toFixed(2)}</span>
        </div>
      </div>

      <!-- BOTTOM PORTION: DEDICATED LAUNDRY CLAIM STUB -->
      <div style="border: 2px dashed #0284c7; background: rgba(2, 132, 199, 0.05); border-radius: 8px; padding: 10px; margin-top: 12px; text-align: left;">
        <div style="text-align: center; margin-bottom: 6px;">
          <span style="font-weight: 900; font-size: 0.95rem; letter-spacing: 1px; color: #0284c7;">🧺 CUSTOMER LAUNDRY CLAIM STUB</span>
          <div style="font-size: 0.72rem; color: #555;">Present this claim stub upon pickup</div>
        </div>

        <div style="background: #fff; color: #000; border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:0.7rem; color:#666;">CLAIM TICKET NUMBER:</div>
              <div style="font-size:1.15rem; font-weight:900; color:#0284c7; font-family: monospace;">${sale.claimNumber || '#' + sale.transactionNumber}</div>
            </div>
            <div>${statusBadge}</div>
          </div>
        </div>

        <div style="font-size: 0.78rem; line-height: 1.4;">
          <div><b>Customer:</b> ${sale.customerName}</div>
          <div><b>Contact No:</b> ${sale.customerPhone}</div>
          <div style="margin-top: 3px; color: #b45309; font-weight: 700;"><b>Promised Ready Date:</b> ${dueFormatted}</div>
          ${sale.totalWeight ? `<div><b>Total Weight:</b> ${sale.totalWeight} kg</div>` : ''}
          ${sale.specialInstructions ? `<div style="margin-top:2px; font-style:italic; color:#475569;"><b>Care Notes:</b> "${sale.specialInstructions}"</div>` : ''}
        </div>

        <!-- Simulated Claim Barcode -->
        <div style="text-align:center; margin-top: 8px; font-family: monospace; letter-spacing: 3px; font-weight: 700; font-size: 0.85rem; color: #333;">
          ||| | |||| | ||| || |||| | ||
          <div style="font-size:0.7rem; letter-spacing: 1px;">*${sale.claimNumber || sale.transactionNumber}*</div>
        </div>
      </div>

      <div style="text-align: center; font-size: 0.72rem; color:#64748b; margin-top: 10px; padding-top: 6px;">
        <p style="margin: 0;">${settings.receiptFooter || 'Maraming Salamat! Keep this stub safe.'}</p>
        <p style="margin: 2px 0 0;">Unclaimed items after 30 days will be disposed of per policy.</p>
      </div>
    `;
  },

  printCurrentReceipt() {
    const sale = this.lastCompletedSale;
    if (!sale) return;

    const printArea = document.getElementById("thermal-print-area");
    if (printArea) {
      printArea.innerHTML = this.generateReceiptHTML(sale);
      window.print();
    }
  },

  downloadReceiptText() {
    const sale = this.lastCompletedSale;
    if (!sale) return;

    const data = StorageManager.get();
    const settings = data.settings || {};
    const dateFormatted = new Date(sale.createdAt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
    const dueFormatted = sale.dueDate ? new Date(sale.dueDate).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    }) : "48 Hours";

    let text = `================================\n`;
    text += `   ${settings.storeName || 'Brand Name POS'}\n`;
    text += `      Official Receipt & Claim\n`;
    text += `================================\n\n`;
    text += `Claim Ticket #: ${sale.claimNumber || sale.transactionNumber}\n`;
    text += `Customer Name:  ${sale.customerName}\n`;
    text += `Mobile No.:     ${sale.customerPhone}\n`;
    text += `Status:         ${sale.laundryStatus || 'RECEIVED'}\n`;
    text += `Drop-off Date:  ${dateFormatted}\n`;
    text += `PROMISED READY: ${dueFormatted}\n`;
    text += `Cashier:        ${sale.cashierName}\n\n`;
    text += `--------------------------------\n`;

    sale.items.forEach(item => {
      const line = `${item.productName.padEnd(18).slice(0, 18)} ${item.quantity}${item.unit}x₱${item.unitPrice} ₱${item.subtotal.toFixed(2)}\n`;
      text += line;
    });

    text += `--------------------------------\n`;
    text += `Subtotal:                 ₱${sale.subtotal.toFixed(2)}\n`;
    if (sale.discount > 0) {
      text += `Discount (${sale.discountLabel}): -₱${sale.discount.toFixed(2)}\n`;
    }
    text += `TOTAL PAID:               ₱${sale.total.toFixed(2)}\n\n`;
    text += `Payment: ${sale.paymentMethod}\n`;
    text += `Received: ₱${sale.amountReceived.toFixed(2)}\n`;
    text += `Change:   ₱${sale.changeAmount.toFixed(2)}\n`;
    if (sale.specialInstructions) {
      text += `Notes: ${sale.specialInstructions}\n`;
    }
    text += `================================\n`;
    text += `  ${settings.receiptFooter || 'Maraming Salamat! Keep this stub safe.'}\n`;
    text += `================================\n`;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LaundryClaim_${sale.claimNumber || sale.transactionNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /* =========================================================
     LAUNDRY STATUS TRACKER & PICKUPS MODAL
     ========================================================= */
  openLaundryTrackerModal() {
    const modal = document.getElementById("modal-laundry-tracker");
    if (modal) {
      this.renderLaundryTrackerOrders();
      modal.classList.add("active");
    }
  },

  closeLaundryTrackerModal() {
    const modal = document.getElementById("modal-laundry-tracker");
    if (modal) modal.classList.remove("active");
  },

  filterTrackerStatus(status) {
    this.trackerFilterStatus = status;
    document.querySelectorAll(".status-pill-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.status === status);
    });
    this.renderLaundryTrackerOrders();
  },

  filterLaundryTracker() {
    const input = document.getElementById("tracker-search-input");
    this.trackerSearchQuery = input ? input.value.trim().toLowerCase() : "";
    this.renderLaundryTrackerOrders();
  },

  updateLaundryTrackerBadge() {
    const data = StorageManager.get();
    const sales = data.sales || [];
    const activeOrders = sales.filter(s => s.laundryStatus && s.laundryStatus !== "CLAIMED");
    const badge = document.getElementById("header-active-laundry-count");
    if (badge) {
      badge.textContent = `${activeOrders.length} Active`;
    }
  },

  renderLaundryTrackerOrders() {
    const container = document.getElementById("tracker-orders-list");
    if (!container) return;

    const data = StorageManager.get();
    let sales = data.sales || [];

    // Filter by tracker status
    if (this.trackerFilterStatus === "ACTIVE") {
      sales = sales.filter(s => s.laundryStatus && s.laundryStatus !== "CLAIMED");
    } else if (this.trackerFilterStatus !== "ALL") {
      sales = sales.filter(s => s.laundryStatus === this.trackerFilterStatus);
    }

    // Filter by search query (customer name, phone, claim #)
    if (this.trackerSearchQuery) {
      sales = sales.filter(s => {
        const name = (s.customerName || "").toLowerCase();
        const phone = (s.customerPhone || "").toLowerCase();
        const claim = (s.claimNumber || s.transactionNumber || "").toLowerCase();
        return name.includes(this.trackerSearchQuery) || phone.includes(this.trackerSearchQuery) || claim.includes(this.trackerSearchQuery);
      });
    }

    if (sales.length === 0) {
      container.innerHTML = `
        <div class="empty-tracker-box">
          <i data-lucide="package-search"></i>
          <h4>No matching laundry orders found</h4>
          <p>Try clearing your search query or selecting a different status filter.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const statusMap = {
      RECEIVED: { label: "Received 📥", badgeClass: "status-received", next: "WASHING", nextLabel: "Start Washing" },
      WASHING: { label: "Washing 🧼", badgeClass: "status-washing", next: "DRYING", nextLabel: "Move to Dryer" },
      DRYING: { label: "Drying 🌀", badgeClass: "status-drying", next: "READY_FOR_PICKUP", nextLabel: "Mark Ready" },
      READY_FOR_PICKUP: { label: "Ready for Pickup ✅", badgeClass: "status-ready", next: "CLAIMED", nextLabel: "Customer Claim" },
      CLAIMED: { label: "Claimed 🧺", badgeClass: "status-claimed", next: null, nextLabel: null }
    };

    let html = "";
    sales.forEach(sale => {
      const currentStatus = sale.laundryStatus || "RECEIVED";
      const statusInfo = statusMap[currentStatus] || statusMap.RECEIVED;
      const dueFormatted = sale.dueDate ? new Date(sale.dueDate).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      }) : "Standard";

      const itemsSummary = sale.items.map(it => `${it.quantity}${it.unit || 'pc'} ${it.productName}`).join(", ");

      html += `
        <div class="tracker-order-card">
          <div class="tracker-card-header">
            <div class="claim-badge-group">
              <span class="claim-tag-number">${sale.claimNumber || '#' + sale.transactionNumber}</span>
              <span class="tracker-status-tag ${statusInfo.badgeClass}">${statusInfo.label}</span>
            </div>
            <div class="tracker-card-price">₱${sale.total.toFixed(2)}</div>
          </div>

          <div class="tracker-card-body">
            <div class="tracker-customer-info">
              <div class="customer-title"><i data-lucide="user"></i> <b>${sale.customerName || 'Walk-in Customer'}</b></div>
              <div class="customer-phone"><i data-lucide="phone"></i> ${sale.customerPhone || 'None'}</div>
            </div>

            <div class="tracker-meta-row">
              <div><i data-lucide="calendar"></i> Ready by: <b class="text-warning">${dueFormatted}</b></div>
              ${sale.totalWeight ? `<div><i data-lucide="scale"></i> Weight: <b>${sale.totalWeight} kg</b></div>` : ''}
            </div>

            <div class="tracker-items-list text-muted text-sm">
              <i data-lucide="shirt"></i> ${itemsSummary}
            </div>

            ${sale.specialInstructions ? `
              <div class="tracker-instructions-box">
                <i data-lucide="info"></i> <span>"${sale.specialInstructions}"</span>
              </div>
            ` : ''}
          </div>

          <div class="tracker-card-footer">
            <div class="status-select-wrap">
              <label>Status:</label>
              <select class="status-quick-select" onchange="CashierPOS.updateLaundryStatus('${sale.id}', this.value)">
                <option value="RECEIVED" ${currentStatus === 'RECEIVED' ? 'selected' : ''}>Received 📥</option>
                <option value="WASHING" ${currentStatus === 'WASHING' ? 'selected' : ''}>Washing 🧼</option>
                <option value="DRYING" ${currentStatus === 'DRYING' ? 'selected' : ''}>Drying 🌀</option>
                <option value="READY_FOR_PICKUP" ${currentStatus === 'READY_FOR_PICKUP' ? 'selected' : ''}>Ready for Pickup ✅</option>
                <option value="CLAIMED" ${currentStatus === 'CLAIMED' ? 'selected' : ''}>Claimed 🧺</option>
              </select>
            </div>

            <div class="tracker-action-btns">
              <button type="button" class="btn btn-secondary btn-sm" onclick="CashierPOS.viewOrderReceipt('${sale.id}')" title="Reprint Claim Stub">
                <i data-lucide="printer"></i> Stub
              </button>
              ${statusInfo.next ? `
                <button type="button" class="btn btn-primary btn-sm" onclick="CashierPOS.updateLaundryStatus('${sale.id}', '${statusInfo.next}')">
                  <i data-lucide="arrow-right"></i> ${statusInfo.nextLabel}
                </button>
              ` : `
                <span class="text-success text-sm font-bold"><i data-lucide="check-circle-2"></i> Completed</span>
              `}
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  updateLaundryStatus(saleId, newStatus) {
    const data = StorageManager.get();
    const sale = (data.sales || []).find(s => s.id === saleId);
    if (!sale) return;

    sale.laundryStatus = newStatus;
    StorageManager.save(data);

    Sound.playSuccess();
    this.renderLaundryTrackerOrders();
    this.updateLaundryTrackerBadge();
    App.showToast(`Updated Claim #${sale.claimNumber || sale.transactionNumber} to ${newStatus.replace(/_/g, ' ')}`, "success");
  },

  viewOrderReceipt(saleId) {
    const data = StorageManager.get();
    const sale = (data.sales || []).find(s => s.id === saleId);
    if (sale) {
      this.lastCompletedSale = sale;
      this.showReceiptSuccessModal(sale);
    }
  },

  /* --- BARCODE SCANNER SIMULATOR --- */
  openBarcodeScannerModal() {
    const modal = document.getElementById("modal-barcode-scan");
    const chipsList = document.getElementById("barcode-quick-chips");
    const input = document.getElementById("barcode-manual-input");

    if (chipsList) {
      const data = StorageManager.get();
      let html = "";
      data.products.filter(p => p.barcode).forEach(p => {
        html += `
          <div class="barcode-item-chip" onclick="CashierPOS.simulateScanCode('${p.barcode}')">
            <span><b>${p.name}</b> (₱${p.price.toFixed(2)} / ${p.unit || 'pc'})</span>
            <span class="user-meta">${p.barcode}</span>
          </div>
        `;
      });
      chipsList.innerHTML = html;
    }

    if (modal) modal.classList.add("active");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 150);
    }
  },

  closeBarcodeScannerModal() {
    const modal = document.getElementById("modal-barcode-scan");
    if (modal) modal.classList.remove("active");
  },

  simulateScanCode(barcode) {
    const input = document.getElementById("barcode-manual-input");
    if (input) input.value = barcode;
    this.submitBarcodeScan();
  },

  submitBarcodeScan() {
    const input = document.getElementById("barcode-manual-input");
    if (!input) return;

    const barcode = input.value.trim();
    if (!barcode) return;

    const data = StorageManager.get();
    const product = data.products.find(p => p.barcode === barcode || p.sku === barcode);

    if (product) {
      this.addToCart(product.id);
      this.closeBarcodeScannerModal();
      App.showToast(`Scanned: ${product.name}`, "success");
    } else {
      Sound.playError();
      App.showToast(`No product found with barcode "${barcode}"`, "danger");
    }
  },

  /* --- RECENT SALES (CASHIER DRAWER) --- */
  openRecentSalesModal() {
    const modal = document.getElementById("modal-recent-sales");
    const tbody = document.getElementById("cashier-recent-sales-tbody");
    const data = StorageManager.get();
    const sales = data.sales || [];

    if (tbody) {
      if (sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No transactions recorded yet.</td></tr>`;
      } else {
        let html = "";
        sales.slice(0, 15).forEach(s => {
          const itemCount = s.items.reduce((sum, it) => sum + it.quantity, 0);
          const time = new Date(s.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          const status = (s.laundryStatus || 'RECEIVED').replace(/_/g, ' ');

          html += `
            <tr>
              <td>
                <b>${s.claimNumber || '#' + s.transactionNumber}</b><br>
                <small class="text-muted">${time}</small>
              </td>
              <td><b>${s.customerName || 'Customer'}</b></td>
              <td><span class="badge-pill badge-active">${status}</span></td>
              <td>${itemCount} units</td>
              <td class="font-bold text-success">₱${s.total.toFixed(2)}</td>
              <td class="text-right">
                <button type="button" class="btn btn-secondary btn-sm" onclick="CashierPOS.viewOrderReceipt('${s.id}')">
                  <i data-lucide="receipt"></i> Stub
                </button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
      }
    }

    if (modal) modal.classList.add("active");
  },

  closeRecentSalesModal() {
    const modal = document.getElementById("modal-recent-sales");
    if (modal) modal.classList.remove("active");
  }
};
