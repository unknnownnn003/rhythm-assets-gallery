import { existsSync, readFileSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import type { AssetItem } from "../src/lib/types";

type ThumbSize = {
  key: "thumbnailSmall" | "thumbnailMedium" | "thumbnailLarge";
  directory: "320w" | "640w" | "1280w";
  width: number;
};

type ThumbConfig = {
  assetRoot: string;
  thumbRoot: string;
  thumbBaseUrl: string;
};

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "public", "data");
const DEFAULT_ASSET_ROOT = path.join(PROJECT_ROOT, "public", "assets");
const DEFAULT_THUMB_ROOT = path.join(PROJECT_ROOT, "public", "thumbs");
const DEFAULT_THUMB_BASE_URL = "/thumbs";
const INDEX_FILES = ["arcaea-index.json", "phigros-index.json"] as const;
const THUMB_SIZES: ThumbSize[] = [
  { key: "thumbnailSmall", directory: "320w", width: 320 },
  { key: "thumbnailMedium", directory: "640w", width: 640 },
  { key: "thumbnailLarge", directory: "1280w", width: 1280 },
];

async function main() {
  loadEnvFile();

  const config = getThumbConfig();
  const indexes = await readIndexes();
  const allAssets = indexes.flatMap((index) => index.assets);

  let generated = 0;
  let skipped = 0;
  let warned = 0;

  for (const asset of allAssets) {
    const result = await processAsset(asset, config);
    generated += result.generated;
    skipped += result.skipped;
    warned += result.warned;
  }

  await writeIndexes(indexes);
  await writeRecentUpdates(allAssets);

  console.log(`generate-thumbnails: processed ${allAssets.length} asset(s).`);
  console.log(`generate-thumbnails: generated ${generated}, skipped ${skipped}, warnings ${warned}.`);
}

function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(equalsIndex + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function getThumbConfig(): ThumbConfig {
  return {
    assetRoot: path.resolve(PROJECT_ROOT, process.env.ASSET_ROOT || DEFAULT_ASSET_ROOT),
    thumbRoot: DEFAULT_THUMB_ROOT,
    thumbBaseUrl: normalizeBaseUrl(process.env.PUBLIC_THUMB_BASE_URL || DEFAULT_THUMB_BASE_URL),
  };
}

function normalizeBaseUrl(value: string) {
  const normalized = value.trim() || "/";
  return normalized === "/" ? "" : normalized.replace(/\/+$/, "");
}

async function readIndexes() {
  const indexes: Array<{ filename: string; assets: AssetItem[] }> = [];

  for (const filename of INDEX_FILES) {
    const filePath = path.join(DATA_DIR, filename);
    if (!existsSync(filePath)) {
      console.warn(`generate-thumbnails: missing ${filename}; run npm run scan first.`);
      indexes.push({ filename, assets: [] });
      continue;
    }

    const assets = JSON.parse(readFileSync(filePath, "utf8")) as AssetItem[];
    indexes.push({ filename, assets });
  }

  return indexes;
}

async function processAsset(asset: AssetItem, config: ThumbConfig) {
  let generated = 0;
  let skipped = 0;
  let warned = 0;
  const sourcePath = path.join(config.assetRoot, ...asset.relativePath.split("/"));

  if (!existsSync(sourcePath)) {
    console.warn(`generate-thumbnails: source file missing for ${asset.relativePath}`);
    return { generated, skipped, warned: warned + THUMB_SIZES.length };
  }

  try {
    const sourceStat = await stat(sourcePath);
    const metadata = await sharp(sourcePath, { animated: true }).metadata();
    asset.width = metadata.width;
    asset.height = metadata.height;
    asset.mtimeMs = Math.trunc(sourceStat.mtimeMs);

    for (const size of THUMB_SIZES) {
      const thumbPath = path.join(config.thumbRoot, size.directory, `${asset.id}.webp`);
      asset[size.key] = buildPublicUrl(config.thumbBaseUrl, `${size.directory}/${asset.id}.webp`);

      if (await isFresh(thumbPath, sourceStat.mtimeMs)) {
        skipped += 1;
        continue;
      }

      await mkdir(path.dirname(thumbPath), { recursive: true });
      await sharp(sourcePath, { animated: true })
        .resize({ width: size.width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(thumbPath);
      generated += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`generate-thumbnails: failed ${asset.relativePath}: ${message}`);
    warned += THUMB_SIZES.length;
  }

  return { generated, skipped, warned };
}

async function isFresh(targetPath: string, sourceMtimeMs: number) {
  if (!existsSync(targetPath)) {
    return false;
  }

  const targetStat = await stat(targetPath);
  return targetStat.mtimeMs >= sourceMtimeMs;
}

function buildPublicUrl(baseUrl: string, relativePath: string) {
  const encodedPath = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/${encodedPath}`;
}

async function writeIndexes(indexes: Array<{ filename: string; assets: AssetItem[] }>) {
  await mkdir(DATA_DIR, { recursive: true });

  for (const index of indexes) {
    await writeJson(index.filename, index.assets);
  }
}

async function writeRecentUpdates(assets: AssetItem[]) {
  const recentAssets = [...assets]
    .sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || a.relativePath.localeCompare(b.relativePath))
    .slice(0, 50);

  await writeJson("recent-updates.json", recentAssets);
}

async function writeJson(filename: string, value: unknown) {
  await writeFile(path.join(DATA_DIR, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
