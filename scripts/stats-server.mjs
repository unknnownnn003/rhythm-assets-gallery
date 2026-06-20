import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.STATS_DATA_DIR?.trim() || "/www/wwwroot/stats-data";
const DATA_FILE = process.env.STATS_DATA_FILE?.trim() || path.join(DATA_DIR, "stats.json");
const APK_RUNTIME_DIR = process.env.ARCAEA_APK_RUNTIME_DIR?.trim() || path.join(DATA_DIR, "arcaea-apk");
const APK_META_FILE = process.env.ARCAEA_APK_META_FILE?.trim() || path.join(APK_RUNTIME_DIR, "arcaea-apk.json");
const APK_DOWNLOAD_DIR = process.env.ARCAEA_APK_DOWNLOAD_DIR?.trim() || path.join(APK_RUNTIME_DIR, "files");
const PORT = parseInt(process.env.STATS_PORT ?? "3001", 10);
const SITE_ORIGIN = "https://www.unknnownnn.homes";
const DEFAULT_ALLOWED_ORIGINS = [SITE_ORIGIN, "http://localhost:4321"];
const SALT = process.env.STATS_SALT?.trim();
const LOOPBACK_V4_HOST = ["127", "0", "0", "1"].join(".");
const LISTEN_HOST = process.env.STATS_HOST?.trim() || LOOPBACK_V4_HOST;
const APK_DOWNLOAD_LATEST_PATH = "/api/download/arcaea/latest";
const TRACK_COOLDOWN_MS = parsePositiveInt(process.env.STATS_TRACK_COOLDOWN_MS, 15_000);
const ALLOWED_ORIGINS = new Set(
  (process.env.STATS_ALLOWED_ORIGINS?.split(",") ?? DEFAULT_ALLOWED_ORIGINS)
    .map((value) => value.trim())
    .filter(Boolean),
);
const recentTrackByVisitor = new Map();
const RECENT_TRACK_MAX_SIZE = 10_000;

if (!SALT) {
  throw new Error("STATS_SALT is required");
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
  }
}

function ensureDataDir() {
  ensureDir(DATA_DIR);
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { days: {} };
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.days) return parsed;
    console.warn("[stats] data file missing .days, treating as empty:", DATA_FILE);
  } catch (err) {
    const backupPath = `${DATA_FILE}.corrupt-${Date.now()}`;
    try {
      fs.copyFileSync(DATA_FILE, backupPath);
      console.warn("[stats] corrupt data file backed up to:", backupPath);
    } catch (backupErr) {
      console.warn("[stats] failed to back up corrupt data file:", backupErr.message);
    }
  }
  return { days: {} };
}

function saveData(data) {
  const tmpPath = `${DATA_FILE}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data) + "\n", { flag: "w" });
    fs.renameSync(tmpPath, DATA_FILE);
  } catch (err) {
    console.warn("[stats] failed to save data:", err.message);
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + SALT).digest("hex").slice(0, 16);
}

function normalizeOrigin(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function appendVary(res, value) {
  const current = res.getHeader("Vary");
  if (!current) {
    res.setHeader("Vary", value);
    return;
  }

  const existing = String(current)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!existing.includes(value)) {
    existing.push(value);
    res.setHeader("Vary", existing.join(", "));
  }
}

function applySecurityHeaders(res) {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
}

function applyCorsHeaders(req, res) {
  const origin = normalizeOrigin(req.headers.origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  appendVary(res, "Origin");
  return true;
}

function isTrustedTrackRequest(req) {
  const origin = normalizeOrigin(req.headers.origin);
  if (origin) {
    return ALLOWED_ORIGINS.has(origin);
  }

  const fetchSiteHeader = req.headers["sec-fetch-site"];
  const fetchSite = Array.isArray(fetchSiteHeader) ? fetchSiteHeader[0] : fetchSiteHeader;
  if (fetchSite === "cross-site") {
    return false;
  }

  return true;
}

function shouldCountTrack(ipHash) {
  const now = Date.now();
  const previous = recentTrackByVisitor.get(ipHash) ?? 0;
  if (now - previous < TRACK_COOLDOWN_MS) {
    return false;
  }

  recentTrackByVisitor.set(ipHash, now);
  const cutoff = now - TRACK_COOLDOWN_MS;
  for (const [key, timestamp] of recentTrackByVisitor) {
    if (timestamp < cutoff) {
      recentTrackByVisitor.delete(key);
    }
  }

  if (recentTrackByVisitor.size > RECENT_TRACK_MAX_SIZE) {
    const entries = [...recentTrackByVisitor.entries()].sort((a, b) => a[1] - b[1]);
    const evictCount = entries.length - RECENT_TRACK_MAX_SIZE;
    for (let i = 0; i < evictCount; i++) {
      recentTrackByVisitor.delete(entries[i][0]);
    }
  }

  return true;
}

function cleanOldDays(data) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = localDateString(cutoff);

  for (const day of Object.keys(data.days)) {
    if (day < cutoffStr) delete data.days[day];
  }
}

function computeStats(data) {
  const now = new Date();
  const today = localDateString(now);

  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const mondayStr = localDateString(monday);

  let todayVisitors = 0;
  let todayViews = 0;
  if (data.days[today]) {
    todayVisitors = Array.isArray(data.days[today].visitors) ? data.days[today].visitors.length : 0;
    todayViews = data.days[today].views ?? 0;
  }

  const weekVisitorSet = new Set();
  let weekViews = 0;
  for (const [day, dayData] of Object.entries(data.days)) {
    if (day >= mondayStr && day <= today) {
      weekViews += dayData.views ?? 0;
      if (Array.isArray(dayData.visitors)) {
        for (const visitor of dayData.visitors) weekVisitorSet.add(visitor);
      }
    }
  }

  const days = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - index);
    const dateString = localDateString(date);
    const dayData = data.days[dateString];
    days.push({
      date: dateString,
      visitors: dayData && Array.isArray(dayData.visitors) ? dayData.visitors.length : 0,
      views: dayData?.views ?? 0,
    });
  }

  return {
    todayVisitors,
    todayViews,
    weekVisitors: weekVisitorSet.size,
    weekViews,
    days,
  };
}

function trackAndGetStats(clientIp) {
  ensureDataDir();

  const ipHash = hashIp(clientIp || "unknown-client");
  const today = localDateString();

  const data = loadData();
  cleanOldDays(data);

  if (!data.days[today]) {
    data.days[today] = { visitors: [], views: 0 };
  }

  if (shouldCountTrack(ipHash)) {
    data.days[today].views += 1;
  }
  if (!data.days[today].visitors.includes(ipHash)) {
    data.days[today].visitors.push(ipHash);
  }

  saveData(data);
  return computeStats(data);
}

function getStats() {
  ensureDataDir();
  const data = loadData();
  return computeStats(data);
}

function normalizeApkEntry(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  const filename = typeof raw.filename === "string" ? path.basename(raw.filename.trim()) : "";
  const sizeBytes =
    typeof raw.sizeBytes === "number"
      ? raw.sizeBytes
      : typeof raw.sizeBytes === "string"
        ? Number(raw.sizeBytes)
        : 0;
  const scrapedAt = typeof raw.scrapedAt === "string" ? raw.scrapedAt : "";

  if (!version || !filename || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || !scrapedAt) {
    return null;
  }

  return { version, filename, sizeBytes, scrapedAt };
}

function loadApkMeta() {
  try {
    if (!fs.existsSync(APK_META_FILE)) {
      return { latest: null, history: [], lastChecked: "", downloadCount: 0 };
    }

    const raw = JSON.parse(fs.readFileSync(APK_META_FILE, "utf8"));
    const history = Array.isArray(raw.history) ? raw.history.map(normalizeApkEntry).filter(Boolean) : [];
    const latest = normalizeApkEntry(raw.latest) ?? history[0] ?? null;
    const lastChecked = typeof raw.lastChecked === "string" ? raw.lastChecked : "";
    const downloadCount = typeof raw.downloadCount === "number" && raw.downloadCount >= 0 ? raw.downloadCount : 0;

    return { latest, history, lastChecked, downloadCount };
  } catch {
    return { latest: null, history: [], lastChecked: "", downloadCount: 0 };
  }
}

function incrementApkDownloadCount() {
  try {
    if (!fs.existsSync(APK_META_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(APK_META_FILE, "utf8"));
    raw.downloadCount = (typeof raw.downloadCount === "number" ? raw.downloadCount : 0) + 1;
    const tmpPath = `${APK_META_FILE}.tmp-${process.pid}`;
    fs.writeFileSync(tmpPath, JSON.stringify(raw, null, 2) + "\n");
    fs.renameSync(tmpPath, APK_META_FILE);
  } catch (err) {
    console.warn("[stats] failed to increment APK download count:", err.message);
  }
}

function getPublicApkMeta() {
  const meta = loadApkMeta();
  return {
    latest: meta.latest,
    history: meta.history,
    lastChecked: meta.lastChecked,
    downloadCount: meta.downloadCount,
    downloadHref: APK_DOWNLOAD_LATEST_PATH,
  };
}

function isSafeApkFileName(fileName) {
  return fileName === path.basename(fileName) && /\.apk$/i.test(fileName);
}

function resolveApkPath(fileName) {
  if (!isSafeApkFileName(fileName)) {
    return null;
  }

  const baseDir = path.resolve(APK_DOWNLOAD_DIR);
  const filePath = path.resolve(baseDir, fileName);
  const relative = path.relative(baseDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

function resolveLatestApk() {
  const meta = loadApkMeta();
  const entry = meta.latest ?? meta.history[0] ?? null;
  if (!entry) {
    return null;
  }

  const filePath = resolveApkPath(entry.filename);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return { entry, filePath };
}

function resolveNamedApk(fileName) {
  if (!isSafeApkFileName(fileName)) {
    return null;
  }

  const meta = loadApkMeta();
  const entry = meta.history.find((item) => item.filename === fileName);
  if (!entry) {
    return null;
  }

  const filePath = resolveApkPath(entry.filename);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return { entry, filePath };
}

function parseRangeHeader(rangeHeader, totalSize) {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) {
    return null;
  }

  const raw = rangeHeader.slice("bytes=".length).split(",")[0]?.trim();
  if (!raw) {
    return null;
  }

  const [startText, endText] = raw.split("-");

  if (startText === "") {
    const suffixLength = Number.parseInt(endText, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return "invalid";
    }

    const start = Math.max(totalSize - suffixLength, 0);
    return { start, end: totalSize - 1 };
  }

  const start = Number.parseInt(startText, 10);
  const end = endText ? Number.parseInt(endText, 10) : totalSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= totalSize) {
    return "invalid";
  }

  return { start, end: Math.min(end, totalSize - 1) };
}

function buildContentDisposition(fileName) {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]+/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendApkFile(req, res, resolvedApk, cacheControl) {
  const { entry, filePath } = resolvedApk;
  const stat = fs.statSync(filePath);
  const totalSize = stat.size;
  const range = parseRangeHeader(req.headers.range, totalSize);

  if (range === "invalid") {
    res.writeHead(416, {
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
      "Content-Range": `bytes */${totalSize}`,
    });
    res.end();
    return;
  }

  const statusCode = range ? 206 : 200;
  const start = range ? range.start : 0;
  const end = range ? range.end : totalSize - 1;
  const contentLength = end - start + 1;

  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "Content-Disposition": buildContentDisposition(entry.filename),
    "Content-Length": String(contentLength),
    "Content-Type": "application/vnd.android.package-archive",
    ETag: `W/"${totalSize}-${Math.trunc(stat.mtimeMs)}"`,
    "Last-Modified": stat.mtime.toUTCString(),
  };

  if (range) {
    headers["Content-Range"] = `bytes ${start}-${end}/${totalSize}`;
  }

  res.writeHead(statusCode, headers);

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath, { start, end });
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.end("Internal Server Error");
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    applySecurityHeaders(res);
    const hasCorsHeaders = applyCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      if (!hasCorsHeaders) {
        res.writeHead(403, { "Cache-Control": "no-store, no-cache, must-revalidate" });
        res.end("Forbidden");
        return;
      }

      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/api/stats") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

      const shouldTrack = url.searchParams.has("track");
      if (shouldTrack && !isTrustedTrackRequest(req)) {
        sendJson(res, 403, { error: "Cross-site tracking is not allowed." });
        return;
      }

      const clientIp =
        req.headers["x-real-ip"] ||
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown-client";

      const stats = shouldTrack ? trackAndGetStats(clientIp) : getStats();
      sendJson(res, 200, stats);
      return;
    }

    if (url.pathname === "/api/apk/arcaea/latest") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      sendJson(res, 200, getPublicApkMeta());
      return;
    }

    if (url.pathname === APK_DOWNLOAD_LATEST_PATH) {
      const latestApk = resolveLatestApk();
      if (!latestApk) {
        res.writeHead(404, { "Cache-Control": "no-store, no-cache, must-revalidate" });
        res.end("APK Not Found");
        return;
      }

      if (req.method === "GET" && !req.headers.range) {
        incrementApkDownloadCount();
      }
      sendApkFile(req, res, latestApk, "no-store, no-cache, must-revalidate");
      return;
    }

    const fileMatch = url.pathname.match(/^\/api\/download\/arcaea\/([^/]+)$/);
    if (fileMatch) {
      const namedApk = resolveNamedApk(decodeURIComponent(fileMatch[1]));
      if (!namedApk) {
        res.writeHead(404, { "Cache-Control": "no-store, no-cache, must-revalidate" });
        res.end("APK Not Found");
        return;
      }

      if (req.method === "GET" && !req.headers.range) {
        incrementApkDownloadCount();
      }
      sendApkFile(req, res, namedApk, "public, max-age=300");
      return;
    }

    res.writeHead(404, { "Cache-Control": "no-store, no-cache, must-revalidate" });
    res.end("Not Found");
  } catch {
    res.writeHead(500, { "Cache-Control": "no-store, no-cache, must-revalidate" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, LISTEN_HOST, () => {
  console.log(`stats-api listening on http://${LISTEN_HOST}:${PORT}`);
});

setInterval(() => {
  const cutoff = Date.now() - TRACK_COOLDOWN_MS;
  for (const [key, timestamp] of recentTrackByVisitor) {
    if (timestamp < cutoff) {
      recentTrackByVisitor.delete(key);
    }
  }
}, TRACK_COOLDOWN_MS * 2);
