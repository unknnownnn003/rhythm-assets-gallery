import type { AssetItem } from "./types";

type DownloadOptions = {
  archiveName?: string;
  onProgress?: (completed: number, total: number, filename: string) => void;
};

type ZipEntry = {
  name: string;
  data: Uint8Array;
  modifiedAt: Date;
};

const textEncoder = new TextEncoder();
const crcTable = buildCrcTable();

export async function downloadAssetsAsZip(assets: AssetItem[], options: DownloadOptions = {}) {
  if (typeof window === "undefined") {
    return;
  }

  if (assets.length === 0) {
    throw new Error("请先选择至少一个资源。");
  }

  const entries: ZipEntry[] = [];

  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const response = await fetch(asset.url);

    if (!response.ok) {
      throw new Error(`下载 ${asset.filename} 失败：${response.status}`);
    }

    entries.push({
      name: toZipPath(asset.relativePath),
      data: new Uint8Array(await response.arrayBuffer()),
      modifiedAt: asset.mtimeMs ? new Date(asset.mtimeMs) : new Date(),
    });

    options.onProgress?.(index + 1, assets.length, asset.filename);
  }

  deduplicateZipNames(entries);

  const archiveName = sanitizeArchiveName(
    options.archiveName ?? `rhythm-assets-${new Date().toISOString().slice(0, 10)}.zip`,
  );
  const blob = new Blob([createZip(entries)], { type: "application/zip" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = archiveName;
  anchor.click();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function sanitizeArchiveName(name: string) {
  const base = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-");
  return base.toLowerCase().endsWith(".zip") ? base : `${base}.zip`;
}

function toZipPath(relativePath: string) {
  const segments = relativePath
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[\\:*?"<>|\u0000-\u001f]+/g, "_"))
  return segments[segments.length - 1] ?? "unknown";
}

function deduplicateZipNames(entries: ZipEntry[]) {
  const used = new Set<string>();

  for (const entry of entries) {
    if (used.has(entry.name)) {
      const dotIndex = entry.name.lastIndexOf(".");
      const base = dotIndex > 0 ? entry.name.slice(0, dotIndex) : entry.name;
      const ext = dotIndex > 0 ? entry.name.slice(dotIndex) : "";
      let counter = 1;
      let candidate = `${base}_${counter}${ext}`;
      while (used.has(candidate)) {
        counter += 1;
        candidate = `${base}_${counter}${ext}`;
      }
      entry.name = candidate;
    }
    used.add(entry.name);
  }
}

function createZip(entries: ZipEntry[]) {
  const fileParts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    const crc = crc32(entry.data);
    const { dosDate, dosTime } = getDosDateTime(entry.modifiedAt);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);

    fileParts.push(localHeader, nameBytes, entry.data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);

    centralDirectoryParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + entry.data.length;
  }

  const centralDirectory = concatArrays(centralDirectoryParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatArrays([...fileParts, centralDirectory, endRecord]);
}

function concatArrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function getDosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
    dosTime: (hours << 11) | (minutes << 5) | seconds,
  };
}

function buildCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (let index = 0; index < data.length; index += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[index]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}
