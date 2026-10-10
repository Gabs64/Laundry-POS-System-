const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 3000;

// Determine persistent storage directory (Railway volume / custom / local)
function resolveDataDir() {
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  // Check standard Railway Volume mount path '/data'
  if (fs.existsSync('/data')) {
    try {
      fs.accessSync('/data', fs.constants.W_OK);
      return '/data';
    } catch (e) {}
  }
  return path.join(__dirname, 'data');
}

const DATA_DIR = resolveDataDir();
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create data directory:', e);
  }
}

const DB_FILE = path.join(DATA_DIR, 'pos-data.json');

const CLEAN_SEED_DATA = {
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

// In-memory cache + last modified timestamp
let cachedData = null;
let lastUpdatedTimestamp = Date.now();

function getStoreMinutesOfDay() {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    let h = 0, m = 0;
    for (const p of parts) {
      if (p.type === 'hour') h = parseInt(p.value, 10);
      if (p.type === 'minute') m = parseInt(p.value, 10);
    }
    if (h === 24) h = 0;
    return h * 60 + m;
  } catch (e) {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

function checkAutoDisableUsers(dbData) {
  if (!dbData || !Array.isArray(dbData.users)) return false;
  let modified = false;
  const now = new Date();
  const currentIso = now.toISOString();
  const currentMinutesOfDay = getStoreMinutesOfDay();

  const formatTime12 = (tStr) => {
    try {
      const parts = (tStr || '00:00').split(':').map(Number);
      const h = parts[0];
      const m = parts[1] || 0;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    } catch (e) {
      return tStr;
    }
  };

  dbData.users.forEach(u => {
    // Admin & Master Admin cannot be auto-disabled
    if (u.isMaster || u.id === 'usr-admin' || u.role === 'ADMIN') return;

    const isEnabled = u.autoDisableEnabled === true || u.autoDisableEnabled === 'true';

    if (isEnabled) {
      if (u.autoDisableType === 'datetime' || (!u.autoDisableType && u.autoDisableAt)) {
        if (u.status === 'disabled') return;
        if (u.autoDisableAt) {
          const disableTime = new Date(u.autoDisableAt).getTime();
          if (!isNaN(disableTime) && Date.now() >= disableTime) {
            u.status = 'disabled';
            u.activeSessionId = null;
            u.lastHeartbeat = null;
            u.isOnline = false;
            u.autoDisabledAt = currentIso;
            u.autoDisableReason = `Scheduled auto-disable time reached (${new Date(u.autoDisableAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })})`;
            modified = true;
          }
        }
      } else if (u.autoDisableType === 'daily') {
        const dailyInStr = u.autoDisableDailyIn || '08:00';
        const dailyOutStr = u.autoDisableDailyOut || u.autoDisableDailyTime || '17:00';

        const inParts = dailyInStr.split(':').map(Number);
        const outParts = dailyOutStr.split(':').map(Number);

        const inMinutes = (inParts[0] || 0) * 60 + (inParts[1] || 0);
        const outMinutes = (outParts[0] || 0) * 60 + (outParts[1] || 0);

        let isWithinShift = false;
        if (inMinutes <= outMinutes) {
          isWithinShift = currentMinutesOfDay >= inMinutes && currentMinutesOfDay < outMinutes;
        } else {
          // Overnight shift (e.g. 22:00 to 06:00)
          isWithinShift = currentMinutesOfDay >= inMinutes || currentMinutesOfDay < outMinutes;
        }

        const shiftLabel = `${formatTime12(dailyInStr)} - ${formatTime12(dailyOutStr)}`;

        if (isWithinShift) {
          // If account was disabled by daily schedule, automatically re-enable when shift window opens!
          if (u.status === 'disabled' && (!u.autoDisableReason || u.autoDisableReason.toLowerCase().includes('daily') || u.autoDisableReason.toLowerCase().includes('shift'))) {
            u.status = 'active';
            u.autoDisabledAt = null;
            u.autoDisableReason = null;
            modified = true;
          }
        } else {
          // Outside shift window -> auto-disable
          if (u.status !== 'disabled') {
            u.status = 'disabled';
            u.activeSessionId = null;
            u.lastHeartbeat = null;
            u.isOnline = false;
            u.autoDisabledAt = currentIso;
            u.autoDisableReason = `Outside daily shift window (${shiftLabel})`;
            modified = true;
          }
        }
      }
    }
  });

  return modified;
}

function loadServerData() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // Ensure master admin is always present
        if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
          parsed.users = [...CLEAN_SEED_DATA.users];
        } else {
          const hasAdmin = parsed.users.some(u => u.isMaster || u.id === 'usr-admin' || u.role === 'ADMIN');
          if (!hasAdmin) {
            parsed.users.unshift({ ...CLEAN_SEED_DATA.users[0] });
          }
        }
        cachedData = parsed;
        const stat = fs.statSync(DB_FILE);
        lastUpdatedTimestamp = stat.mtimeMs || Date.now();

        // Check if any staff accounts reached auto-disable time
        if (checkAutoDisableUsers(cachedData)) {
          saveServerData(cachedData);
        }

        return cachedData;
      }
    }
  } catch (e) {
    console.error('Error reading DB file, reinitializing:', e);
  }

  // Initialize clean data
  cachedData = JSON.parse(JSON.stringify(CLEAN_SEED_DATA));
  saveServerData(cachedData);
  return cachedData;
}

function saveServerData(data) {
  try {
    // Preserve root Master Admin account from being deleted
    if (!Array.isArray(data.users) || data.users.length === 0) {
      if (cachedData && Array.isArray(cachedData.users) && cachedData.users.length > 0) {
        data.users = cachedData.users;
      } else {
        data.users = [...CLEAN_SEED_DATA.users];
      }
    } else {
      const hasAdmin = data.users.some(u => u.isMaster || u.id === 'usr-admin' || u.role === 'ADMIN');
      if (!hasAdmin) {
        data.users.unshift({ ...CLEAN_SEED_DATA.users[0] });
      }
    }

    // Session state & auto-disable metadata
    if (cachedData && Array.isArray(cachedData.users) && Array.isArray(data.users)) {
      data.users.forEach(u => {
        const prev = cachedData.users.find(p => p.id === u.id);
        if (prev) {
          u.activeSessionId = prev.activeSessionId !== undefined ? prev.activeSessionId : null;
          u.lastHeartbeat = prev.lastHeartbeat !== undefined ? prev.lastHeartbeat : null;
          u.isOnline = prev.isOnline !== undefined ? prev.isOnline : false;
          u.lastLoginAt = prev.lastLoginAt || u.lastLoginAt || null;

          if (u.autoDisableEnabled === undefined) u.autoDisableEnabled = !!prev.autoDisableEnabled;
          if (u.autoDisableType === undefined) u.autoDisableType = prev.autoDisableType || 'datetime';
          if (u.autoDisableAt === undefined) u.autoDisableAt = prev.autoDisableAt || null;
          if (u.autoDisableDailyIn === undefined) u.autoDisableDailyIn = prev.autoDisableDailyIn || '08:00';
          if (u.autoDisableDailyOut === undefined) u.autoDisableDailyOut = prev.autoDisableDailyOut || prev.autoDisableDailyTime || '17:00';
          if (u.autoDisableDailyTime === undefined) u.autoDisableDailyTime = prev.autoDisableDailyOut || prev.autoDisableDailyTime || '17:00';
          if (u.autoDisabledAt === undefined) u.autoDisabledAt = prev.autoDisabledAt || null;
          if (u.autoDisableReason === undefined) u.autoDisableReason = prev.autoDisableReason || null;
          if (u.lastAutoDisabledDate === undefined) u.lastAutoDisabledDate = prev.lastAutoDisabledDate || null;
          if (u.lastEnabledAt === undefined) u.lastEnabledAt = prev.lastEnabledAt || null;
        }
      });
    }

    cachedData = data;
    lastUpdatedTimestamp = Date.now();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving DB file:', e);
    return false;
  }
}

// Initial DB load on startup
loadServerData();

// Background timer to check scheduled staff auto-disable every 10 seconds
setInterval(() => {
  try {
    const data = loadServerData();
    if (checkAutoDisableUsers(data)) {
      saveServerData(data);
    }
  } catch (err) {
    console.error('Auto-disable scheduler error:', err);
  }
}, 10000);

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 50 * 1024 * 1024) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
  });
  res.end(JSON.stringify(data));
}

const LAUNDRY_SUPPLIES_CATALOG = {
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
  '4800777998811': { name: 'Champion Powder Detergent', brand: 'Champion', unit: 'scoop', cost: 13.50, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Champion Powder Detergent.' },
  '4800777998828': { name: 'Champion Powder Detergent', brand: 'Champion', unit: 'scoop', cost: 13.50, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Champion Powder Detergent.' },

  // Callalily
  '4800333221100': { name: 'Callalily Fabric Conditioner', brand: 'Callalily', unit: 'sachet', cost: 11.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Callalily Fabric Conditioner.' },
  '4800333221117': { name: 'Callalily Fabric Conditioner', brand: 'Callalily', unit: 'sachet', cost: 11.00, categoryName: 'Fabric Softener / Fabcon', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Callalily Fabric Conditioner.' },

  // Gain & International Brands
  '037000806497': { name: 'Gain Detergent Pods', brand: 'Gain', unit: 'sachet', cost: 25.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Gain Detergent Pods.' },
  '037000806480': { name: 'Tide Detergent Pods', brand: 'Tide', unit: 'sachet', cost: 28.00, categoryName: 'Detergents & Materials', imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80', description: 'Tide Detergent Pods.' },
  '044600307685': { name: 'Clorox Bleach', brand: 'Clorox', unit: 'bottle', cost: 35.00, categoryName: 'Bleach & Additives', imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80', description: 'Clorox Bleach.' }
};

const KNOWN_LAUNDRY_BRANDS = [
  'Breeze', 'Ariel', 'Tide', 'Downy', 'Surf', 'Zonrox', 'Pride', 
  'Champion', 'Callalily', 'Gain', 'Clorox', 'Persil', 'Snuggle', 
  'Bounce', 'OxiClean', 'Woolite', 'Comfort', 'Sunlight', 'Dynamo',
  'Attack', 'Biozet', 'Arm & Hammer', 'Fabuloso', 'Kirkland'
];

function detectBrandFromText(text) {
  if (!text) return null;
  for (const b of KNOWN_LAUNDRY_BRANDS) {
    const rx = new RegExp('\\b' + b + '\\b', 'i');
    if (rx.test(text)) {
      return b;
    }
  }
  return null;
}

function detectBrandFromBarcodePrefix(code) {
  if (!code) return null;
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
  return null;
}

function formatBrandAndType(brand, text, unit) {
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
}

async function lookupBarcodeOnline(barcode) {
  const code = String(barcode || '').trim();
  if (!code) return { found: false, error: 'Empty barcode' };

  // 1. Direct Catalog Match (0ms)
  if (LAUNDRY_SUPPLIES_CATALOG[code]) {
    return {
      found: true,
      source: 'Verified Laundry Registry',
      barcode: code,
      ...LAUNDRY_SUPPLIES_CATALOG[code]
    };
  }

  // 2. Query DuckDuckGo web search to extract product title & brand
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(code)}`;
    const ddgRes = await fetch(searchUrl, {
      signal: AbortSignal.timeout(3200),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const titles = [...html.matchAll(/class=["']result__a["'][^>]*>([\s\S]*?)<\/a>/g)]
        .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim())
        .filter(t => t.length > 5 && !t.includes('DuckDuckGo'));

      for (const rawTitle of titles) {
        const detectedBrand = detectBrandFromText(rawTitle);
        if (detectedBrand || rawTitle.toLowerCase().includes('detergent') || rawTitle.toLowerCase().includes('liquid') || rawTitle.toLowerCase().includes('powder')) {
          let cleanTitle = rawTitle
            .replace(new RegExp(code, 'g'), '')
            .replace(/^[-\s|:]+/, '')
            .replace(/[-\s|:]+$/, '')
            .trim();

          // Expand common abbreviations
          cleanTitle = cleanTitle.replace(/\bDet\b/g, 'Detergent').replace(/\bLiq\b/g, 'Liquid').replace(/\bPwdr\b/g, 'Powder');

          const finalBrand = detectedBrand || detectBrandFromBarcodePrefix(code) || 'Detergent Brand';
          if (!cleanTitle.toLowerCase().includes(finalBrand.toLowerCase())) {
            cleanTitle = `${finalBrand} ${cleanTitle}`;
          }

          const lower = cleanTitle.toLowerCase();
          let unit = 'sachet';
          if (lower.includes('powder')) unit = 'scoop';
          else if (lower.includes('bottle')) unit = 'bottle';

          let category = 'Detergents & Materials';
          if (lower.includes('softener') || lower.includes('fabcon') || finalBrand === 'Downy') {
            category = 'Fabric Softener / Fabcon';
          } else if (lower.includes('bleach') || finalBrand === 'Zonrox' || finalBrand === 'Clorox') {
            category = 'Bleach & Additives';
          }

          const cleanName = formatBrandAndType(finalBrand, cleanTitle, unit);
          return {
            found: true,
            source: 'Online Search Registry',
            barcode: code,
            name: cleanName,
            brand: finalBrand,
            categoryName: category,
            unit: unit,
            cost: (unit === 'bottle' ? 25.00 : 15.00),
            imageUrl: (unit === 'scoop' ? 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80' : 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80'),
            description: `${cleanName} (Barcode: ${code})`
          };
        }
      }
    }
  } catch (e) {}

  // 3. Query UPCitemdb trial API
  try {
    const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(3000),
      headers: { 'Accept': 'application/json' }
    });
    if (upcRes.ok) {
      const upcData = await upcRes.json();
      if (upcData.code === 'OK' && Array.isArray(upcData.items) && upcData.items.length > 0) {
        const item = upcData.items[0];
        const lowerName = (item.title || '').toLowerCase();
        let unit = 'sachet';
        if (lowerName.includes('powder')) unit = 'scoop';
        else if (lowerName.includes('bottle')) unit = 'bottle';

        const brand = item.brand || detectBrandFromText(item.title) || detectBrandFromBarcodePrefix(code) || '';
        const cleanName = formatBrandAndType(brand, item.title, unit);

        return {
          found: true,
          source: 'UPCitemdb Global Registry',
          barcode: code,
          name: cleanName,
          brand: brand,
          categoryName: 'Detergents & Materials',
          unit: unit,
          cost: (item.lowest_recorded_price && item.lowest_recorded_price > 0) ? Math.round(item.lowest_recorded_price * 10) / 10 : 15.00,
          imageUrl: (item.images && item.images.length > 0) ? item.images[0] : 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80',
          description: item.description || `Barcode: ${code}`
        };
      }
    }
  } catch (e) {}

  // 4. Query Open Food / Products Facts
  try {
    const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'LaundryPOS/1.0 (POS System Barcode Detector)' }
    });
    if (offRes.ok) {
      const offData = await offRes.json();
      if (offData.status === 1 && offData.product) {
        const p = offData.product;
        const name = p.product_name || p.product_name_en || p.generic_name || `Product (${code})`;
        const brand = p.brands || p.brand_owner || detectBrandFromText(name) || detectBrandFromBarcodePrefix(code) || '';
        const lowerName = name.toLowerCase();
        let unit = 'sachet';
        if (lowerName.includes('powder')) unit = 'scoop';
        else if (lowerName.includes('bottle')) unit = 'bottle';
        const cleanName = formatBrandAndType(brand, name, unit);

        return {
          found: true,
          source: 'Open Product Registry',
          barcode: code,
          name: cleanName,
          brand: brand,
          categoryName: 'Detergents & Materials',
          unit: unit,
          cost: 15.00,
          imageUrl: p.image_url || p.image_front_url || 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80',
          description: p.generic_name || `Barcode: ${code}`
        };
      }
    }
  } catch (e) {}

  // 5. Smart Manufacturer & Brand Prefix Intelligence
  const prefixBrand = detectBrandFromBarcodePrefix(code);
  if (prefixBrand) {
    const name = formatBrandAndType(prefixBrand, `${prefixBrand} Detergent`, 'sachet');
    return {
      found: true,
      source: `${prefixBrand} Registry Detect`,
      barcode: code,
      name: name,
      brand: prefixBrand,
      categoryName: 'Detergents & Materials',
      unit: 'sachet',
      cost: 15.00,
      imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80',
      description: `${name} (Barcode: ${code})`
    };
  }

  // 6. Final fallback item
  const suffix = code.slice(-6) || code;
  return {
    found: false,
    source: 'Custom Barcode Scan',
    barcode: code,
    name: `Detergent Supply (${suffix})`,
    brand: 'Detergent Supply',
    categoryName: 'Detergents & Materials',
    unit: 'sachet',
    cost: 15.00,
    imageUrl: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=400&q=80',
    description: `Scanned custom supply item with barcode ${code}`
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  // Set CORS headers for seamless multi-device access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-Version, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  /* =========================================================
     REST API ENDPOINTS (Never fall through to static files)
     ========================================================= */
  if (pathname.startsWith('/api')) {
    // 1. GET /api/data
    if (pathname === '/api/data' && method === 'GET') {
      const data = loadServerData();
      return sendJson(res, 200, {
        success: true,
        data: data,
        lastUpdated: lastUpdatedTimestamp
      });
    }

    // 2. POST /api/data
    if (pathname === '/api/data' && method === 'POST') {
      try {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw);
        const dataToSave = parsed.data || parsed;

        if (!dataToSave || typeof dataToSave !== 'object') {
          return sendJson(res, 400, { success: false, error: 'Invalid data format' });
        }

        const ok = saveServerData(dataToSave);
        if (ok) {
          return sendJson(res, 200, {
            success: true,
            lastUpdated: lastUpdatedTimestamp
          });
        } else {
          return sendJson(res, 500, { success: false, error: 'Database write failed on server volume' });
        }
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // 3. GET /api/users
    if (pathname === '/api/users' && method === 'GET') {
      const dbData = loadServerData();
      return sendJson(res, 200, {
        success: true,
        users: dbData.users || []
      });
    }

    // 4. POST /api/users (Add user directly to database)
    if (pathname === '/api/users' && method === 'POST') {
      try {
        const raw = await readBody(req);
        const newUser = JSON.parse(raw);
        if (!newUser.username || !newUser.fullName) {
          return sendJson(res, 400, { success: false, error: 'Username and Full Name are required' });
        }

        const dbData = loadServerData();
        if (!Array.isArray(dbData.users)) dbData.users = [];

        // Check username conflict
        const exists = dbData.users.some(u => u.username.toLowerCase() === newUser.username.trim().toLowerCase());
        if (exists) {
          return sendJson(res, 400, { success: false, error: `Username "${newUser.username.trim()}" is already taken.` });
        }

        const userRecord = {
          id: newUser.id || "usr-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
          fullName: newUser.fullName.trim(),
          username: newUser.username.trim().toLowerCase(),
          password: newUser.password || "123456",
          role: newUser.role || "CASHIER",
          status: newUser.status || "active",
          isMaster: false,
          autoDisableEnabled: !!newUser.autoDisableEnabled,
          autoDisableType: newUser.autoDisableType || "datetime",
          autoDisableAt: newUser.autoDisableAt || null,
          autoDisableDailyIn: newUser.autoDisableDailyIn || "08:00",
          autoDisableDailyOut: newUser.autoDisableDailyOut || newUser.autoDisableDailyTime || "17:00",
          autoDisableDailyTime: newUser.autoDisableDailyOut || newUser.autoDisableDailyTime || "17:00",
          autoDisabledAt: newUser.autoDisabledAt || null,
          autoDisableReason: newUser.autoDisableReason || null,
          createdAt: new Date().toISOString()
        };

        dbData.users.push(userRecord);
        const ok = saveServerData(dbData);
        if (!ok) {
          return sendJson(res, 500, { success: false, error: 'Failed to write new user to database.' });
        }

        return sendJson(res, 200, {
          success: true,
          user: userRecord,
          users: dbData.users,
          lastUpdated: lastUpdatedTimestamp
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // 5. PUT /api/users/:id
    if (pathname.startsWith('/api/users/') && method === 'PUT') {
      try {
        const targetId = decodeURIComponent(pathname.replace('/api/users/', ''));
        const raw = await readBody(req);
        const updates = JSON.parse(raw);

        const dbData = loadServerData();
        const idx = (dbData.users || []).findIndex(u => u.id === targetId);

        if (idx === -1) {
          return sendJson(res, 404, { success: false, error: 'User account not found in database.' });
        }

        const existing = dbData.users[idx];
        const isMaster = existing.isMaster || existing.id === 'usr-admin';

        // Check username conflict if username is being changed
        if (updates.username && updates.username.trim().toLowerCase() !== existing.username.toLowerCase()) {
          const usernameConflict = dbData.users.some(u => u.id !== targetId && u.username.toLowerCase() === updates.username.trim().toLowerCase());
          if (usernameConflict) {
            return sendJson(res, 400, { success: false, error: `Username "${updates.username.trim()}" is already taken by another account.` });
          }
          existing.username = updates.username.trim().toLowerCase();
        }

        existing.fullName = updates.fullName ? updates.fullName.trim() : existing.fullName;
        if (updates.password) {
          existing.password = updates.password;
        }
        if (!isMaster) {
          existing.role = updates.role || existing.role;
          if (updates.status) {
            if (existing.status === 'disabled' && updates.status === 'active') {
              existing.lastEnabledAt = new Date().toISOString();
              existing.autoDisabledAt = null;
              existing.autoDisableReason = null;
            }
            existing.status = updates.status;
          }
          if (updates.autoDisableEnabled !== undefined) {
            existing.autoDisableEnabled = !!updates.autoDisableEnabled;
          }
          if (updates.autoDisableType !== undefined) {
            existing.autoDisableType = updates.autoDisableType;
          }
          if (updates.autoDisableAt !== undefined) {
            existing.autoDisableAt = updates.autoDisableAt;
          }
          if (updates.autoDisableDailyIn !== undefined) {
            existing.autoDisableDailyIn = updates.autoDisableDailyIn;
          }
          if (updates.autoDisableDailyOut !== undefined || updates.autoDisableDailyTime !== undefined) {
            existing.autoDisableDailyOut = updates.autoDisableDailyOut || updates.autoDisableDailyTime;
            existing.autoDisableDailyTime = existing.autoDisableDailyOut;
          }
        }

        dbData.users[idx] = existing;
        const ok = saveServerData(dbData);
        if (!ok) {
          return sendJson(res, 500, { success: false, error: 'Failed to save user updates to database.' });
        }

        return sendJson(res, 200, {
          success: true,
          user: existing,
          users: dbData.users,
          lastUpdated: lastUpdatedTimestamp
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // 6. DELETE /api/users/:id
    if (pathname.startsWith('/api/users/') && method === 'DELETE') {
      const targetId = decodeURIComponent(pathname.replace('/api/users/', ''));
      const dbData = loadServerData();
      const existing = (dbData.users || []).find(u => u.id === targetId);

      if (!existing) {
        return sendJson(res, 404, { success: false, error: 'User account not found in database.' });
      }

      if (existing.isMaster || existing.id === 'usr-admin' || existing.role === 'ADMIN') {
        return sendJson(res, 403, { success: false, error: 'The Master Admin account is permanent and cannot be deleted.' });
      }

      dbData.users = dbData.users.filter(u => u.id !== targetId);
      const ok = saveServerData(dbData);
      if (!ok) {
        return sendJson(res, 500, { success: false, error: 'Failed to delete user from database.' });
      }

      return sendJson(res, 200, {
        success: true,
        users: dbData.users,
        lastUpdated: lastUpdatedTimestamp
      });
    }

    // 7. POST /api/auth/login
    if (pathname === '/api/auth/login' && method === 'POST') {
      try {
        const raw = await readBody(req);
        const { username, password } = JSON.parse(raw);
        if (!username || !password) {
          return sendJson(res, 400, { success: false, error: 'Username and password are required' });
        }

        const dbData = loadServerData();
        // Check real-time auto-disable before login verification
        if (checkAutoDisableUsers(dbData)) {
          saveServerData(dbData);
        }

        const users = dbData.users || [];
        const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

        if (!user || user.password !== password) {
          return sendJson(res, 401, { success: false, error: 'Invalid username or password' });
        }

        if (user.status === 'disabled') {
          const reason = user.autoDisableReason
            ? `Account is disabled (${user.autoDisableReason}). Contact your administrator.`
            : 'Account is disabled. Contact your administrator.';
          return sendJson(res, 403, { success: false, error: reason });
        }

        // STRICT SINGLE DEVICE ENFORCEMENT ONLY FOR STAFF ACCOUNTS (EXCLUDES OWNER / ADMIN)
        const isOwnerOrAdmin = user.isMaster || user.role === 'ADMIN' || user.id === 'usr-admin';
        if (!isOwnerOrAdmin) {
          const now = Date.now();
          const HEARTBEAT_TIMEOUT_MS = 35000; // 35 seconds timeout for active heartbeats
          const isCurrentlyOnline = user.activeSessionId && user.lastHeartbeat && (now - user.lastHeartbeat < HEARTBEAT_TIMEOUT_MS);

          if (isCurrentlyOnline) {
            return sendJson(res, 409, {
              success: false,
              error: `This staff account is currently active and logged in on another device. Strictly only 1 device is allowed at a time for staff accounts. Please log out from the other device first.`
            });
          }
        }

        // Issue new unique session ID
        const now = Date.now();
        const sessionId = "sess-" + now + "-" + Math.random().toString(36).substr(2, 8);
        user.activeSessionId = sessionId;
        user.lastHeartbeat = now;
        user.isOnline = true;
        user.lastLoginAt = new Date().toISOString();

        saveServerData(dbData);

        return sendJson(res, 200, {
          success: true,
          sessionId: sessionId,
          user: {
            id: user.id,
            fullName: user.fullName,
            username: user.username,
            role: user.role,
            isMaster: !!user.isMaster,
            status: user.status,
            activeSessionId: sessionId,
            isOnline: true
          }
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // 8. POST /api/auth/heartbeat
    if (pathname === '/api/auth/heartbeat' && method === 'POST') {
      try {
        const raw = await readBody(req);
        const { userId, sessionId } = JSON.parse(raw);
        const dbData = loadServerData();
        if (checkAutoDisableUsers(dbData)) {
          saveServerData(dbData);
        }

        const users = dbData.users || [];
        const user = users.find(u => u.id === userId || (userId && u.username === userId));

        if (!user) {
          return sendJson(res, 200, { success: false, active: false, reason: 'User account not found.' });
        }

        if (user.status === 'disabled') {
          user.activeSessionId = null;
          user.isOnline = false;
          saveServerData(dbData);
          const reason = user.autoDisableReason || 'Account disabled by Administrator.';
          return sendJson(res, 200, { success: false, active: false, reason: reason });
        }

        const isOwnerOrAdmin = user.isMaster || user.role === 'ADMIN' || user.id === 'usr-admin';

        // Check if session is still the authorized active session (for staff accounts)
        if (!isOwnerOrAdmin) {
          if (!user.activeSessionId || (sessionId && user.activeSessionId !== sessionId)) {
            return sendJson(res, 200, {
              success: true,
              active: false,
              reason: 'Your device session has been freed by the Administrator or logged in on another device.'
            });
          }
        }

        // Refresh heartbeat
        user.lastHeartbeat = Date.now();
        user.isOnline = true;
        saveServerData(dbData);

        return sendJson(res, 200, {
          success: true,
          active: true
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, active: false, error: err.message });
      }
    }

    // 9. POST /api/auth/logout
    if (pathname === '/api/auth/logout' && method === 'POST') {
      try {
        const raw = await readBody(req);
        const { userId, sessionId } = JSON.parse(raw || '{}');
        const dbData = loadServerData();
        const users = dbData.users || [];
        const user = users.find(u => u.id === userId || (userId && u.username === userId));

        if (user) {
          user.activeSessionId = null;
          user.lastHeartbeat = null;
          user.isOnline = false;
          saveServerData(dbData);
        }

        return sendJson(res, 200, { success: true });
      } catch (err) {
        return sendJson(res, 200, { success: true });
      }
    }

    // 10. POST /api/auth/force-logout (Admin force disconnect)
    if (pathname === '/api/auth/force-logout' && method === 'POST') {
      try {
        const raw = await readBody(req);
        const { targetUserId } = JSON.parse(raw);
        const dbData = loadServerData();
        const users = dbData.users || [];
        const user = users.find(u => u.id === targetUserId || (targetUserId && u.username === targetUserId));

        if (!user) {
          return sendJson(res, 404, { success: false, error: 'User account not found.' });
        }

        user.activeSessionId = null;
        user.lastHeartbeat = null;
        user.isOnline = false;
        saveServerData(dbData);

        return sendJson(res, 200, {
          success: true,
          message: `Device session for ${user.fullName} has been freed.`,
          users: dbData.users
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // 11. POST /api/auth/verify
    if (pathname === '/api/auth/verify' && method === 'POST') {
      try {
        const raw = await readBody(req);
        const { userId, sessionId } = JSON.parse(raw);
        const dbData = loadServerData();
        const users = dbData.users || [];
        const user = users.find(u => u.id === userId);

        if (!user || user.status === 'disabled') {
          return sendJson(res, 401, { success: false, valid: false });
        }

        const isOwnerOrAdmin = user.isMaster || user.role === 'ADMIN' || user.id === 'usr-admin';

        if (!isOwnerOrAdmin && user.activeSessionId && sessionId && user.activeSessionId !== sessionId) {
          return sendJson(res, 200, { success: true, valid: false, reason: 'Session expired or active on another device.' });
        }

        return sendJson(res, 200, {
          success: true,
          valid: true,
          user: {
            id: user.id,
            fullName: user.fullName,
            username: user.username,
            role: user.role,
            isMaster: !!user.isMaster,
            status: user.status,
            activeSessionId: user.activeSessionId,
            isOnline: user.isOnline
          }
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, valid: false });
      }
    }

    // 12. POST /api/reset
    if (pathname === '/api/reset' && method === 'POST') {
      const cleanCopy = JSON.parse(JSON.stringify(CLEAN_SEED_DATA));
      saveServerData(cleanCopy);
      return sendJson(res, 200, {
        success: true,
        data: cleanCopy,
        lastUpdated: lastUpdatedTimestamp
      });
    }

    // 13. POST /api/sales/clear
    if (pathname === '/api/sales/clear' && method === 'POST') {
      const dbData = loadServerData();
      dbData.sales = [];
      saveServerData(dbData);
      return sendJson(res, 200, {
        success: true,
        data: dbData,
        lastUpdated: lastUpdatedTimestamp
      });
    }

    // 14. GET /api/barcode/lookup?code=...
    if (pathname === '/api/barcode/lookup' && method === 'GET') {
      const code = parsedUrl.searchParams.get('code') || '';
      try {
        const result = await lookupBarcodeOnline(code);
        return sendJson(res, 200, {
          success: true,
          ...result
        });
      } catch (err) {
        return sendJson(res, 500, {
          success: false,
          error: err.message || 'Failed to search barcode'
        });
      }
    }

    // 15. GET /api/health
    if (pathname === '/api/health') {
      const dbData = loadServerData();
      return sendJson(res, 200, {
        status: 'ok',
        dbFile: DB_FILE,
        dataDir: DATA_DIR,
        usersCount: (dbData.users || []).length,
        lastUpdated: lastUpdatedTimestamp
      });
    }

    // Any other unmatched /api route
    return sendJson(res, 404, { success: false, error: `API endpoint not found: ${method} ${pathname}` });
  }

  /* =========================================================
     STATIC FILE SERVING
     ========================================================= */
  let safePath = pathname;
  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  }

  let filePath = path.join(__dirname, safePath);

  // Security guard against directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    return res.end('403 Forbidden');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Page Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`POS System running at http://0.0.0.0:${PORT}/`);
  console.log(`Database storage location: ${DB_FILE}`);
});
