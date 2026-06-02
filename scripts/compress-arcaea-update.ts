import { existsSync, readdirSync, type Dirent } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type CompressItem = {
  inputPath: string;
  outputPath: string;
  inputBytes: number;
  outputBytes?: number;
  status: "converted" | "skipped" | "failed";
  message?: string;
};

const PROJECT_ROOT = process.cwd();
const DEFAULT_ARCAEA_ROOT = path.join("D:", "Files", "曲绘", "Arcaea");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const JACKET_CATEGORY = "曲绘";
const AI_UPSCALED_CATEGORY = "曲绘（AI超分后）";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDir = resolveTargetDir(args.dir ?? args.d);
  const quality = parseQuality(args.quality);
  const overwrite = args.overwrite === "true";
  const keepOriginal = args["keep-original"] === "true";
  const deleteOriginal = !keepOriginal;

  const files = await collectFiles(targetDir);
  const targets = files.filter(isOptimizationImage);
  const items: CompressItem[] = [];

  for (const inputPath of targets) {
    const item = await compressFile(inputPath, { rootDir: targetDir, quality, overwrite, deleteOriginal });
    items.push(item);
    const relativeInput = path.relative(targetDir, inputPath);
    if (item.status === "converted") {
      console.log(`compress-arcaea-update: converted ${relativeInput}`);
    } else if (item.status === "skipped") {
      console.log(`compress-arcaea-update: skipped ${relativeInput}: ${item.message}`);
    } else {
      console.warn(`compress-arcaea-update: failed ${relativeInput}: ${item.message}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    targetDir,
    quality,
    overwrite,
    deleteOriginal,
    keepOriginal,
    totals: {
      candidates: targets.length,
      converted: items.filter((item) => item.status === "converted").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      failed: items.filter((item) => item.status === "failed").length,
    },
    items: items.map((item) => ({
      ...item,
      inputPath: toPosixPath(path.relative(targetDir, item.inputPath)),
      outputPath: toPosixPath(path.relative(targetDir, item.outputPath)),
    })),
  };

  const reportPath = path.join(targetDir, "arcaea-compress-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`compress-arcaea-update: candidates=${report.totals.candidates}, converted=${report.totals.converted}, skipped=${report.totals.skipped}, failed=${report.totals.failed}`);
  console.log(`compress-arcaea-update: report=${reportPath}`);

  if (report.totals.failed > 0) {
    process.exitCode = 1;
  }
}

function resolveTargetDir(inputDir?: string) {
  if (inputDir) {
    const resolved = path.resolve(PROJECT_ROOT, inputDir);
    if (!existsSync(resolved)) {
      throw new Error(`Arcaea update directory does not exist: ${resolved}`);
    }
    return resolved;
  }

  if (!existsSync(DEFAULT_ARCAEA_ROOT)) {
    throw new Error(`Default Arcaea directory does not exist: ${DEFAULT_ARCAEA_ROOT}`);
  }

  const candidates = readdirSyncDirectories(DEFAULT_ARCAEA_ROOT)
    .map((name) => ({ name, version: getVersionFromDirectoryName(name) }))
    .filter((item): item is { name: string; version: string } => Boolean(item.version))
    .sort((a, b) => compareVersions(b.version, a.version));

  const latest = candidates[0];
  if (!latest) {
    throw new Error(`No Arcaea update directory found under ${DEFAULT_ARCAEA_ROOT}. Pass --dir explicitly.`);
  }

  return path.join(DEFAULT_ARCAEA_ROOT, latest.name);
}

function readdirSyncDirectories(root: string) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry: Dirent) => entry.isDirectory())
    .map((entry: Dirent) => entry.name);
}

function getVersionFromDirectoryName(name: string) {
  return name.match(/曲绘（\d+）(\d+(?:\.\d+)+)/)?.[1];
}

function compareVersions(a: string, b: string) {
  const partsA = a.split(".").map((part) => Number.parseInt(part, 10));
  const partsB = b.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (partsA[index] ?? 0) - (partsB[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return a.localeCompare(b, "zh-CN");
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_metadata") {
        return [];
      }
      return collectFiles(entryPath);
    }
    return entry.isFile() ? [entryPath] : [];
  }));
  return files.flat();
}

function isOptimizationImage(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const stem = path.basename(filePath, extension);
  return stem.endsWith("_optimization") && IMAGE_EXTENSIONS.has(extension);
}

async function compressFile(
  inputPath: string,
  options: { rootDir: string; quality: number; overwrite: boolean; deleteOriginal: boolean },
): Promise<CompressItem> {
  const extension = path.extname(inputPath);
  const stem = path.basename(inputPath, extension);
  const outputPath = getCompressedOutputPath(inputPath, options.rootDir, `${stem.replace(/_optimization$/, "_opt")}.jpg`);
  const inputBytes = (await stat(inputPath)).size;

  if (existsSync(outputPath) && !options.overwrite) {
    return {
      inputPath,
      outputPath,
      inputBytes,
      status: "skipped",
      message: "output exists; pass --overwrite to replace it",
    };
  }

  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await sharp(inputPath, { animated: false })
      .flatten({ background: "#ffffff" })
      .toColorspace("srgb")
      .jpeg({ quality: options.quality, mozjpeg: false, chromaSubsampling: "4:4:4" })
      .toFile(outputPath);

    const outputBytes = (await stat(outputPath)).size;
    if (options.deleteOriginal) {
      const { rm } = await import("node:fs/promises");
      await rm(inputPath, { force: true });
    }

    return {
      inputPath,
      outputPath,
      inputBytes,
      outputBytes,
      status: "converted",
    };
  } catch (error) {
    return {
      inputPath,
      outputPath,
      inputBytes,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function getCompressedOutputPath(inputPath: string, rootDir: string, outputFilename: string) {
  const relativeParts = path.relative(rootDir, inputPath).split(path.sep);
  if (relativeParts[0] === JACKET_CATEGORY) {
    return path.join(rootDir, AI_UPSCALED_CATEGORY, ...relativeParts.slice(1, -1), outputFilename);
  }
  return path.join(path.dirname(inputPath), outputFilename);
}

function parseQuality(value?: string) {
  if (!value) {
    return 95;
  }
  const quality = Number.parseInt(value, 10);
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error(`Invalid --quality value: ${value}. Expected 1-100.`);
  }
  return quality;
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
