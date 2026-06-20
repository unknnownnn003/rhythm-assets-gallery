import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "public", "data");

export function readJson<T>(filename: string, fallback: T): T {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function readAssets(filename: string) {
  return readJson<import("./types").AssetItem[]>(filename, []);
}

export function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return "未知大小";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
