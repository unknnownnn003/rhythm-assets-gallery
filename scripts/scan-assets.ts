import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import type { AssetCategory, AssetItem, GameName, SiteSummary, TagSummary } from "../src/lib/types";

type ScanConfig = {
  assetRoot: string;
  assetBaseUrl: string;
  thumbBaseUrl: string;
};

type ArcaeaPackMetadata = {
  id: string;
  section: string;
  pack_parent?: string;
  name_localized?: Record<string, string>;
  description_localized?: Record<string, string>;
};

type ArcaeaPackList = {
  packs?: ArcaeaPackMetadata[];
};

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "public", "data");
const ARCAEA_PACKLIST_PATH = path.join(PROJECT_ROOT, "scripts", "data", "arcaea-packlist-6.14.0c.json");
const ARCAEA_WIKI_BASE_URL = "https://wiki.arcaea.cn";
const DEFAULT_CONFIG: ScanConfig = {
  assetRoot: path.join(PROJECT_ROOT, "public", "assets"),
  assetBaseUrl: "/assets",
  thumbBaseUrl: "/thumbs",
};
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const KNOWN_CATEGORIES = [
  "曲绘（AI超分后）",
  "（已废弃）曲绘（超分后）",
  "曲包封面",
  "LinkPlay预览",
  "April Fools",
  "世界模式",
  "启动页面",
  "游玩背景",
  "曲绘",
  "头像",
  "角色",
  "立绘",
  "剧情",
] as const;

async function main() {
  loadEnvFile();

  const config = getScanConfig();
  const arcaeaPackMetadata = loadArcaeaPackMetadata();
  const files = existsSync(config.assetRoot) ? await collectImageFiles(config.assetRoot) : [];
  const assets = await buildAssets(files, config, arcaeaPackMetadata);

  const arcaeaAssets = assets.filter((asset) => asset.game === "Arcaea");
  const phigrosAssets = assets.filter((asset) => asset.game === "Phigros");
  const recentAssets = [...assets]
    .sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || a.relativePath.localeCompare(b.relativePath))
    .slice(0, 50);
  const tags = buildTagSummary(assets);
  const summary = buildSiteSummary(assets);

  await mkdir(DATA_DIR, { recursive: true });
  await writeJson("arcaea-index.json", arcaeaAssets);
  await writeJson("phigros-index.json", phigrosAssets);
  await writeJson("summary.json", summary);
  await writeJson("recent-updates.json", recentAssets);
  await writeJson("tags.json", tags);

  console.log(`scan-assets: scanned ${assets.length} image file(s).`);
  console.log(`scan-assets: Arcaea=${arcaeaAssets.length}, Phigros=${phigrosAssets.length}, Unknown=${assets.length - arcaeaAssets.length - phigrosAssets.length}.`);
}

function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const content = existsSync(envPath) ? readFileSyncUtf8(envPath) : "";
  for (const line of content.split(/\r?\n/)) {
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

function readFileSyncUtf8(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function loadArcaeaPackMetadata() {
  const packs = new Map<string, ArcaeaPackMetadata>();
  if (!existsSync(ARCAEA_PACKLIST_PATH)) {
    console.warn(`scan-assets: Arcaea packlist metadata not found at "${ARCAEA_PACKLIST_PATH}".`);
    return packs;
  }

  try {
    const data = JSON.parse(readFileSyncUtf8(ARCAEA_PACKLIST_PATH)) as ArcaeaPackList;
    for (const pack of data.packs ?? []) {
      if (pack.id) {
        packs.set(pack.id, pack);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`scan-assets: could not read Arcaea packlist metadata: ${message}`);
  }

  return packs;
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

function getScanConfig(): ScanConfig {
  return {
    assetRoot: path.resolve(PROJECT_ROOT, process.env.ASSET_ROOT || DEFAULT_CONFIG.assetRoot),
    assetBaseUrl: normalizeBaseUrl(process.env.PUBLIC_ASSET_BASE_URL || DEFAULT_CONFIG.assetBaseUrl),
    thumbBaseUrl: normalizeBaseUrl(process.env.PUBLIC_THUMB_BASE_URL || DEFAULT_CONFIG.thumbBaseUrl),
  };
}

function normalizeBaseUrl(value: string) {
  const normalized = value.trim() || "/";
  return normalized === "/" ? "" : normalized.replace(/\/+$/, "");
}

async function collectImageFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return collectImageFiles(entryPath);
      }
      if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        return [entryPath];
      }
      return [];
    }),
  );

  return files.flat().sort((a, b) => toPosixPath(path.relative(root, a)).localeCompare(toPosixPath(path.relative(root, b))));
}

async function buildAssets(
  filePaths: string[],
  config: ScanConfig,
  arcaeaPackMetadata: Map<string, ArcaeaPackMetadata>,
): Promise<AssetItem[]> {
  const assets: AssetItem[] = [];

  for (const filePath of filePaths) {
    try {
      assets.push(await buildAsset(filePath, config, arcaeaPackMetadata));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`scan-assets: skipped "${filePath}" because ${message}`);
    }
  }

  return assets.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function buildAsset(
  filePath: string,
  config: ScanConfig,
  arcaeaPackMetadata: Map<string, ArcaeaPackMetadata>,
): Promise<AssetItem> {
  const fileStat = await stat(filePath);
  const relativePath = toPosixPath(path.relative(config.assetRoot, filePath));
  const pathSegments = relativePath.split("/");
  const filename = path.basename(filePath);
  const extension = path.extname(filename).slice(1).toLowerCase();
  const id = stableId(relativePath);
  const game = detectGame(relativePath);
  const category = detectCategory(pathSegments);
  const parsed =
    game === "Arcaea"
      ? parseArcaeaFilename(filename)
      : game === "Phigros"
        ? parsePhigrosFilename(filename)
        : {};
  const arcaeaPack = game === "Arcaea" ? resolveArcaeaPack(filename, category, parsed.pack, arcaeaPackMetadata) : undefined;
  const title = arcaeaPack?.coverTitle || parsed.title || filenameToTitle(filename);

  const metadata = await readImageMetadata(filePath);
  const wikiUrl = buildWikiUrl({ game, category, title, pack: arcaeaPack?.metadata, bg: parsed.bg });

  const asset: AssetItem = {
    id,
    game,
    category,
    title,
    ...withoutEmpty({
      artist: parsed.artist,
      version: parsed.version,
      bydVersion: parsed.bydVersion,
      etrVersion: parsed.etrVersion,
      pack: arcaeaPack?.metadata.id ?? parsed.pack,
      packDisplayName: arcaeaPack ? getLocalizedValue(arcaeaPack.metadata.name_localized) : undefined,
      packDescription: arcaeaPack ? getLocalizedValue(arcaeaPack.metadata.description_localized) : undefined,
      packSection: arcaeaPack?.metadata.section,
      idx: parsed.idx,
      bpm: parsed.bpm,
      side: parsed.side,
      sideLabel: parsed.sideLabel,
      bg: parsed.bg,
      difficulty: parsed.difficulty,
      difficultyLabel: parsed.difficultyLabel,
    }),
    filename,
    extension,
    relativePath,
    url: buildPublicUrl(config.assetBaseUrl, relativePath),
    thumbnailSmall: buildPublicUrl(config.thumbBaseUrl, `320w/${id}.webp`),
    thumbnailMedium: buildPublicUrl(config.thumbBaseUrl, `640w/${id}.webp`),
    thumbnailLarge: buildPublicUrl(config.thumbBaseUrl, `1280w/${id}.webp`),
    sizeBytes: fileStat.size,
    width: metadata.width,
    height: metadata.height,
    mtimeMs: Math.trunc(fileStat.mtimeMs),
    wikiUrl,
    tags: [],
  };
  asset.tags = buildTags(asset, pathSegments);
  return asset;
}

async function readImageMetadata(filePath: string) {
  try {
    const metadata = await sharp(filePath, { animated: true }).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`scan-assets: could not read image metadata for "${filePath}": ${message}`);
    return {};
  }
}

function stableId(relativePath: string) {
  return createHash("sha1").update(relativePath.normalize("NFC")).digest("hex").slice(0, 16);
}

function detectGame(relativePath: string): GameName {
  if (/arcaea/i.test(relativePath)) {
    return "Arcaea";
  }
  if (/phigros/i.test(relativePath)) {
    return "Phigros";
  }
  return "Unknown";
}

function detectCategory(pathSegments: string[]): AssetCategory {
  const directorySegments = pathSegments.slice(0, -1);
  const gameIndex = findGameSegmentIndex(directorySegments);
  const categorySegments = gameIndex >= 0 ? directorySegments.slice(gameIndex + 1) : directorySegments;
  const searchSegments = categorySegments.length > 0 ? categorySegments : directorySegments;
  const sortedCategories = [...KNOWN_CATEGORIES].sort((a, b) => b.length - a.length);

  for (const segment of [...searchSegments].reverse()) {
    const knownCategory = sortedCategories.find((category) => segment.includes(category));
    if (knownCategory) {
      return knownCategory;
    }
  }

  const meaningfulSegment = [...searchSegments]
    .reverse()
    .find((segment) => !/arcaea|phigros/i.test(segment) && !/sample/i.test(segment) && segment.trim());

  return meaningfulSegment || "Unknown";
}

function findGameSegmentIndex(segments: string[]) {
  return segments.findIndex((segment) => /arcaea|phigros/i.test(segment));
}

function parseArcaeaFilename(filename: string): Partial<Pick<AssetItem, "title" | "artist" | "version" | "bydVersion" | "etrVersion" | "pack" | "idx" | "bpm" | "side" | "sideLabel" | "bg" | "difficulty" | "difficultyLabel">> {
  const stem = stripOptimizationSuffix(filename.replace(/\.[^.]+$/, ""));
  const parts = stem.split("_").map((part) => part.trim()).filter(Boolean);
  const idxIndex = parts.findIndex((part) => /^IDX\s+/i.test(part));
  const bpmIndex = parts.findIndex((part) => /^BPM\s+/i.test(part));
  const sideIndex = parts.findIndex((part) => /^SIDE\s+/i.test(part));

  if (idxIndex <= 0 || bpmIndex < 0 || sideIndex < 0) {
    return {};
  }

  const prefixParts = parts.slice(0, idxIndex);
  const idx = Number.parseInt(parts[idxIndex].replace(/^IDX\s+/i, "").trim(), 10);
  const bpm = parts[bpmIndex].replace(/^BPM\s+/i, "").trim();
  const side = parts[sideIndex].replace(/^SIDE\s+/i, "").trim();
  const suffixParts = parts.slice(sideIndex + 1);
  const difficultyCode = suffixParts.at(-1);
  const difficulty = formatArcaeaDifficulty(difficultyCode);
  const bgEndIndex = difficulty ? suffixParts.length - 2 : suffixParts.length - 1;
  const bg = bgEndIndex > 0 ? suffixParts.slice(0, bgEndIndex).join("_") : undefined;

  const versionIndex = prefixParts.findIndex((part) => /^\d+(?:\.\d+)+$/.test(part));
  if (versionIndex <= 0) {
    return {};
  }

  const { title, artist } = splitArcaeaTitleArtist(prefixParts.slice(0, versionIndex));
  const version = prefixParts[versionIndex];
  const tailParts = prefixParts.slice(versionIndex + 1);
  const bydIndex = tailParts.findIndex((part) => /^BYD\s+/i.test(part));
  const etrIndex = tailParts.findIndex((part) => /^ETR\s+/i.test(part));
  const bydVersion = bydIndex >= 0 ? tailParts[bydIndex].replace(/^BYD\s+/i, "").trim() : undefined;
  const etrVersion = etrIndex >= 0 ? tailParts[etrIndex].replace(/^ETR\s+/i, "").trim() : undefined;
  const pack = tailParts.filter((_, index) => index !== bydIndex && index !== etrIndex).join("_") || undefined;

  return withoutEmpty({
    title,
    artist,
    version,
    bydVersion,
    etrVersion,
    pack,
    idx: Number.isFinite(idx) ? idx : undefined,
    bpm,
    side,
    sideLabel: formatArcaeaSide(side),
    bg,
    difficulty,
    difficultyLabel: difficulty ? formatArcaeaDifficultyLabel(difficulty) : undefined,
  });
}

function parsePhigrosFilename(filename: string): Partial<Pick<AssetItem, "title" | "artist">> {
  const stem = filename.replace(/\.[^.]+$/, "").trim();
  if (stem === "Chronos Collapse - La Campanella") {
    return { title: stem };
  }

  const separator = " - ";
  const separatorIndex = stem.lastIndexOf(separator);
  if (separatorIndex <= 0) {
    return {};
  }

  return withoutEmpty({
    title: stem.slice(0, separatorIndex).trim(),
    artist: stem.slice(separatorIndex + separator.length).trim(),
  });
}

function resolveArcaeaPack(
  filename: string,
  category: AssetCategory,
  parsedPackId: string | undefined,
  packs: Map<string, ArcaeaPackMetadata>,
) {
  const cover = category === "曲包封面" ? parseArcaeaPackCoverFilename(filename, packs) : undefined;
  const packId = cover?.packId ?? parsedPackId;
  const metadata = packId ? packs.get(packId) : undefined;
  if (!metadata) {
    return undefined;
  }

  return {
    metadata,
    coverTitle: cover ? formatArcaeaPackCoverTitle(metadata, cover.variantLabels) : undefined,
  };
}

function parseArcaeaPackCoverFilename(filename: string, packs: Map<string, ArcaeaPackMetadata>) {
  const stem = filename.replace(/\.[^.]+$/, "");
  const variantLabels: string[] = [];
  let candidate = stem;

  if (candidate.endsWith("-pressed")) {
    candidate = candidate.slice(0, -"-pressed".length);
    variantLabels.push("按下态");
  }
  if (candidate.endsWith("_selected")) {
    candidate = candidate.slice(0, -"_selected".length);
    variantLabels.push("选中态");
  }
  if (candidate.endsWith("_alt")) {
    candidate = candidate.slice(0, -"_alt".length);
    variantLabels.push("备用");
  }

  const prefixLabelMap = [
    { prefix: "1080_select_", label: "选择封面" },
    { prefix: "1080_small_", label: "小封面" },
    { prefix: "divider_", label: "章节分隔" },
  ];

  for (const { prefix, label } of prefixLabelMap) {
    if (!candidate.startsWith(prefix)) {
      continue;
    }
    const packId = candidate.slice(prefix.length);
    if (packs.has(packId)) {
      return { packId, variantLabels: [label, ...variantLabels] };
    }
  }

  return undefined;
}

function formatArcaeaPackCoverTitle(pack: ArcaeaPackMetadata, variantLabels: string[]) {
  const displayName = getLocalizedValue(pack.name_localized) ?? pack.id;
  return variantLabels.length > 0 ? `${displayName}（${variantLabels.join(" / ")}）` : displayName;
}

function getLocalizedValue(value?: Record<string, string>) {
  return (
    value?.["zh-Hans"]?.trim() ||
    value?.["zh-Hant"]?.trim() ||
    value?.ja?.trim() ||
    value?.en?.trim()
  );
}

function buildWikiUrl(input: {
  game: GameName;
  category: AssetCategory;
  title: string;
  pack?: ArcaeaPackMetadata;
  bg?: string;
}) {
  if (input.game !== "Arcaea") {
    return undefined;
  }

  if (input.category === "曲包封面" && input.pack) {
    const packPageTitle = getLocalizedValue(input.pack.name_localized) ?? input.pack.id;
    return buildArcaeaWikiPageUrl(packPageTitle);
  }

  if (input.category === "游玩背景") {
    return `${buildArcaeaWikiPageUrl("背景列表")}#${encodeWikiTitle("游玩背景")}`;
  }

  if (input.category === "曲绘" || input.category === "曲绘（AI超分后）") {
    return buildArcaeaWikiPageUrl(input.title);
  }

  if (input.bg) {
    return `${buildArcaeaWikiPageUrl("背景列表")}#${encodeWikiTitle("游玩背景")}`;
  }

  return undefined;
}

function buildArcaeaWikiPageUrl(title: string) {
  return `${ARCAEA_WIKI_BASE_URL}/index.php/${encodeWikiTitle(title)}`;
}

function encodeWikiTitle(title: string) {
  return encodeURIComponent(title.trim().replace(/\s+/g, "_"));
}

function formatArcaeaSide(side?: string) {
  if (!side) {
    return undefined;
  }

  const normalized = side.trim().toLowerCase();
  if (normalized === "0") {
    return "光侧";
  }
  if (normalized === "1") {
    return "对立侧（暗侧）";
  }
  if (normalized === "2") {
    return "消色侧";
  }
  if (normalized === "3") {
    return "Lephon 侧";
  }
  return side;
}

function splitArcaeaTitleArtist(parts: string[]) {
  if (parts.length === 0) {
    return {};
  }
  if (parts.length === 1) {
    return { title: parts[0] };
  }

  const leadingSymbolCount = parts.findIndex((part) => hasLetterDigitOrCjk(part));
  if (leadingSymbolCount > 0) {
    return {
      title: parts.slice(0, leadingSymbolCount).join("_"),
      artist: parts.slice(leadingSymbolCount).join("_"),
    };
  }

  return {
    title: parts[0],
    artist: parts.slice(1).join("_"),
  };
}

function hasLetterDigitOrCjk(value: string) {
  return /[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/.test(value);
}

function formatArcaeaDifficulty(code?: string) {
  const normalized = code?.trim();
  if (normalized === "0") {
    return "PST";
  }
  if (normalized === "1") {
    return "PRS";
  }
  if (normalized === "2") {
    return "FTR";
  }
  if (normalized === "3") {
    return "BYD";
  }
  if (normalized === "4") {
    return "ETR";
  }
  return undefined;
}

function formatArcaeaDifficultyLabel(difficulty: NonNullable<AssetItem["difficulty"]>) {
  const labels = {
    PST: "Past [PST]",
    PRS: "Present [PRS]",
    FTR: "Future [FTR]",
    BYD: "Beyond [BYD]",
    ETR: "Eternal [ETR]",
  } satisfies Record<NonNullable<AssetItem["difficulty"]>, string>;

  return labels[difficulty];
}

function filenameToTitle(filename: string) {
  return stripOptimizationSuffix(filename.replace(/\.[^.]+$/, "")).replace(/-+/g, " ").trim() || filename;
}

function stripOptimizationSuffix(value: string) {
  return value
    .replace(/\.(?:jpg|jpeg|png|webp|avif|gif)_opt$/i, "")
    .replace(/_opt$/i, "")
    .replace(/_optimization$/i, "");
}

function buildTags(input: AssetItem, pathSegments: string[]) {
  const tags = new Set<string>();
  tags.add(input.game);
  tags.add(input.category);
  tags.add(input.extension);
  addTag(tags, input.artist);
  addTag(tags, input.version);
  addTag(tags, input.packDisplayName ?? input.pack);
  addTag(tags, input.bydVersion ? `BYD ${input.bydVersion}` : undefined);
  addTag(tags, input.etrVersion ? `ETR ${input.etrVersion}` : undefined);
  addTag(tags, input.difficultyLabel);
  addTag(tags, input.sideLabel);
  addTag(tags, input.bg ? `背景 ${input.bg}` : undefined);
  if (input.idx !== undefined) {
    addTag(tags, `IDX ${input.idx}`);
  }

  const directorySegments = pathSegments.slice(0, -1);
  const gameIndex = findGameSegmentIndex(directorySegments);
  const tagSegments = gameIndex >= 0 ? directorySegments.slice(gameIndex + 1) : directorySegments;

  for (const segment of tagSegments) {
    if (segment && !/sample/i.test(segment) && !/arcaea|phigros/i.test(segment)) {
      tags.add(segment);
    }
  }

  return [...tags].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function addTag(tags: Set<string>, value?: string) {
  const normalized = value?.trim();
  if (normalized) {
    tags.add(normalized);
  }
}

function buildPublicUrl(baseUrl: string, relativePath: string) {
  const encodedPath = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/${encodedPath}`;
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function withoutEmpty<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== ""),
  ) as Partial<T>;
}

function buildTagSummary(assets: AssetItem[]): TagSummary[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    for (const tag of asset.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildSiteSummary(assets: AssetItem[]): SiteSummary {
  const games: GameName[] = ["Arcaea", "Phigros", "Unknown"];

  return {
    totalAssets: assets.length,
    games: games.map((game) => {
      const gameAssets = assets.filter((asset) => asset.game === game);
      return {
        game,
        totalAssets: gameAssets.length,
        categories: countBy(gameAssets, (asset) => asset.category),
        tags: countTags(gameAssets),
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return Object.fromEntries(
    [...items.reduce((counts, item) => {
      const key = getKey(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()).entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );
}

function countTags(assets: AssetItem[]) {
  return Object.fromEntries(
    buildTagSummary(assets)
      .map((tag) => [tag.name, tag.count] as const)
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
}

async function writeJson(filename: string, value: unknown) {
  await writeFile(path.join(DATA_DIR, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
