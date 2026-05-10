import type { AssetItem } from "../lib/types";
import { assetAlt } from "../lib/seo";

type AssetCardProps = {
  asset: AssetItem;
};

export function AssetCard({ asset }: AssetCardProps) {
  const imageSrc = asset.thumbnailSmall ?? asset.thumbnailMedium ?? asset.thumbnailLarge;
  const dimensions = asset.width && asset.height ? `${asset.width} x ${asset.height}` : "未知尺寸";
  const metadata = [
    asset.difficultyLabel ?? asset.difficulty,
    asset.version,
    asset.packDisplayName ?? asset.pack,
    asset.characterName,
    asset.storyPathTitle,
    asset.difficultyRating ? `定数 ${asset.difficultyRating}` : undefined,
    asset.artist,
    asset.sideLabel,
  ].filter(Boolean);

  return (
    <a className="asset-tile" href={`/asset/${asset.id}`} title={asset.filename}>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={assetAlt(asset)}
          loading="lazy"
          decoding="async"
          width={asset.width ?? 320}
          height={asset.height ?? 240}
        />
      ) : (
        <div className="asset-tile-placeholder" aria-hidden="true" />
      )}
      <div className="asset-tile-body">
        <span>{asset.category}</span>
        <strong>{asset.title}</strong>
        {metadata.length > 0 ? <em>{metadata.slice(0, 3).join(" / ")}</em> : null}
        <small>
          {asset.extension.toUpperCase()} / {dimensions}
        </small>
      </div>
    </a>
  );
}
