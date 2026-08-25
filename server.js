const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const dataDir = process.env.VERCEL ? path.join(os.tmpdir(), "ibkr-ecosystem-study") : path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function ensureDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(
      dbPath,
      JSON.stringify({ users: [], sessions: [], transactions: [], nextAccount: 100100 }, null, 2)
    );
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.reject(new Error("Invalid JSON"));
    }
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(check));
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    accountNumber: user.accountNumber
  };
}

function getAuth(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

function recordTransaction(db, user, type, amount, meta = {}) {
  const transaction = {
    id: crypto.randomUUID(),
    userId: user.id,
    type,
    amount,
    balanceAfter: user.balance,
    createdAt: new Date().toISOString(),
    ...meta
  };
  db.transactions.push(transaction);
  return transaction;
}

function userWallet(db, user) {
  return {
    user: publicUser(user),
    accountNumber: user.accountNumber,
    balance: user.balance,
    buyingPower: Number((user.balance * 1.8).toFixed(2)),
    interestRate: 3.13,
    transactions: db.transactions.filter((tx) => tx.userId === user.id)
  };
}

async function handleApi(req, res) {
  const db = readDb();
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, service: "ibkr-ecosystem-study" });
    }

    if (req.method === "GET" && url.pathname === "/api/market") {
      return sendJson(res, 200, {
        markets: [
          { symbol: "IBKS", name: "IBKR Study Index", price: 241.32, change: 1.42 },
          { symbol: "GLBX", name: "Global Access Basket", price: 88.14, change: -0.24 },
          { symbol: "CASH", name: "Idle Cash Yield", price: 3.13, change: 0 }
        ]
      });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/signup") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const password = String(body.password || "");

      if (!name || !email || password.length < 6) {
        return sendJson(res, 400, { error: "Name, email, and a 6 character password are required." });
      }
      if (db.users.some((user) => user.email === email)) {
        return sendJson(res, 409, { error: "An account already exists for that email." });
      }

      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash: hashPassword(password),
        accountNumber: `IB-${db.nextAccount++}`,
        balance: 10000,
        createdAt: new Date().toISOString()
      };
      const token = makeToken();
      db.users.push(user);
      db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
      recordTransaction(db, user, "opening credit", 10000);
      writeDb(db);
      return sendJson(res, 201, { token, user: publicUser(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = db.users.find((item) => item.email === email);

      if (!user || !verifyPassword(password, user.passwordHash)) {
        return sendJson(res, 401, { error: "Invalid email or password." });
      }

      const token = makeToken();
      db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
      writeDb(db);
      return sendJson(res, 200, { token, user: publicUser(user) });
    }

    const user = getAuth(req, db);
    if (!user) {
      return sendJson(res, 401, { error: "Log in to continue." });
    }

    if (req.method === "GET" && url.pathname === "/api/wallet") {
      return sendJson(res, 200, userWallet(db, user));
    }

    if (req.method === "POST" && url.pathname === "/api/wallet/deposit") {
      const body = await parseBody(req);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return sendJson(res, 400, { error: "Enter a positive deposit amount." });
      }
      user.balance = Number((user.balance + amount).toFixed(2));
      recordTransaction(db, user, "deposit", amount);
      writeDb(db);
      return sendJson(res, 200, userWallet(db, user));
    }

    if (req.method === "POST" && url.pathname === "/api/wallet/withdraw") {
      const body = await parseBody(req);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return sendJson(res, 400, { error: "Enter a positive withdrawal amount." });
      }
      if (amount > user.balance) {
        return sendJson(res, 400, { error: "Insufficient wallet balance." });
      }
      user.balance = Number((user.balance - amount).toFixed(2));
      recordTransaction(db, user, "withdrawal", amount);
      writeDb(db);
      return sendJson(res, 200, userWallet(db, user));
    }

    if (req.method === "POST" && url.pathname === "/api/wallet/transfer") {
      const body = await parseBody(req);
      const amount = Number(body.amount);
      const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase();
      const recipient = db.users.find((item) => item.email === recipientEmail);
      if (!Number.isFinite(amount) || amount <= 0) {
        return sendJson(res, 400, { error: "Enter a positive transfer amount." });
      }
      if (!recipient || recipient.id === user.id) {
        return sendJson(res, 400, { error: "Enter a valid recipient email." });
      }
      if (amount > user.balance) {
        return sendJson(res, 400, { error: "Insufficient wallet balance." });
      }
      user.balance = Number((user.balance - amount).toFixed(2));
      recipient.balance = Number((recipient.balance + amount).toFixed(2));
      recordTransaction(db, user, "transfer sent", amount, { to: recipient.email });
      recordTransaction(db, recipient, "transfer received", amount, { from: user.email });
      writeDb(db);
      return sendJson(res, 200, userWallet(db, user));
    }

    return sendJson(res, 404, { error: "API route not found." });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(port, () => {
    ensureDb();
    console.log(`IBKR ecosystem study running at http://localhost:${port}`);
  });
}

module.exports = {
  createServer,
  handleApi
};
