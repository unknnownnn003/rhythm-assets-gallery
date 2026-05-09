import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AssetItem } from "../src/lib/types";

const SITE_URL = "https://www.unknnownnn.homes";
const DATA_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_PATH = path.join(process.cwd(), "public", "sitemap.xml");

const staticPages = ["/", "/arcaea/", "/phigros/"];
const assets = [...readAssets("arcaea-index.json"), ...readAssets("phigros-index.json")];
const now = new Date();
const urls = [
  ...staticPages.map((pathname) => ({
    loc: new URL(pathname, SITE_URL).toString(),
    lastmod: formatDate(latestAssetDate(assets) ?? now),
  })),
  ...assets.map((asset) => ({
    loc: new URL(`/asset/${asset.id}/`, SITE_URL).toString(),
    lastmod: formatDate(assetDate(asset) ?? now),
  })),
];

mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, renderSitemap(urls), "utf8");
console.log(`generate-sitemap: wrote ${urls.length} URL(s) to ${path.relative(process.cwd(), OUTPUT_PATH)}.`);

function readAssets(filename: string): AssetItem[] {
  const filePath = path.join(DATA_DIR, filename);
  if (!existsSync(filePath)) {
    return [];
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as AssetItem[];
}

function latestAssetDate(items: AssetItem[]) {
  const latest = Math.max(...items.map((item) => assetDate(item)?.getTime() ?? 0));
  return Number.isFinite(latest) && latest > 0 ? new Date(latest) : undefined;
}

function assetDate(item: AssetItem) {
  if (!item.mtimeMs) {
    return undefined;
  }

  const date = new Date(item.mtimeMs);
  return date.getFullYear() >= 2000 ? date : undefined;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function renderSitemap(items: { loc: string; lastmod: string }[]) {
  const body = items
    .map(
      (item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <lastmod>${escapeXml(item.lastmod)}</lastmod>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
