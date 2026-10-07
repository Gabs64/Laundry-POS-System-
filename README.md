# AQUA FRESH LAUNDRY & DRY CLEANING - POS & Management System

**Version:** 2.0 (Laundry & Dry Cleaning Edition)  
**Currency:** Philippine Peso (₱)  
**Architecture:** 2 Dedicated Standalone Web Sites (Cashier POS & Admin Management Portal) + Central Gateway  
**Technology:** HTML5, Modern Vanilla CSS (Light & Dark mode, Aqua Clean Theme, Glassmorphism, CSS Custom Properties), Vanilla JavaScript (Modular ES6), Chart.js, Lucide Icons, Web Audio API, Canvas Confetti.

---

## 🌐 Site URLs & Architecture

The system consists of **two dedicated standalone sites** connected through real-time synchronized storage:

| Site | URL / File | Primary Purpose | Default Role |
|---|---|---|---|
| **Central Portal & Login** | [`http://localhost:3000/index.html`](http://localhost:3000/index.html) | Authentication gateway & direct site launcher | All |
| **Cashier POS Site** | [`http://localhost:3000/pos.html`](http://localhost:3000/pos.html) | Dedicated cashier terminal for taking customer laundry orders, kg weighing, issuing claim stubs & tracking stages | Cashier |
| **Admin Dashboard Site** | [`http://localhost:3000/admin.html`](http://localhost:3000/admin.html) | Dedicated back-office portal for managing laundry services, dry clean rates, supplies stock, operational analytics, and customer claims | Admin |

> **Real-Time Cross-Tab Sync:** If you open `pos.html` in one window and `admin.html` in another, all orders and status changes made on the Cashier POS automatically update the Admin Dashboard metrics in real time via local storage event bus!

---

## 🚀 How to Run Locally

Start the local web server:
```bash
node local-server.js
```
Then navigate to:
- **Portal & Login:** [http://localhost:3000/](http://localhost:3000/)
- **Cashier POS Site:** [http://localhost:3000/pos.html](http://localhost:3000/pos.html)
- **Admin Dashboard Site:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

---

## 👥 Demo User Accounts

| Role | Name | Username | Password | Default Redirect |
|---|---|---|---|---|
| **ADMIN** | Administrator | `admin` | `admin123` | `admin.html` |
| **CASHIER** | John Doe | `cashier` | `cashier123` | `pos.html` |
| **CASHIER** | Maria Santos | `maria` | `cashier123` | `pos.html` |

---

## 🧺 Laundry Features Breakdown

### 1. Dedicated Cashier POS Site ([`pos.html`](file:///c:/Users/m4408/OneDrive/Documents/!CODE/POS%20System%20(PBS)/pos.html))
- **Laundry Services & Products Catalog:**
  - Categories: `[WASH & FOLD]`, `[DRY CLEANING]`, `[STEAM PRESS]`, `[BULKY & CARE]`, `[ADD-ONS & RETAIL]`.
  - Multi-unit pricing support (`kg`, `pc`, `set`, `pair`, `load`, `sachet`, `scoop`, `job`).
  - Search by service name, SKU, or barcode (`F2` shortcut).
  - Barcode scanner simulation modal.
- **Cart & Weight Management:**
  - Direct weight inputs for per-kilo items (e.g. `5.5 kg`, `7.2 kg`) and piece step increments.
  - Quick customer name & mobile number fields on the cart panel.
  - **Discounts:** Senior/PWD 20%, Loyalty 10%, Promo Voucher ₱50, Bulk Laundry (10kg+) 15%, or Custom.
- **Laundry Checkout & Due Date Calculation (`F4`):**
  - Customer contact details & special wash notes (e.g., "Separate darks", "Extra Downy", "Gentle steam").
  - Turnaround speeds: Standard (48 hrs), Next-Day (24 hrs), Express Rush (4 hrs), Gentle Care (72 hrs).
  - Payment options: Cash (change computation + denomination chips), GCash, and Card.
- **Laundry Status Tracker & Customer Pickups Modal:**
  - Live status tracking: `RECEIVED 📥` &rarr; `WASHING 🧼` &rarr; `DRYING 🌀` &rarr; `READY FOR PICKUP ✅` &rarr; `CLAIMED 🧺`.
  - 1-click status advancing and instant customer claim release.
  - Quick search by customer name, mobile no., or Claim Ticket #.
- **Dual Official Receipt & Customer Claim Stub:**
  - Dual layout with Official Sales Receipt + Tear-off Laundry Claim Stub with Barcode, promised ready date, total kg, and care notes.
  - 80mm thermal receipt printing format (`window.print()`).
  - Download receipt/stub as text file.

---

### 2. Dedicated Admin Dashboard Site ([`admin.html`](file:///c:/Users/m4408/OneDrive/Documents/!CODE/POS%20System%20(PBS)/admin.html))
- **Dashboard Overview:** Operational KPIs (Today's Laundry Sales ₱, Active Laundry Orders, Total Kg Washed, Supplies Alert), Recent claims feed, Top in-demand laundry services.
- **Dedicated Laundry Status Tracker:** Filter by status (`All`, `In-Progress`, `Ready for Pickup`, `Claimed`), update stages with 1-click, and reprint customer claim stubs anytime.
- **Services & Products Management:** Full CRUD, Unit selector (`kg`, `pc`, `set`, etc.), Service vs Supply toggle, and quick laundry image presets.
- **Service Categories:** Create, edit, and organize laundry categories with custom icons.
- **Supplies & Retail Inventory:** Monitor stock levels of detergents, fabric softeners, bleach, and garment bags; perform stock adjustments (*Restock, Used in Wash, Damaged, Correction*) with full audit logs.
- **Sales & Claim History:** Search by Claim #, customer name, cashier; filter by date range & payment method; export to CSV.
- **Reports & Analytics (Chart.js):** Sales Today/Week/Month, Average Order Value, Daily Revenue Trend, Revenue by Laundry Service Category, Payment Breakdown, and Cashier Order Volume.
- **Staff Accounts:** Manage Admin and Cashier accounts with active/disabled statuses.
- **Store & Policy Settings:** Configure Laundry Business Name, Tagline, Address, Contact, Default Turnaround Hours, Claim Prefix (`LND-2026-`), VAT Rate, and Claim Stub Policy Footer.

---

## ⌨️ Keyboard Shortcuts
- `F2`: Focus service search box
- `F4`: Open Laundry Checkout & Claim modal
- `Escape`: Close any open modal or dialog
