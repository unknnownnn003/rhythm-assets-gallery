import { chromium } from "playwright";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DEFAULT_SOURCE_PAGE = "https://arcaea.lowiro.com/zh";
const DEFAULT_RUNTIME_ROOT = join(process.cwd(), ".runtime", "arcaea-apk");
const DEFAULT_DOWNLOAD_DIR = join(DEFAULT_RUNTIME_ROOT, "files");
const DEFAULT_META_FILE = join(DEFAULT_RUNTIME_ROOT, "arcaea-apk.json");
const DEFAULT_KEEP_VERSIONS = 3;

type ApkVersion = {
  version: string;
  filename: string;
  sourceUrl: string;
  sizeBytes: number;
  scrapedAt: string;
};

type ApkMeta = {
  latest: ApkVersion | null;
  history: ApkVersion[];
  lastChecked: string;
};

type Config = {
  sourcePage: string;
  downloadDir: string;
  metaFile: string;
  keepVersions: number;
};

function printUsage() {
  console.log(
    [
      "Usage: npm run arcaea:check-apk -- [options]",
      "",
      "Options:",
      "  --download-dir <dir>   Directory used to store downloaded APK files.",
      "  --meta-file <file>     Private metadata JSON file path.",
      "  --keep <count>         Number of cached versions to retain. Default: 3.",
      "  --source-page <url>    Arcaea download page to inspect.",
      "",
      "Environment fallback:",
      "  ARCAEA_APK_DOWNLOAD_DIR",
      "  ARCAEA_APK_META_FILE",
      "  ARCAEA_APK_RETENTION",
      "  ARCAEA_APK_SOURCE_PAGE",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]) {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }

    parsed[arg.slice(2)] = value;
    index += 1;
  }

  return parsed;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }

  return parsed;
}

function loadConfig(): Config {
  const args = parseArgs(process.argv.slice(2));

  return {
    sourcePage: args["source-page"] || process.env.ARCAEA_APK_SOURCE_PAGE?.trim() || DEFAULT_SOURCE_PAGE,
    downloadDir: resolve(args["download-dir"] || process.env.ARCAEA_APK_DOWNLOAD_DIR?.trim() || DEFAULT_DOWNLOAD_DIR),
    metaFile: resolve(args["meta-file"] || process.env.ARCAEA_APK_META_FILE?.trim() || DEFAULT_META_FILE),
    keepVersions: parsePositiveInt(args.keep || process.env.ARCAEA_APK_RETENTION, DEFAULT_KEEP_VERSIONS),
  };
}

function ensureDir(dirPath: string) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function ensureParentDir(filePath: string) {
  ensureDir(dirname(filePath));
}

function normalizeEntry(raw: unknown): ApkVersion | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const version = typeof record.version === "string" ? record.version.trim() : "";
  const filename = typeof record.filename === "string" ? basename(record.filename.trim()) : "";
  const sourceUrl =
    typeof record.sourceUrl === "string"
      ? record.sourceUrl.trim()
      : typeof record.url === "string"
        ? record.url.trim()
        : "";
  const sizeBytes =
    typeof record.sizeBytes === "number"
      ? record.sizeBytes
      : typeof record.sizeBytes === "string"
        ? Number(record.sizeBytes)
        : 0;
  const scrapedAt = typeof record.scrapedAt === "string" ? record.scrapedAt : "";

  if (!version || !filename || !sourceUrl || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || !scrapedAt) {
    return null;
  }

  return {
    version,
    filename,
    sourceUrl,
    sizeBytes,
    scrapedAt,
  };
}

function readMeta(metaFile: string): ApkMeta {
  if (!existsSync(metaFile)) {
    return { latest: null, history: [], lastChecked: "" };
  }

  try {
    const raw = JSON.parse(readFileSync(metaFile, "utf8")) as Record<string, unknown>;
    const history = Array.isArray(raw.history) ? raw.history.map(normalizeEntry).filter(Boolean) as ApkVersion[] : [];
    const latest = normalizeEntry(raw.latest) ?? history[0] ?? null;
    const lastChecked = typeof raw.lastChecked === "string" ? raw.lastChecked : "";

    return { latest, history, lastChecked };
  } catch {
    return { latest: null, history: [], lastChecked: "" };
  }
}

function writeMeta(metaFile: string, meta: ApkMeta) {
  ensureParentDir(metaFile);
  writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

async function scrapeApkLink(sourcePage: string) {
  console.log("[arcaea-apk] Launching browser...");
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    console.log(`[arcaea-apk] Navigating to ${sourcePage}...`);
    await page.goto(sourcePage, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("a[href*='arcaea-static.lowiro-cdn.net']", { timeout: 20000 });

    const apkLink = await page.$("a[href*='arcaea-static.lowiro-cdn.net']");
    if (!apkLink) {
      throw new Error("APK download link not found on page.");
    }

    const href = await apkLink.getAttribute("href");
    if (!href) {
      throw new Error("APK link href is empty.");
    }

    let version = "";
    const versionEl = await page.$(".version");
    if (versionEl) {
      const text = await versionEl.textContent();
      if (text) {
        version = text.replace(/版本\s*/i, "").trim();
      }
    }

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
    return { version, filename: basename(filename), url: href };
  } finally {
    await browser.close();
  }
}

async function downloadApk(url: string, destPath: string) {
  console.log(`[arcaea-apk] Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  ensureParentDir(destPath);

  const tempPath = `${destPath}.part`;
  const stream = createWriteStream(tempPath, { flags: "w" });

  try {
    await pipeline(Readable.fromWeb(response.body), stream);
    renameSync(tempPath, destPath);
    return statSync(destPath).size;
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function pruneHistoryFiles(downloadDir: string, history: ApkVersion[]) {
  ensureDir(downloadDir);

  const keepNames = new Set(history.map((entry) => entry.filename));
  for (const fileName of readdirSync(downloadDir)) {
    const filePath = join(downloadDir, fileName);
    if (!statSync(filePath).isFile()) {
      continue;
    }

    if (fileName.endsWith(".part") || !keepNames.has(fileName)) {
      unlinkSync(filePath);
      console.log(`[arcaea-apk] Removed stale file: ${fileName}`);
    }
  }
}

function keepLatestHistory(history: ApkVersion[], keepVersions: number) {
  const seen = new Set<string>();
  const deduped: ApkVersion[] = [];

  for (const entry of history) {
    const key = `${entry.version}::${entry.filename}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }

  return deduped.slice(0, keepVersions);
}

async function main() {
  const config = loadConfig();

  console.log("[arcaea-apk] Checking for new Arcaea APK...");
  console.log(`[arcaea-apk] downloadDir=${config.downloadDir}`);
  console.log(`[arcaea-apk] metaFile=${config.metaFile}`);

  const { version, filename, url } = await scrapeApkLink(config.sourcePage);
  const meta = readMeta(config.metaFile);

  const existing = meta.history.find((entry) => entry.version === version);
  if (existing) {
    console.log(`[arcaea-apk] Version ${version} already cached. Updating timestamp.`);
    existing.scrapedAt = new Date().toISOString();
    meta.latest = existing;
    meta.lastChecked = new Date().toISOString();
    meta.history = keepLatestHistory(meta.history, config.keepVersions);
    pruneHistoryFiles(config.downloadDir, meta.history);
    writeMeta(config.metaFile, meta);
    console.log("[arcaea-apk] Done (no new version).");
    return;
  }

  const destPath = join(config.downloadDir, filename);
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
    sourceUrl: url,
    sizeBytes,
    scrapedAt: new Date().toISOString(),
  };

  meta.history = keepLatestHistory([newEntry, ...meta.history], config.keepVersions);
  meta.latest = meta.history[0] ?? null;
  meta.lastChecked = new Date().toISOString();

  pruneHistoryFiles(config.downloadDir, meta.history);
  writeMeta(config.metaFile, meta);

  console.log(`[arcaea-apk] Updated to version ${version}. History: ${meta.history.map((entry) => entry.version).join(", ")}`);
  console.log("[arcaea-apk] Done.");
}

main().catch((error) => {
  console.error("[arcaea-apk] Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
