/**
 * Brand Name POS - Data & Storage Management
 * Handles Philippine Peso (₱) laundry services, dry cleaning, pressing, supplies, customer claim orders, and localStorage sync.
 */

const SEED_DATA = {
  settings: {
    storeName: "Brand Name POS",
    tagline: "Professional Laundry • Dry Cleaning • Steam Pressing",
    currency: "₱",
    address: "Unit 108, Crystal Water Tower, Makati Ave, Makati City",
    contact: "(02) 8834-WASH (9274) • Mobile: 0917-889-2782",
    taxRate: 12, // 12% VAT Included
    defaultLowStockThreshold: 10,
    claimPrefix: "LND-2026-",
    defaultTurnaroundHours: 48,
    receiptFooter: "Maraming Salamat! Please present this Claim Stub upon laundry pickup."
  },

  categories: [
    { id: "cat-1", name: "Wash & Fold", icon: "shirt", description: "Wash, Dry & Fold per Kilo or Load" },
    { id: "cat-2", name: "Dry Cleaning", icon: "sparkles", description: "Professional Dry Clean per Piece" },
    { id: "cat-3", name: "Steam Press", icon: "flame", description: "Wrinkle-Free Steam Pressing & Ironing" },
    { id: "cat-4", name: "Bulky & Care", icon: "package", description: "Comforters, Blankets, Shoes & Drapes" },
    { id: "cat-5", name: "Add-ons & Retail", icon: "droplets", description: "Fabric Conditioners, Bleach, Garment Bags" }
  ],

  products: [
    {
      id: "prod-1",
      sku: "WDF-001",
      barcode: "480009900101",
      name: "Regular Clothes (Wash-Dry-Fold)",
      categoryId: "cat-1",
      unit: "kg",
      price: 35.00,
      costPrice: 10.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=400&q=80",
      description: "Standard everyday clothing: washed, tumble dried, and crisply folded. Minimum 4kg charge.",
      status: "active"
    },
    {
      id: "prod-2",
      sku: "WDF-002",
      barcode: "480009900102",
      name: "Bed Linens & Towels (Wash-Dry-Fold)",
      categoryId: "cat-1",
      unit: "kg",
      price: 45.00,
      costPrice: 12.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=400&q=80",
      description: "Bed sheets, pillowcases, bath towels, and duvet covers deep sanitized.",
      status: "active"
    },
    {
      id: "prod-3",
      sku: "WDF-003",
      barcode: "480009900103",
      name: "Delicates & Baby Wear (Wash-Dry-Fold)",
      categoryId: "cat-1",
      unit: "kg",
      price: 55.00,
      costPrice: 15.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1516762689617-e1cffcef479d?auto=format&fit=crop&w=400&q=80",
      description: "Gentle baby garments, lingerie, and silk/lace fabrics with mild hypoallergenic detergent.",
      status: "active"
    },
    {
      id: "prod-4",
      sku: "DRY-001",
      barcode: "480009900201",
      name: "2-Piece Business Suit (Dry Clean)",
      categoryId: "cat-2",
      unit: "set",
      price: 380.00,
      costPrice: 110.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=400&q=80",
      description: "Coat jacket and matching trousers professionally dry cleaned, steam pressed on hanger.",
      status: "active"
    },
    {
      id: "prod-5",
      sku: "DRY-002",
      barcode: "480009900202",
      name: "Barong Tagalog (Piña / Jusi / Organza)",
      categoryId: "cat-2",
      unit: "pc",
      price: 280.00,
      costPrice: 80.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=400&q=80",
      description: "Specialized gentle hand treatment and shaped steam finishing for delicate Barong fabric.",
      status: "active"
    },
    {
      id: "prod-6",
      sku: "DRY-003",
      barcode: "480009900203",
      name: "Evening Gown / Formal Dress",
      categoryId: "cat-2",
      unit: "pc",
      price: 450.00,
      costPrice: 140.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=400&q=80",
      description: "Beaded, sequined, or floor length formal gown delicate dry clean in protective cover.",
      status: "active"
    },
    {
      id: "prod-7",
      sku: "PRS-001",
      barcode: "480009900301",
      name: "Collared Shirts / Polo (Steam Press)",
      categoryId: "cat-3",
      unit: "pc",
      price: 45.00,
      costPrice: 12.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=400&q=80",
      description: "Crisp collar, cuff, and body heavy steam pressing on hanger.",
      status: "active"
    },
    {
      id: "prod-8",
      sku: "PRS-002",
      barcode: "480009900302",
      name: "Slacks / Trousers (Crease Press)",
      categoryId: "cat-3",
      unit: "pc",
      price: 50.00,
      costPrice: 12.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=400&q=80",
      description: "Sharp center crease pressing for office slacks and dress pants.",
      status: "active"
    },
    {
      id: "prod-9",
      sku: "BLK-001",
      barcode: "480009900401",
      name: "King / Queen Comforter & Duvet",
      categoryId: "cat-4",
      unit: "pc",
      price: 250.00,
      costPrice: 70.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80",
      description: "Deep sanitizing wash, high-heat anti-allergen tumble dry, sealed in clear pack.",
      status: "active"
    },
    {
      id: "prod-10",
      sku: "BLK-002",
      barcode: "480009900402",
      name: "Premium Sneaker / Shoes Deep Clean",
      categoryId: "cat-4",
      unit: "pair",
      price: 280.00,
      costPrice: 75.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=400&q=80",
      description: "Sole de-yellowing, mesh scrub, insole deodorizing, water repellent shield.",
      status: "active"
    },
    {
      id: "prod-11",
      sku: "SUP-001",
      barcode: "480009900501",
      name: "Downy Fabric Conditioner (Floral Breeze)",
      categoryId: "cat-5",
      unit: "sachet",
      price: 15.00,
      costPrice: 7.50,
      stockQuantity: 75,
      lowStockThreshold: 20,
      isService: false,
      imageUrl: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80",
      description: "Extra long-lasting fragrance fabric softener add-on for wash loads.",
      status: "active"
    },
    {
      id: "prod-12",
      sku: "SUP-002",
      barcode: "480009900502",
      name: "Ariel Oxi-Stain Remover Booster",
      categoryId: "cat-5",
      unit: "scoop",
      price: 20.00,
      costPrice: 8.00,
      stockQuantity: 40,
      lowStockThreshold: 10,
      isService: false,
      imageUrl: "https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?auto=format&fit=crop&w=400&q=80",
      description: "Targeted oxygen stain remover boost for stubborn dirt and grease spots.",
      status: "active"
    },
    {
      id: "prod-13",
      sku: "SUP-003",
      barcode: "480009900503",
      name: "Express Rush Priority Service (4-Hour)",
      categoryId: "cat-5",
      unit: "job",
      price: 80.00,
      costPrice: 20.00,
      stockQuantity: 999,
      lowStockThreshold: 10,
      isService: true,
      imageUrl: "https://images.unsplash.com/photo-1508962914676-134849a727f0?auto=format&fit=crop&w=400&q=80",
      description: "Priority queue processing for fast 4-hour turnaround.",
      status: "active"
    },
    {
      id: "prod-14",
      sku: "SUP-004",
      barcode: "480009900504",
      name: "Protective Garment Zipper Bag",
      categoryId: "cat-5",
      unit: "pc",
      price: 35.00,
      costPrice: 15.00,
      stockQuantity: 18,
      lowStockThreshold: 10,
      isService: false,
      imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80",
      description: "Dust-proof non-woven garment carrier bag with viewing window.",
      status: "active"
    },
    {
      id: "prod-15",
      sku: "SUP-005",
      barcode: "480009900505",
      name: "Foldable Mesh Pop-Up Laundry Hamper",
      categoryId: "cat-5",
      unit: "pc",
      price: 150.00,
      costPrice: 70.00,
      stockQuantity: 6, // Low stock demo
      lowStockThreshold: 10,
      isService: false,
      imageUrl: "https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&w=400&q=80",
      description: "Lightweight breathable laundry sorting basket with sturdy handles.",
      status: "active"
    }
  ],

  users: [
    {
      id: "usr-1",
      fullName: "Administrator",
      username: "admin",
      password: "admin123",
      role: "ADMIN",
      status: "active",
      createdAt: "2026-09-01T08:00:00.000Z"
    },
    {
      id: "usr-2",
      fullName: "John Doe",
      username: "cashier",
      password: "cashier123",
      role: "CASHIER",
      status: "active",
      createdAt: "2026-09-01T08:30:00.000Z"
    },
    {
      id: "usr-3",
      fullName: "Maria Santos",
      username: "maria",
      password: "cashier123",
      role: "CASHIER",
      status: "active",
      createdAt: "2026-09-15T09:00:00.000Z"
    }
  ],

  sales: [
    {
      id: "sale-101",
      transactionNumber: "000121",
      claimNumber: "LND-2026-121",
      customerName: "Atty. Carlos Mendoza",
      customerPhone: "0917-555-4321",
      laundryStatus: "READY_FOR_PICKUP",
      dueDate: "2026-10-06T15:00:00.000Z",
      specialInstructions: "Separate white shirts from colors. Extra Downy floral scent.",
      totalWeight: 6.5,
      cashierId: "usr-2",
      cashierName: "John Doe",
      items: [
        { productId: "prod-1", productName: "Regular Clothes (Wash-Dry-Fold)", quantity: 6.5, unit: "kg", unitPrice: 35.00, subtotal: 227.50 },
        { productId: "prod-11", productName: "Downy Fabric Conditioner (Floral Breeze)", quantity: 2, unit: "sachet", unitPrice: 15.00, subtotal: 30.00 }
      ],
      subtotal: 257.50,
      discount: 0.00,
      discountLabel: "None",
      total: 257.50,
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      amountReceived: 300.00,
      changeAmount: 42.50,
      createdAt: "2026-10-04T09:15:00.000Z"
    },
    {
      id: "sale-102",
      transactionNumber: "000122",
      claimNumber: "LND-2026-122",
      customerName: "Dr. Andrea Villanueva",
      customerPhone: "0918-882-9901",
      laundryStatus: "WASHING",
      dueDate: "2026-10-06T18:00:00.000Z",
      specialInstructions: "Medical lab coats: high-temp hygiene wash. Barong steam press gently.",
      totalWeight: 4.0,
      cashierId: "usr-3",
      cashierName: "Maria Santos",
      items: [
        { productId: "prod-4", productName: "2-Piece Business Suit (Dry Clean)", quantity: 1, unit: "set", unitPrice: 380.00, subtotal: 380.00 },
        { productId: "prod-5", productName: "Barong Tagalog (Piña / Jusi / Organza)", quantity: 1, unit: "pc", unitPrice: 280.00, subtotal: 280.00 },
        { productId: "prod-14", productName: "Protective Garment Zipper Bag", quantity: 2, unit: "pc", unitPrice: 35.00, subtotal: 70.00 }
      ],
      subtotal: 730.00,
      discount: 73.00,
      discountLabel: "Loyalty Member (10%)",
      total: 657.00,
      paymentMethod: "GCASH",
      paymentStatus: "PAID",
      referenceNumber: "GC-982736192",
      amountReceived: 657.00,
      changeAmount: 0.00,
      createdAt: "2026-10-04T14:30:00.000Z"
    },
    {
      id: "sale-103",
      transactionNumber: "000123",
      claimNumber: "LND-2026-123",
      customerName: "Michael Chang",
      customerPhone: "0920-112-3344",
      laundryStatus: "DRYING",
      dueDate: "2026-10-05T19:00:00.000Z",
      specialInstructions: "King comforter heavy cycle. Air-dry sneaker insoles.",
      totalWeight: 8.0,
      cashierId: "usr-2",
      cashierName: "John Doe",
      items: [
        { productId: "prod-9", productName: "King / Queen Comforter & Duvet", quantity: 1, unit: "pc", unitPrice: 250.00, subtotal: 250.00 },
        { productId: "prod-10", productName: "Premium Sneaker / Shoes Deep Clean", quantity: 1, unit: "pair", unitPrice: 280.00, subtotal: 280.00 }
      ],
      subtotal: 530.00,
      discount: 0.00,
      discountLabel: "None",
      total: 530.00,
      paymentMethod: "CARD",
      paymentStatus: "PAID",
      referenceNumber: "AUTH-89211",
      amountReceived: 530.00,
      changeAmount: 0.00,
      createdAt: "2026-10-05T09:45:00.000Z"
    },
    {
      id: "sale-104",
      transactionNumber: "000124",
      claimNumber: "LND-2026-124",
      customerName: "Lourdes Bautista",
      customerPhone: "0908-771-6655",
      laundryStatus: "CLAIMED",
      dueDate: "2026-10-05T12:00:00.000Z",
      specialInstructions: "Senior citizen discount applied. Picked up Oct 5 11:30 AM.",
      totalWeight: 5.0,
      cashierId: "usr-3",
      cashierName: "Maria Santos",
      items: [
        { productId: "prod-1", productName: "Regular Clothes (Wash-Dry-Fold)", quantity: 5, unit: "kg", unitPrice: 35.00, subtotal: 175.00 },
        { productId: "prod-7", productName: "Collared Shirts / Polo (Steam Press)", quantity: 4, unit: "pc", unitPrice: 45.00, subtotal: 180.00 }
      ],
      subtotal: 355.00,
      discount: 71.00,
      discountLabel: "Senior / PWD (20%)",
      total: 284.00,
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      amountReceived: 500.00,
      changeAmount: 216.00,
      createdAt: "2026-10-05T10:50:00.000Z"
    }
  ],

  inventoryLogs: [
    {
      id: "log-1",
      productId: "prod-11",
      productName: "Downy Fabric Conditioner (Floral Breeze)",
      type: "RESTOCK",
      quantity: 100,
      previousStock: 0,
      newStock: 100,
      reason: "Restock",
      notes: "Opening supplies shipment batch #01",
      userName: "Administrator",
      createdAt: "2026-09-01T08:00:00.000Z"
    },
    {
      id: "log-2",
      productId: "prod-15",
      productName: "Foldable Mesh Pop-Up Laundry Hamper",
      type: "ADJUST",
      quantity: -2,
      previousStock: 8,
      newStock: 6,
      reason: "Damaged",
      notes: "Defective wire frame in unboxing",
      userName: "Administrator",
      createdAt: "2026-10-04T16:00:00.000Z"
    }
  ]
};

const STORAGE_KEY = "BRAND_NAME_POS_DATA_V3";

/**
 * Storage Manager Module
 */
const StorageManager = {
  get() {
    try {
      let stored = localStorage.getItem(STORAGE_KEY);
      // Auto-migrate from older storage version if found
      if (!stored) {
        const oldData = localStorage.getItem("AQUA_LAUNDRY_POS_DATA_V2") || localStorage.getItem("MY_STORE_POS_DATA_V1");
        if (oldData) {
          try {
            const parsedOld = JSON.parse(oldData);
            if (parsedOld && parsedOld.settings) {
              if (!parsedOld.settings.storeName || parsedOld.settings.storeName.includes("AQUA FRESH") || parsedOld.settings.storeName.includes("<Brand Name>")) {
                parsedOld.settings.storeName = "Brand Name POS";
              }
              this.save(parsedOld);
              return parsedOld;
            }
          } catch(e) {}
        }
        this.save(SEED_DATA);
        return JSON.parse(JSON.stringify(SEED_DATA));
      }
      const parsed = JSON.parse(stored);
      // Ensure store name is migrated if old brand name is stored
      if (parsed.settings && parsed.settings.storeName && (parsed.settings.storeName.includes("AQUA FRESH") || parsed.settings.storeName.includes("<Brand Name>"))) {
        parsed.settings.storeName = "Brand Name POS";
        this.save(parsed);
      }
      // Ensure laundry structures exist
      if (!parsed.products || parsed.products.length === 0 || !parsed.settings?.claimPrefix) {
        this.save(SEED_DATA);
        return JSON.parse(JSON.stringify(SEED_DATA));
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
    downloadAnchor.setAttribute("download", `laundry_pos_backup_${timestamp}.json`);
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
