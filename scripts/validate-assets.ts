import { existsSync, readFileSync } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DEFAULT_ASSET_ROOT = path.join(PROJECT_ROOT, "public", "assets");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);

async function main() {
  loadEnvFile();

  const assetRoot = path.resolve(PROJECT_ROOT, process.env.ASSET_ROOT || DEFAULT_ASSET_ROOT);
  if (!existsSync(assetRoot)) {
    console.warn(`validate-assets: asset root does not exist: ${assetRoot}`);
    return;
  }

  const files = await collectFiles(assetRoot);
  let imageCount = 0;
  let unsupportedCount = 0;
  let unreadableCount = 0;

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      unsupportedCount += 1;
      continue;
    }

    imageCount += 1;
    try {
      await access(filePath);
    } catch {
      unreadableCount += 1;
      console.warn(`validate-assets: unreadable image: ${toPosixPath(path.relative(assetRoot, filePath))}`);
    }
  }

  console.log(`validate-assets: assetRoot=${assetRoot}`);
  console.log(`validate-assets: imageFiles=${imageCount}, unsupportedFiles=${unsupportedCount}, unreadableImages=${unreadableCount}`);

  if (unreadableCount > 0) {
    process.exitCode = 1;
  }
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(entryPath);
      }
      if (entry.isFile()) {
        return [entryPath];
      }
      return [];
    }),
  );

  return files.flat();
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

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
