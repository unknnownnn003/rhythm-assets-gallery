import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = "/www/wwwroot/stats-data";
const DATA_FILE = path.join(DATA_DIR, "stats.json");
const PORT = parseInt(process.env.STATS_PORT ?? "3001", 10);
const SALT = "rhythm-gallery-stats-salt";
const LISTEN_HOST = "127.0.0.1";

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o755 });
  }
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { days: {} };
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.days) return parsed;
  } catch { /* corrupt file, reset */ }
  return { days: {} };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data) + "\n", { flag: "w" });
  } catch { /* fail silently */ }
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + SALT).digest("hex").slice(0, 16);
}

function cleanOldDays(data) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  for (const day of Object.keys(data.days)) {
    if (day < cutoffStr) delete data.days[day];
  }
}

function computeStats(data) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Monday of current week
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const mondayStr = monday.toISOString().slice(0, 10);

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
        for (const v of dayData.visitors) weekVisitorSet.add(v);
      }
    }
  }

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const dayData = data.days[ds];
    days.push({
      date: ds,
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

  const ipHash = hashIp(clientIp || "0.0.0.0");
  const today = new Date().toISOString().slice(0, 10);

  const data = loadData();
  cleanOldDays(data);

  if (!data.days[today]) {
    data.days[today] = { visitors: [], views: 0 };
  }

  data.days[today].views++;
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

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (url.pathname === "/api/stats") {
      const shouldTrack = url.searchParams.has("track");
      const clientIp =
        req.headers["x-real-ip"] ||
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "0.0.0.0";

      const stats = shouldTrack ? trackAndGetStats(clientIp) : getStats();

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(stats));
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  } catch {
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

server.listen(PORT, LISTEN_HOST, () => {
  console.log(`stats-api listening on http://${LISTEN_HOST}:${PORT}`);
});
