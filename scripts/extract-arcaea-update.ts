import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type LocalizedText = Record<string, string | undefined>;

type SongDifficulty = {
  ratingClass?: number;
  title_localized?: LocalizedText;
  artist?: string;
  bpm?: string;
  bg?: string;
  version?: string;
  rating?: number;
  ratingPlus?: boolean;
  chartDesigner?: string;
  jacketDesigner?: string;
};

type Song = {
  idx?: number;
  id: string;
  title_localized?: LocalizedText;
  artist?: string;
  bpm?: string;
  set?: string;
  side?: number | string;
  bg?: string;
  version?: string;
  bydversion?: string;
  etrversion?: string;
  difficulties?: SongDifficulty[];
};

type Pack = {
  id: string;
  name_localized?: LocalizedText;
};

type ExtractedSource = {
  input: string;
  assetsDir: string;
  cleanupDir?: string;
};

type AssetRecord = {
  sourcePath: string;
  relativePath: string;
  hash: string;
  sizeBytes: number;
};

const PROJECT_ROOT = process.cwd();
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const DEFAULT_WORK_DIR = path.join(PROJECT_ROOT, ".arcaea-apk-work");
const TARGETS = [
  { category: "曲绘", test: (value: string) => /^songs\/(?!pack\/)[^/]+\/1080_base(?:_[0-4])?\.(?:jpg|jpeg|png|webp)$/i.test(value) && !/_256\./i.test(value) },
  { category: "曲包封面", test: (value: string) => /^songs\/pack\/.+\.(?:jpg|jpeg|png|webp)$/i.test(value) },
  { category: "剧情/cg", test: (value: string) => /^app-data\/story\/cg\/.+\.(?:jpg|jpeg|png|webp)$/i.test(value) },
  { category: "剧情贴图", test: (value: string) => /^app-data\/story\/vn\/res\/.+\.(?:jpg|jpeg|png|webp)$/i.test(value) || /^img\/story\/.+\.(?:jpg|jpeg|png|webp)$/i.test(value) },
  { category: "角色/立绘", test: (value: string) => /^char\/1080\/.+\.(?:jpg|jpeg|png|webp)$/i.test(value) },
  { category: "角色/头像", test: (value: string) => /^char\/[^/]+_icon\.(?:jpg|jpeg|png|webp)$/i.test(value) },
  { category: "角色/LinkPlay预览", test: (value: string) => /^char\/[^/]+_mp\.(?:jpg|jpeg|png|webp)$/i.test(value) },
  { category: "游玩背景", test: (value: string) => /^img\/bg\/1080\/.+\.(?:jpg|jpeg|png|webp)$/i.test(value) },
  { category: "LinkPlay贴纸", test: (value: string) => /^img\/multiplayer\/stickers\/.+\.(?:jpg|jpeg|png|webp)$/i.test(value) },
  { category: "世界模式", test: (value: string) => /^img\/world\/1080\/(?!act).+\.(?:jpg|jpeg|png|webp)$/i.test(value) },
  { category: "启动页面", test: (value: string) => /^startup\/1080\/.+\.(?:jpg|jpeg|png|webp)$/i.test(value) },
] as const;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const newInput = args.new;
  const oldInput = args.old;
  const out = args.out;
  if (!newInput || !oldInput || !out) {
    throw new Error("Usage: npm run arcaea:extract -- --new <new.apk|new-extracted-dir> --old <old.apk|old-extracted-dir> --out <output-dir>");
  }

  const outputDir = path.resolve(PROJECT_ROOT, out);
  const newSource = await prepareSource(path.resolve(PROJECT_ROOT, newInput), "new");
  const oldSource = await prepareSource(path.resolve(PROJECT_ROOT, oldInput), "old");

  try {
    const songs = readSongs(newSource.assetsDir);
    const packs = readPacks(newSource.assetsDir);
    const newRecords = await collectTargetRecords(newSource.assetsDir);
    const oldRecords = await collectTargetRecords(oldSource.assetsDir);
    const oldByPath = new Map(oldRecords.map((record) => [record.relativePath, record]));
    const changed = newRecords.filter((record) => oldByPath.get(record.relativePath)?.hash !== record.hash);

    await mkdir(outputDir, { recursive: true });
    await writeMetadataFiles(newSource.assetsDir, outputDir);

    const copied = [];
    for (const record of changed) {
      const category = resolveCategory(record.relativePath);
      const filename = buildOutputFilename(record.relativePath, songs, packs);
      const targetPath = path.join(outputDir, category, filename);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(record.sourcePath, targetPath);
      copied.push({
        category,
        sourcePath: record.relativePath,
        outputPath: toPosixPath(path.relative(outputDir, targetPath)),
        sizeBytes: record.sizeBytes,
      });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      newInput: newSource.input,
      oldInput: oldSource.input,
      outputDir,
      totals: {
        newTargetFiles: newRecords.length,
        oldTargetFiles: oldRecords.length,
        changedFiles: changed.length,
      },
      copied,
      note: "Only files missing from or changed relative to the old APK/source were copied. Original APKs and source asset folders were not modified.",
    };
    await writeFile(path.join(outputDir, "arcaea-update-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`extract-arcaea-update: changed=${changed.length}, output=${outputDir}`);
  } finally {
    await cleanupSource(newSource);
    await cleanupSource(oldSource);
  }
}

async function prepareSource(input: string, label: string): Promise<ExtractedSource> {
  const stats = await stat(input);
  if (stats.isDirectory()) {
    const assetsDir = path.basename(input).toLowerCase() === "assets" ? input : path.join(input, "assets");
    if (!existsSync(assetsDir)) {
      throw new Error(`Directory source does not contain an assets directory: ${input}`);
    }
    return { input, assetsDir };
  }

  const workDir = path.join(DEFAULT_WORK_DIR, `${label}-${Date.now()}`);
  await mkdir(workDir, { recursive: true });
  const entries = (await runCapture("tar", ["-tf", input]))
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const selectedEntries = entries.filter((entry) => {
    const relativePath = entry.replace(/^assets\//, "");
    return entry.startsWith("assets/") && (
      isTarget(relativePath) ||
      relativePath === "songs/songlist" ||
      relativePath === "songs/packlist" ||
      relativePath === "app-data/story2/ordering" ||
      /^app-data\/story\/(?:main|side)\/entries_/i.test(relativePath)
    );
  });
  if (selectedEntries.length === 0) {
    throw new Error(`No supported Arcaea assets were found in APK: ${input}`);
  }
  const listPath = path.join(workDir, "extract-list.txt");
  await writeFile(listPath, `${selectedEntries.join("\n")}\n`, "utf8");
  await run("tar", ["-xf", input, "-C", workDir, "-T", listPath]);
  return { input, assetsDir: path.join(workDir, "assets"), cleanupDir: workDir };
}

async function cleanupSource(source: ExtractedSource) {
  if (source.cleanupDir) {
    await rm(source.cleanupDir, { recursive: true, force: true });
  }
}

async function collectTargetRecords(assetsDir: string) {
  const files = await collectFiles(assetsDir);
  const records: AssetRecord[] = [];
  for (const file of files) {
    const relativePath = toPosixPath(path.relative(assetsDir, file));
    if (!isTarget(relativePath)) {
      continue;
    }
    const fileStat = await stat(file);
    records.push({
      sourcePath: file,
      relativePath,
      hash: await sha1(file),
      sizeBytes: fileStat.size,
    });
  }
  return records.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(entryPath);
    }
    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      return [entryPath];
    }
    return [];
  }));
  return nested.flat();
}

function isTarget(relativePath: string) {
  return TARGETS.some((target) => target.test(relativePath));
}

function resolveCategory(relativePath: string) {
  return TARGETS.find((target) => target.test(relativePath))?.category ?? "其他";
}

function buildOutputFilename(relativePath: string, songs: Map<string, Song>, packs: Map<string, Pack>) {
  const filename = path.posix.basename(relativePath);
  const songMatch = relativePath.match(/^songs\/([^/]+)\//i);
  if (songMatch) {
    const rawSongId = songMatch[1].replace(/^dl_/, "");
    const song = songs.get(rawSongId);
    if (song) {
      return `${buildSongPrefix(song, filename)}${filename}`;
    }
  }

  const packMatch = filename.match(/(?:1080_select_|1080_small_|divider_)(.+?)(?:_selected|_alt|-pressed)?\.[^.]+$/i);
  if (packMatch) {
    const pack = packs.get(packMatch[1]);
    const packName = pack ? getLocalizedValue(pack.name_localized) ?? pack.id : packMatch[1];
    return `${cleanFilenamePart(packName)}_${filename}`;
  }

  return filename;
}

function buildSongPrefix(song: Song, filename: string) {
  const difficulty = resolveDifficulty(song, filename);
  const parts = [
    getLocalizedValue(difficulty?.title_localized) ?? getLocalizedValue(song.title_localized),
    difficulty?.artist ?? song.artist,
    difficulty?.version ?? song.version,
    song.bydversion ? `BYD ${song.bydversion}` : undefined,
    song.etrversion ? `ETR ${song.etrversion}` : undefined,
    song.set,
    song.idx !== undefined ? `IDX ${song.idx}` : undefined,
    (difficulty?.bpm ?? song.bpm) ? `BPM ${difficulty?.bpm ?? song.bpm}` : undefined,
    song.side !== undefined ? `SIDE ${song.side}` : undefined,
    difficulty?.bg ?? song.bg,
    difficulty ? formatDifficultyLabel(difficulty.ratingClass) : undefined,
    formatDifficultyRating(difficulty),
    difficulty?.chartDesigner ? `谱师 ${difficulty.chartDesigner}` : undefined,
    difficulty?.jacketDesigner ? `曲绘 ${difficulty.jacketDesigner}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.map(cleanFilenamePart).filter(Boolean).join("_") + "_";
}

function resolveDifficulty(song: Song, filename: string) {
  const match = filename.match(/^1080_base_([0-4])\./i);
  if (!match) {
    return undefined;
  }
  const ratingClass = Number.parseInt(match[1], 10);
  return song.difficulties?.find((difficulty) => difficulty.ratingClass === ratingClass);
}

function formatDifficultyLabel(ratingClass?: number) {
  if (ratingClass === 0) {
    return "Past [PST]";
  }
  if (ratingClass === 1) {
    return "Present [PRS]";
  }
  if (ratingClass === 2) {
    return "Future [FTR]";
  }
  if (ratingClass === 3) {
    return "Beyond [BYD]";
  }
  if (ratingClass === 4) {
    return "Eternal [ETR]";
  }
  return undefined;
}

function formatDifficultyRating(difficulty?: SongDifficulty) {
  if (!difficulty || difficulty.rating === undefined || difficulty.rating === 0) {
    return undefined;
  }
  return `定数 ${difficulty.rating}${difficulty.ratingPlus ? "+" : ""}`;
}

async function writeMetadataFiles(assetsDir: string, outputDir: string) {
  const metadataDir = path.join(outputDir, "_metadata");
  await mkdir(metadataDir, { recursive: true });
  for (const source of [
    ["songlist.json", path.join(assetsDir, "songs", "songlist")],
    ["packlist.json", path.join(assetsDir, "songs", "packlist")],
    ["story-ordering.json", path.join(assetsDir, "app-data", "story2", "ordering")],
  ] as const) {
    if (existsSync(source[1])) {
      await copyFile(source[1], path.join(metadataDir, source[0]));
    }
  }
}

function readSongs(assetsDir: string) {
  const songList = readJson<{ songs?: Song[] }>(path.join(assetsDir, "songs", "songlist"));
  return new Map((songList.songs ?? []).map((song) => [song.id, song]));
}

function readPacks(assetsDir: string) {
  const packList = readJson<{ packs?: Pack[] }>(path.join(assetsDir, "songs", "packlist"));
  return new Map((packList.packs ?? []).map((pack) => [pack.id, pack]));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function getLocalizedValue(value?: LocalizedText) {
  return value?.["zh-Hans"]?.trim() || value?.["zh-Hant"]?.trim() || value?.ja?.trim() || value?.en?.trim();
}

function cleanFilenamePart(text: string) {
  return text.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
}

function sha1(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha1");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function parseArgs(args: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = value;
      index += 1;
    }
  }
  return parsed;
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

function runCapture(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}: ${Buffer.concat(stderr).toString("utf8")}`));
      }
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
