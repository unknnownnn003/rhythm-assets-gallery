import { existsSync } from "node:fs";
import { access, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type IncomingItem = {
  relativePath: string;
  sizeBytes: number;
  extension: string;
  status: "ready" | "unsupported" | "unreadable";
  message?: string;
};

const PROJECT_ROOT = process.cwd();
const INCOMING_DIR = path.join(PROJECT_ROOT, "automation", "incoming");
const LOG_DIR = path.join(PROJECT_ROOT, "automation", "logs");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);

async function main() {
  if (!existsSync(INCOMING_DIR)) {
    console.warn(`import-incoming-assets: incoming directory does not exist: ${INCOMING_DIR}`);
    return;
  }

  const files = await collectFiles(INCOMING_DIR);
  const items = await Promise.all(files.map(toIncomingItem));
  const ready = items.filter((item) => item.status === "ready");
  const unsupported = items.filter((item) => item.status === "unsupported");
  const unreadable = items.filter((item) => item.status === "unreadable");
  const report = {
    mode: "dry-run",
    generatedAt: new Date().toISOString(),
    incomingDir: INCOMING_DIR,
    totals: {
      files: items.length,
      ready: ready.length,
      unsupported: unsupported.length,
      unreadable: unreadable.length,
    },
    items,
    note: "No files were moved. Review this report before implementing or running a real import.",
  };

  const reportPath = path.join(LOG_DIR, "incoming-import-plan.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("import-incoming-assets: dry-run only. No files were moved.");
  console.log(`import-incoming-assets: files=${items.length}, ready=${ready.length}, unsupported=${unsupported.length}, unreadable=${unreadable.length}`);
  console.log(`import-incoming-assets: report=${reportPath}`);

  for (const item of [...unsupported, ...unreadable]) {
    console.warn(`import-incoming-assets: ${item.status}: ${item.relativePath}${item.message ? ` (${item.message})` : ""}`);
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

async function toIncomingItem(filePath: string): Promise<IncomingItem> {
  const relativePath = toPosixPath(path.relative(INCOMING_DIR, filePath));
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const fileStat = await stat(filePath);

  if (!IMAGE_EXTENSIONS.has(`.${extension}`)) {
    return {
      relativePath,
      sizeBytes: fileStat.size,
      extension,
      status: "unsupported",
      message: "Unsupported image extension.",
    };
  }

  try {
    await access(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      relativePath,
      sizeBytes: fileStat.size,
      extension,
      status: "unreadable",
      message,
    };
  }

  return {
    relativePath,
    sizeBytes: fileStat.size,
    extension,
    status: "ready",
  };
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
