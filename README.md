# POS & Management System

**Version:** 2.0 (Clean Production Release)  
**Currency:** Philippine Peso (₱)  
**Architecture:** 2 Dedicated Standalone Web Sites (Cashier POS & Admin Management Portal) + Central Gateway  
**Technology:** HTML5, Modern Vanilla CSS (Light & Dark mode, Aqua Clean Theme, Glassmorphism, CSS Custom Properties), Vanilla JavaScript (Modular ES6), Chart.js, Lucide Icons, Web Audio API, Canvas Confetti.

---

## 🌐 Site URLs & Architecture

The system consists of **two dedicated standalone sites** connected through real-time synchronized storage:

| Site | URL / File | Primary Purpose | Default Role |
|---|---|---|---|
| **Central Portal & Login** | [`/index.html`](http://localhost:3000/index.html) | Authentication gateway & direct site launcher | All |
| **Cashier POS Site** | [`/pos.html`](http://localhost:3000/pos.html) | Dedicated cashier terminal for taking customer laundry orders, kg weighing, issuing claim stubs & tracking stages | Cashier |
| **Admin Dashboard Site** | [`/admin.html`](http://localhost:3000/admin.html) | Dedicated back-office portal for managing laundry services, dry clean rates, supplies stock, operational analytics, and customer claims | Admin |

> **Real-Time Cross-Tab Sync:** If you open `pos.html` in one window and `admin.html` in another, all orders and status changes made on the Cashier POS automatically update the Admin Dashboard metrics in real time via local storage event bus!

---

## 🚀 Deploying to Railway

1. Push this repository to GitHub.
2. In [Railway.app](https://railway.app), click **+ New Project** &rarr; **Deploy from GitHub repo**.
3. Select this repository.
4. Railway will automatically detect the Node.js project, execute `npm start` (`node local-server.js`), and assign a public HTTPS domain.

---

## 💻 Running Locally

Start the local web server:
```bash
node local-server.js
```
Then navigate to:
- **Portal & Login:** [http://localhost:3000/](http://localhost:3000/)
- **Cashier POS Site:** [http://localhost:3000/pos.html](http://localhost:3000/pos.html)
- **Admin Dashboard Site:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

---

## 🔑 Initial Owner / Admin Account

All demo products, categories, transactions, and logs have been completely cleared for a clean slate. The store owner begins with the default administrator credentials:

| Role | Username | Password | Default Redirect |
|---|---|---|---|
| **ADMIN / OWNER** | `admin` | `admin123` | `admin.html` |

*After logging into the Admin Dashboard, the owner can customize the store profile, create custom service categories, add products/services, and register staff cashier accounts.*

---

## 🧺 Key Features

### 1. Dedicated Cashier POS Site (`pos.html`)
- **Services & Products Catalog:** Multi-unit pricing (`kg`, `pc`, `set`, `pair`, `load`, `sachet`, `scoop`, `job`), barcode search (`F2`), scanner support.
- **Cart & Weight Management:** Direct kg weighing, customer details, discount presets (Senior/PWD, Loyalty, Voucher).
- **Laundry Checkout & Due Date Calculation (`F4`):** Special handling notes, turnaround options (Standard, Rush 4-hr), Cash/GCash/Card payments with automatic change computation.
- **Laundry Status Tracker:** Real-time stage updates (`RECEIVED` &rarr; `WASHING` &rarr; `DRYING` &rarr; `READY FOR PICKUP` &rarr; `CLAIMED`).
- **Thermal Receipt & Claim Stub:** Dual printing layout for customer receipt and tear-off claim stub.

### 2. Dedicated Admin Dashboard Site (`admin.html`)
- **Live Analytics & KPIs:** Revenue charts, active orders, total volume processed, stock alerts.
- **Catalog Management:** Create categories with custom icons, set service rates, configure retail supplies.
- **Inventory Control:** Stock adjustments, audit trails, restock logs.
- **Staff Accounts & Attendance:** Staff directory, automated time-in/time-out logging, monthly matrix & timesheets.
- **Store & Policy Configuration:** Store name, branding, tax rate, turnaround settings, claim stub footer.
- **Data Backup & Restore:** 1-click JSON backup export and import.

---

## ⌨️ Keyboard Shortcuts
- `F2`: Focus service search box
- `F4`: Open Laundry Checkout & Claim modal
- `Escape`: Close any open modal or dialog
