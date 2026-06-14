import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ARCAEA_URL = "https://arcaea.lowiro.com/zh";
const DOWNLOAD_DIR = join(process.cwd(), "public", "downloads", "arcaea");
const META_FILE = join(process.cwd(), "public", "data", "arcaea-apk.json");
const MAX_VERSIONS = 3;

type ApkVersion = {
  version: string;
  filename: string;
  url: string;
  filePath: string;
  sizeBytes: number;
  scrapedAt: string;
};

type ApkMeta = {
  latest: ApkVersion | null;
  history: ApkVersion[];
  lastChecked: string;
};

function readMeta(): ApkMeta {
  if (existsSync(META_FILE)) {
    try {
      return JSON.parse(readFileSync(META_FILE, "utf8")) as ApkMeta;
    } catch {
      // corrupted file, start fresh
    }
  }
  return { latest: null, history: [], lastChecked: "" };
}

function writeMeta(meta: ApkMeta) {
  const dir = join(META_FILE, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(META_FILE, JSON.stringify(meta, null, 2), "utf8");
}

async function scrapeApkLink() {
  console.log("[arcaea-apk] Launching browser...");
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    console.log(`[arcaea-apk] Navigating to ${ARCAEA_URL}...`);
    await page.goto(ARCAEA_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for the Vue SPA to render the download link
    await page.waitForSelector("a[href*='arcaea-static.lowiro-cdn.net']", { timeout: 20000 });

    const apkLink = await page.$("a[href*='arcaea-static.lowiro-cdn.net']");
    if (!apkLink) {
      throw new Error("APK download link not found on page.");
    }

    const href = await apkLink.getAttribute("href");
    if (!href) {
      throw new Error("APK link href is empty.");
    }

    // Extract version from nearby element or URL filename
    let version = "";
    const versionEl = await page.$(".version");
    if (versionEl) {
      const text = await versionEl.textContent();
      if (text) {
        version = text.replace(/版本\s*/i, "").trim();
      }
    }

    // Fallback: extract version from filename
    if (!version) {
      const url = new URL(href);
      const filename = url.searchParams.get("filename") ?? basename(url.pathname);
      const match = filename.match(/arcaea[_-](\d+\.\d+\.\d+[a-z]?)\./i);
      if (match) {
        version = match[1];
      }
    }

    const filename = new URL(href).searchParams.get("filename") ?? `arcaea_${version}.apk`;

    console.log(`[arcaea-apk] Found version: ${version}, filename: ${filename}`);
    return { version, filename, url: href };
  } finally {
    await browser.close();
  }
}

async function downloadApk(url: string, destPath: string) {
  console.log(`[arcaea-apk] Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const dir = join(destPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(destPath, buffer);

  return buffer.length;
}

async function cleanOldVersions(meta: ApkMeta) {
  const toRemove = meta.history.slice(MAX_VERSIONS);
  for (const entry of toRemove) {
    if (existsSync(entry.filePath)) {
      unlinkSync(entry.filePath);
      console.log(`[arcaea-apk] Removed old version: ${entry.version} (${entry.filePath})`);
    }
  }
  meta.history = meta.history.slice(0, MAX_VERSIONS);
}

async function main() {
  console.log("[arcaea-apk] Checking for new Arcaea APK...");

  const { version, filename, url } = await scrapeApkLink();
  const meta = readMeta();

  // Check if this version is already cached
  const existing = meta.history.find((entry) => entry.version === version);
  if (existing) {
    console.log(`[arcaea-apk] Version ${version} already cached. Updating timestamp.`);
    existing.scrapedAt = new Date().toISOString();
    meta.latest = existing;
    meta.lastChecked = new Date().toISOString();
    writeMeta(meta);
    console.log("[arcaea-apk] Done (no new version).");
    return;
  }

  // New version: download
  const destPath = join(DOWNLOAD_DIR, filename);

  let sizeBytes = 0;
  if (existsSync(destPath)) {
    console.log(`[arcaea-apk] File ${filename} already exists, skipping download.`);
    sizeBytes = statSync(destPath).size;
  } else {
    sizeBytes = await downloadApk(url, destPath);
    console.log(`[arcaea-apk] Downloaded ${(sizeBytes / 1024 / 1024).toFixed(1)} MB to ${destPath}`);
  }

  const newEntry: ApkVersion = {
    version,
    filename,
    url,
    filePath: destPath,
    sizeBytes,
    scrapedAt: new Date().toISOString(),
  };

  meta.history.unshift(newEntry);
  meta.latest = newEntry;
  meta.lastChecked = new Date().toISOString();

  await cleanOldVersions(meta);
  writeMeta(meta);

  console.log(`[arcaea-apk] Updated to version ${version}. History: ${meta.history.map((e) => e.version).join(", ")}`);
  console.log("[arcaea-apk] Done.");
}

main().catch((error) => {
  console.error("[arcaea-apk] Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
