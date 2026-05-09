import type { AssetItem } from "./types";

export const SITE_URL = "https://www.unknnownnn.homes";
export const SITE_NAME = "Unknnownnn 曲绘下载站";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export function absoluteUrl(pathname: string) {
  return new URL(pathname, SITE_URL).toString();
}

export function assetAlt(asset: AssetItem) {
  return [asset.game, asset.category, asset.title, asset.artist ? `- ${asset.artist}` : undefined]
    .filter(Boolean)
    .join(" ");
}

export function assetMetaTitle(asset: AssetItem) {
  return `${asset.title} - ${asset.game} ${asset.category}下载 - Unknnownnn`;
}

export function assetMetaDescription(asset: AssetItem) {
  const parts = [`下载 ${asset.game} ${asset.category} ${asset.title}`];
  if (asset.artist) {
    parts.push(`作者 ${asset.artist}`);
  }
  if (asset.packDisplayName ?? asset.pack) {
    parts.push(`曲包 ${(asset.packDisplayName ?? asset.pack)}`);
  }
  if (asset.bpm) {
    parts.push(`BPM ${asset.bpm}`);
  }
  if (asset.version) {
    parts.push(`版本 ${asset.version}`);
  }
  return `${parts.join("，")}。`;
}

export function assetOgImage(asset: AssetItem) {
  const image = asset.thumbnailLarge ?? asset.thumbnailMedium ?? asset.thumbnailSmall ?? asset.url;
  return image.startsWith("http") ? image : absoluteUrl(image);
}
