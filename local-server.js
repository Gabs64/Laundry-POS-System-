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

    cachedData = data;
    lastUpdatedTimestamp = Date.now();
    const tempFile = DB_FILE + '.tmp.' + Date.now();
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
    return true;
  } catch (e) {
    console.error('Error saving DB file:', e);
    return false;
  }
}

// Initial DB load on startup
loadServerData();

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

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Set CORS headers for seamless multi-device access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-Version');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  /* =========================================================
     REST API ENDPOINTS
     ========================================================= */

  // 1. GET /api/data
  if (pathname === '/api/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    return res.end(JSON.stringify({
      success: true,
      data: cachedData || loadServerData(),
      lastUpdated: lastUpdatedTimestamp
    }));
  }

  // 2. POST /api/data (Full state synchronization)
  if (pathname === '/api/data' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw);
      const dataToSave = parsed.data || parsed;

      if (!dataToSave || typeof dataToSave !== 'object') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({ success: false, error: 'Invalid data format' }));
      }

      const ok = saveServerData(dataToSave);
      if (ok) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({
          success: true,
          lastUpdated: lastUpdatedTimestamp
        }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({ success: false, error: 'Failed to write to disk' }));
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 3. GET /api/users
  if (pathname === '/api/users' && req.method === 'GET') {
    const dbData = cachedData || loadServerData();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    return res.end(JSON.stringify({
      success: true,
      users: dbData.users || []
    }));
  }

  // 4. POST /api/users (Add user directly to database)
  if (pathname === '/api/users' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const newUser = JSON.parse(raw);
      if (!newUser.username || !newUser.fullName) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({ success: false, error: 'Username and Full Name are required' }));
      }

      const dbData = cachedData || loadServerData();
      if (!Array.isArray(dbData.users)) dbData.users = [];

      // Check username conflict
      const exists = dbData.users.some(u => u.username.toLowerCase() === newUser.username.trim().toLowerCase());
      if (exists) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({ success: false, error: 'Username already exists' }));
      }

      const userRecord = {
        id: newUser.id || "usr-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        fullName: newUser.fullName.trim(),
        username: newUser.username.trim().toLowerCase(),
        password: newUser.password || "123456",
        role: newUser.role || "CASHIER",
        status: newUser.status || "active",
        isMaster: false,
        createdAt: new Date().toISOString()
      };

      dbData.users.push(userRecord);
      saveServerData(dbData);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({
        success: true,
        user: userRecord,
        users: dbData.users,
        lastUpdated: lastUpdatedTimestamp
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 5. PUT /api/users (Update user in database)
  if (pathname.startsWith('/api/users/') && req.method === 'PUT') {
    try {
      const targetId = decodeURIComponent(pathname.split('/api/users/')[1]);
      const raw = await readBody(req);
      const updates = JSON.parse(raw);

      const dbData = cachedData || loadServerData();
      const idx = (dbData.users || []).findIndex(u => u.id === targetId);

      if (idx === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({ success: false, error: 'User not found' }));
      }

      const existing = dbData.users[idx];
      const isMaster = existing.isMaster || existing.id === 'usr-admin';

      existing.fullName = updates.fullName ? updates.fullName.trim() : existing.fullName;
      existing.username = updates.username ? updates.username.trim().toLowerCase() : existing.username;
      if (updates.password) {
        existing.password = updates.password;
      }
      if (!isMaster) {
        existing.role = updates.role || existing.role;
        existing.status = updates.status || existing.status;
      }

      dbData.users[idx] = existing;
      saveServerData(dbData);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({
        success: true,
        user: existing,
        users: dbData.users,
        lastUpdated: lastUpdatedTimestamp
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 6. DELETE /api/users/:id (Delete user from database)
  if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
    const targetId = decodeURIComponent(pathname.split('/api/users/')[1]);
    const dbData = cachedData || loadServerData();
    const existing = (dbData.users || []).find(u => u.id === targetId);

    if (!existing) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({ success: false, error: 'User not found' }));
    }

    if (existing.isMaster || existing.id === 'usr-admin' || existing.role === 'ADMIN') {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({ success: false, error: 'Mother Admin account cannot be deleted' }));
    }

    dbData.users = dbData.users.filter(u => u.id !== targetId);
    saveServerData(dbData);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    return res.end(JSON.stringify({
      success: true,
      users: dbData.users,
      lastUpdated: lastUpdatedTimestamp
    }));
  }

  // 7. POST /api/auth/login (Authenticates against database file)
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { username, password } = JSON.parse(raw);
      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({ success: false, error: 'Username and password are required' }));
      }

      // Always read fresh from DB file
      const dbData = loadServerData();
      const users = dbData.users || [];
      const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

      if (!user || user.password !== password) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({ success: false, error: 'Invalid username or password' }));
      }

      if (user.status === 'disabled') {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({ success: false, error: 'Account is disabled. Contact your administrator.' }));
      }

      // Return clean authenticated user session
      const userSession = {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        isMaster: !!user.isMaster,
        status: user.status
      };

      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({
        success: true,
        user: userSession
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 8. POST /api/auth/verify
  if (pathname === '/api/auth/verify' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { userId } = JSON.parse(raw);
      const dbData = loadServerData();
      const users = dbData.users || [];
      const user = users.find(u => u.id === userId);

      if (!user || user.status === 'disabled') {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=UTF-8' });
        return res.end(JSON.stringify({ success: false, valid: false }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({
        success: true,
        valid: true,
        user: {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          role: user.role,
          isMaster: !!user.isMaster,
          status: user.status
        }
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({ success: false, valid: false }));
    }
  }

  // 9. POST /api/reset
  if (pathname === '/api/reset' && req.method === 'POST') {
    const cleanCopy = JSON.parse(JSON.stringify(CLEAN_SEED_DATA));
    saveServerData(cleanCopy);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    return res.end(JSON.stringify({
      success: true,
      data: cleanCopy,
      lastUpdated: lastUpdatedTimestamp
    }));
  }

  // 10. GET /api/health
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    return res.end(JSON.stringify({
      status: 'ok',
      dbFile: DB_FILE,
      dataDir: DATA_DIR,
      usersCount: (cachedData?.users || []).length,
      lastUpdated: lastUpdatedTimestamp
    }));
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
