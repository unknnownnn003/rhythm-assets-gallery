import type { CSSProperties } from "react";

import { assetAlt } from "../lib/seo";
import type { AssetItem } from "../lib/types";

type AssetCardProps = {
  asset: AssetItem;
  index?: number;
  selected?: boolean;
  onToggleSelect?: () => void;
};

export function AssetCard({ asset, index = 0, selected = false, onToggleSelect }: AssetCardProps) {
  const imageSrc = asset.thumbnailSmall ?? asset.thumbnailMedium ?? asset.thumbnailLarge;
  const dimensions = asset.width && asset.height ? `${asset.width} x ${asset.height}` : "未知尺寸";
  const isAiUpscaled = asset.category === "曲绘（AI超分后）" || asset.relativePath.includes("曲绘（AI超分后）/");
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
    <article
      className={`asset-tile${selected ? " is-selected" : ""}`}
      style={{ "--tile-index": index % 16 } as CSSProperties & Record<string, number>}
    >
      {onToggleSelect ? (
        <button
          className={`asset-tile-select${selected ? " is-active" : ""}`}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onToggleSelect();
          }}
          aria-pressed={selected}
          aria-label={selected ? `取消选择 ${asset.title}` : `选择 ${asset.title}`}
        >
          {selected ? "已选" : "选择"}
        </button>
      ) : null}

      <a className="asset-tile-link" href={`/asset/${asset.id}`} title={asset.filename}>
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
        {isAiUpscaled ? <span className="asset-tile-ai-badge">AI超分</span> : null}

        <div className="asset-tile-body">
          <div className="asset-tile-topline">
            <span>{asset.category}</span>
            <small>{asset.game}</small>
          </div>
          <strong>{asset.title}</strong>
          {metadata.length > 0 ? <em>{metadata.slice(0, 3).join(" / ")}</em> : null}
          <small>
            {asset.extension.toUpperCase()} / {dimensions}
          </small>
        </div>
      </a>
    </article>
  );
}
