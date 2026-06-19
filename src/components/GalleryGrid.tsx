import Fuse from "fuse.js";
import { useEffect, useMemo, useState } from "react";

import { downloadAssetsAsZip } from "../lib/client-zip";
import type { AssetItem, GameName } from "../lib/types";
import { AssetCard } from "./AssetCard";
import { FilterPanel } from "./FilterPanel";
import { SearchBar } from "./SearchBar";
import "./gallery.css";

type GalleryGridProps = {
  assets: AssetItem[];
  game: Exclude<GameName, "Unknown"> | "All";
};

type CountItem = {
  name: string;
  count: number;
  value?: string;
};

const PAGE_SIZE = 40;
const META_FILTER_KEYS = [
  "pack",
  "side",
  "version",
] as const;

const GAME_SPECIFIC_META_KEYS = new Set<string>(["side", "version", "pack"]);
const SELECTED_STORAGE_KEY = "gallery-selected-ids";
const SELECTED_CACHE_KEY = "gallery-selected-cache";

type SelectedAssetCache = Record<string, { filename: string; thumbnailSmall?: string }>;

function loadSelectedIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }
  try {
    const raw = sessionStorage.getItem(SELECTED_STORAGE_KEY);
    if (raw) {
      return new Set<string>(JSON.parse(raw) as string[]);
    }
  } catch {
    // ignore corrupted data
  }
  return new Set<string>();
}

function loadSelectedCache() {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SELECTED_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SelectedAssetCache) : {};
  } catch {
    return {};
  }
}

function saveSelectedIds(ids: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(SELECTED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore quota errors
  }
}

function readUrlFilterState() {
  if (typeof window === "undefined") {
    return {
      query: "",
      category: "",
      sort: "recent",
      meta: {} as Record<string, string>,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const meta: Record<string, string> = {};

  for (const key of META_FILTER_KEYS) {
    const value = params.get(key)?.trim();
    if (value) {
      meta[key] = value;
    }
  }

  const sort = params.get("sort")?.trim();

  return {
    query: params.get("q")?.trim() ?? "",
    category: params.get("category")?.trim() ?? "",
    sort: sort && ["recent", "name", "category"].includes(sort) ? sort : "recent",
    meta,
  };
}

export default function GalleryGrid({ assets, game }: GalleryGridProps) {
  const initialUrlState = readUrlFilterState();
  const [query, setQuery] = useState(initialUrlState.query);
  const [debouncedQuery, setDebouncedQuery] = useState(initialUrlState.query);
  const [selectedCategory, setSelectedCategory] = useState(initialUrlState.category);
  const [selectedMeta, setSelectedMeta] = useState<Record<string, string>>(initialUrlState.meta);
  const [sort, setSort] = useState(initialUrlState.sort);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasLoadedUrlParams, setHasLoadedUrlParams] = useState(typeof window !== "undefined");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [didRestoreSelection, setDidRestoreSelection] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [downloadNotice, setDownloadNotice] = useState("");
  const [downloadProgress, setDownloadProgress] = useState({
    completed: 0,
    total: 0,
    current: "",
  });
  const [showSelectedPanel, setShowSelectedPanel] = useState(false);

  useEffect(() => {
    const restored = loadSelectedIds();
    if (restored.size > 0) {
      setSelectedIds(restored);
    }
    setDidRestoreSelection(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncFromUrl = () => {
      const nextState = readUrlFilterState();
      setQuery(nextState.query);
      setDebouncedQuery(nextState.query);
      setSelectedCategory(nextState.category);
      setSelectedMeta(nextState.meta);
      setSort(nextState.sort);
      setHasLoadedUrlParams(true);
    };

    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!hasLoadedUrlParams) {
      return;
    }

    const params = new URLSearchParams();
    if (debouncedQuery) {
      params.set("q", debouncedQuery);
    }
    if (selectedCategory) {
      params.set("category", selectedCategory);
    }
    for (const [key, value] of Object.entries(selectedMeta)) {
      if (value) {
        params.set(key, value);
      }
    }
    if (sort !== "recent") {
      params.set("sort", sort);
    }

    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [debouncedQuery, hasLoadedUrlParams, selectedCategory, selectedMeta, sort]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedQuery, selectedCategory, selectedMeta, sort]);

  useEffect(() => {
    if (didRestoreSelection) {
      saveSelectedIds(selectedIds);
    }
  }, [selectedIds, didRestoreSelection]);

  useEffect(() => {
    if (!downloadNotice) {
      return;
    }

    const timeout = window.setTimeout(() => setDownloadNotice(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [downloadNotice]);

  const categories = useMemo(() => countBy(assets.map((asset) => asset.category)), [assets]);
  const metaFilters = useMemo(() => buildMetaFilters(assets, game), [assets, game]);
  const queryKeywords = useMemo(() => extractKeywords(debouncedQuery), [debouncedQuery]);
  const searchDocuments = useMemo(
    () =>
      assets.map((asset) => ({
        asset,
        text: buildSearchText(asset),
      })),
    [assets],
  );

  const fuse = useMemo(
    () =>
      new Fuse(assets, {
        keys: [
          { name: "characterName", weight: 4 },
          { name: "characterEnglishName", weight: 3 },
          { name: "relatedCharacterNames", weight: 3 },
          { name: "title", weight: 2 },
          { name: "artist", weight: 1.5 },
          "filename",
          "category",
          "tags",
          "pack",
          "packDisplayName",
          "packDescription",
          "version",
          "bydVersion",
          "etrVersion",
          "bg",
          "bgInverse",
          "sideLabel",
          "idx",
          "songId",
          "difficultyRating",
          "difficultyRatings",
          "chartDesigner",
          "jacketDesigner",
          "characterVariant",
          "storyNode",
          "storyPathTitle",
          "relatedSongId",
          "relatedSongTitle",
        ],
        threshold: 0.32,
        ignoreLocation: true,
      }),
    [assets],
  );

  const filteredAssets = useMemo(() => {
    let searched = assets;

    if (queryKeywords.length === 1) {
      searched = fuse.search(queryKeywords[0]).map((result) => result.item);
    } else if (queryKeywords.length > 1) {
      searched = searchDocuments
        .filter((entry) => queryKeywords.every((keyword) => entry.text.includes(keyword)))
        .map((entry) => entry.asset);
    }

    return searched
      .filter((asset) => !selectedCategory || asset.category === selectedCategory)
      .filter((asset) => matchesMetaFilters(asset, selectedMeta))
      .sort((left, right) => sortAssets(left, right, sort));
  }, [
    assets,
    fuse,
    queryKeywords,
    searchDocuments,
    selectedCategory,
    selectedMeta,
    sort,
  ]);

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selectedAssets = useMemo(
    () =>
      [...selectedIds]
        .map((id) => {
          const fromPage = assetMap.get(id);
          if (fromPage) return fromPage;
          const cache = loadSelectedCache();
          const cached = cache[id];
          if (cached) {
            return {
              id,
              filename: cached.filename,
              thumbnailSmall: cached.thumbnailSmall,
              url: "",
            } as AssetItem;
          }
          return null;
        })
        .filter((asset): asset is AssetItem => Boolean(asset)),
    [assetMap, selectedIds],
  );

  useEffect(() => {
    if (!didRestoreSelection) return;
    const cache: Record<string, { filename: string; thumbnailSmall?: string }> = {};
    for (const id of selectedIds) {
      const asset = assetMap.get(id);
      if (asset) {
        cache[id] = {
          filename: asset.filename,
          thumbnailSmall: asset.thumbnailSmall ?? asset.thumbnailMedium,
        };
      }
    }
    const existing = loadSelectedCache();
    const merged = { ...existing, ...cache };
    for (const key of Object.keys(merged)) {
      if (!selectedIds.has(key)) delete merged[key];
    }
    try {
      sessionStorage.setItem(SELECTED_CACHE_KEY, JSON.stringify(merged));
    } catch {
      // ignore quota errors
    }
  }, [selectedIds, assetMap, didRestoreSelection]);

  const visibleAssets = filteredAssets.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAssets.length;
  const allVisibleSelected =
    visibleAssets.length > 0 && visibleAssets.every((asset) => selectedIds.has(asset.id));
  const batchStatusText = isDownloading
    ? `正在获取 ${downloadProgress.completed}/${downloadProgress.total}：${downloadProgress.current}`
    : downloadError || downloadNotice;

  const clearFilters = () => {
    setSelectedCategory("");
    setSelectedMeta({});
    setSort("recent");
  };

  const handleMetaChange = (key: string, value: string) => {
    setSelectedMeta((current) => {
      const next = { ...current };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const toggleSelection = (assetId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        for (const asset of visibleAssets) {
          next.delete(asset.id);
        }
      } else {
        for (const asset of visibleAssets) {
          next.add(asset.id);
        }
      }

      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setDownloadError("");
    setDownloadNotice("");
  };

  const handleBatchDownload = async () => {
    if (selectedAssets.length === 0 || isDownloading) {
      return;
    }

    setIsDownloading(true);
    setDownloadError("");
    setDownloadNotice("");
    setDownloadProgress({
      completed: 0,
      total: selectedAssets.length,
      current: "",
    });

    const downloadable = selectedAssets.filter((asset) => asset.url);
    try {
      await downloadAssetsAsZip(downloadable, {
        archiveName: buildArchiveName(game),
        onProgress: (completed, total, filename) => {
          setDownloadProgress({
            completed,
            total,
            current: filename,
          });
        },
      });

      setDownloadNotice(`${downloadable.length} 张图片已打包完成，浏览器将自动下载。`);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "打包失败，请稍后重试。");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="gallery-app">
      <div className="gallery-toolbar">
        <SearchBar value={query} onChange={setQuery} resultCount={filteredAssets.length} />

        <div className="gallery-actions">
          <button type="button" className="toolbar-button" onClick={toggleVisibleSelection} disabled={!visibleAssets.length}>
            {allVisibleSelected ? "取消当前页" : `全选当前页 (${visibleAssets.length})`}
          </button>
          <button type="button" className="toolbar-button" onClick={clearSelection} disabled={!selectedAssets.length}>
            清空选择
          </button>
        </div>

        <details className="mobile-filter">
          <summary>筛选与排序</summary>
          <FilterPanel
            categories={categories}
            metaFilters={metaFilters}
            selectedCategory={selectedCategory}
            selectedMeta={selectedMeta}
            sort={sort}
            onCategoryChange={setSelectedCategory}
            onMetaChange={handleMetaChange}
            onSortChange={setSort}
            onClear={clearFilters}
          />
        </details>
      </div>

      <div className="category-tabs">
        <button
          type="button"
          className={!selectedCategory ? "is-active" : ""}
          onClick={() => setSelectedCategory("")}
        >
          全部
        </button>
        {categories.map((cat) => (
          <button
            key={cat.name}
            type="button"
            className={selectedCategory === cat.name ? "is-active" : ""}
            onClick={() => setSelectedCategory(cat.name)}
          >
            {cat.name}
            <span>{cat.count}</span>
          </button>
        ))}
      </div>

      <div className="gallery-layout">
        <aside className="desktop-filter" aria-label="图库筛选">
          <FilterPanel
            categories={categories}
            metaFilters={metaFilters}
            selectedCategory={selectedCategory}
            selectedMeta={selectedMeta}
            sort={sort}
            onCategoryChange={setSelectedCategory}
            onMetaChange={handleMetaChange}
            onSortChange={setSort}
            onClear={clearFilters}
          />
        </aside>

        <section className="gallery-results" aria-label={`${game} 资源列表`}>
          {visibleAssets.length > 0 ? (
            <div className="asset-grid">
              {visibleAssets.map((asset, index) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  index={index}
                  selected={selectedIds.has(asset.id)}
                  onToggleSelect={() => toggleSelection(asset.id)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>没有找到匹配的资源</strong>
              <span>试试换个关键词，或者调整左侧的筛选条件。</span>
            </div>
          )}

          {hasMore ? (
            <button
              className="load-more"
              type="button"
              onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
            >
              查看更多
              <span>
                已显示 {visibleAssets.length.toLocaleString("zh-CN")} /{" "}
                {filteredAssets.length.toLocaleString("zh-CN")}
              </span>
            </button>
          ) : null}
        </section>
      </div>

      <div className={`batch-download-bar${selectedAssets.length > 0 ? " is-visible" : ""}`} aria-live="polite">
        <div className="batch-download-copy">
          <strong>已选 {selectedAssets.length} 张</strong>
          {batchStatusText ? <span>{batchStatusText}</span> : null}
        </div>

        <div className="batch-download-actions">
          <button
            type="button"
            className="toolbar-button"
            onClick={() => setShowSelectedPanel((v) => !v)}
            disabled={isDownloading || selectedAssets.length === 0}
          >
            {showSelectedPanel ? "收起已选" : `查看已选 (${selectedAssets.length})`}
          </button>
          <button type="button" className="toolbar-button" onClick={clearSelection} disabled={isDownloading}>
            清空
          </button>
          <button
            type="button"
            className="toolbar-button is-primary"
            onClick={handleBatchDownload}
            disabled={isDownloading || selectedAssets.length === 0}
          >
            {isDownloading
              ? `打包中 ${downloadProgress.completed}/${downloadProgress.total}`
              : "打包下载 ZIP"}
          </button>
        </div>
      </div>

      <div className={`selected-panel${showSelectedPanel && selectedAssets.length > 0 ? " is-open" : ""}`}>
        <div className="selected-panel-head">
          <strong>已选图片 ({selectedAssets.length})</strong>
          <button type="button" className="toolbar-button" onClick={() => setShowSelectedPanel(false)}>
            收起
          </button>
        </div>
        <div className="selected-panel-list">
          {selectedAssets.map((asset) => (
            <div key={asset.id} className="selected-panel-item">
              <img
                src={asset.thumbnailSmall ?? asset.thumbnailMedium ?? asset.thumbnailLarge}
                alt={asset.filename}
                loading="lazy"
              />
              <span className="selected-panel-name" title={asset.filename}>{asset.filename}</span>
              <button
                type="button"
                className="selected-panel-remove"
                onClick={() => toggleSelection(asset.id)}
                aria-label={`移除 ${asset.filename}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildMetaFilters(assets: AssetItem[], game: GalleryGridProps["game"]) {
  const filters = [
    {
      label: "曲包 / 章节",
      value: "pack",
      items: countPacksBySong(assets),
    },
    {
      label: "侧别",
      value: "side",
      items: countBySong(assets, (asset) => asset.sideLabel ?? ""),
    },
    {
      label: "更新版本",
      value: "version",
      items: countBySong(assets, (asset) => asset.version ?? "", compareVersionDesc),
    },
  ];

  return filters.filter(
    (filter) => !(game === "All" && GAME_SPECIFIC_META_KEYS.has(filter.value)) && filter.items.length > 0,
  );
}

function matchesMetaFilters(asset: AssetItem, selectedMeta: Record<string, string>) {
  return Object.entries(selectedMeta).every(([key, value]) => {
    if (!value) {
      return true;
    }

    if (key === "pack") {
      return asset.pack === value;
    }
    if (key === "side") {
      return asset.sideLabel === value;
    }
    if (key === "version") {
      return asset.version === value;
    }
    return true;
  });
}

function buildSearchText(asset: AssetItem) {
  return [
    asset.title,
    asset.artist,
    asset.filename,
    asset.category,
    asset.tags.join(" "),
    asset.pack,
    asset.packDisplayName,
    asset.packDescription,
    asset.version,
    asset.bydVersion,
    asset.etrVersion,
    asset.bg,
    asset.bgInverse,
    asset.sideLabel,
    asset.idx ? String(asset.idx) : "",
    asset.songId,
    asset.difficultyRating,
    asset.difficultyRatings?.join(" "),
    asset.chartDesigner,
    asset.jacketDesigner,
    asset.characterName,
    asset.characterEnglishName,
    asset.characterVariant,
    asset.relatedCharacterNames?.join(" "),
    asset.storyNode,
    asset.storyPathTitle,
    asset.relatedSongId,
    asset.relatedSongTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFC")
    .toLowerCase();
}

function extractKeywords(query: string) {
  return query
    .normalize("NFC")
    .toLowerCase()
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildArchiveName(game: GalleryGridProps["game"]) {
  return `rhythm-assets-${game.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.zip`;
}

function countBySong(
  assets: AssetItem[],
  getField: (asset: AssetItem) => string,
  sortItems?: (a: CountItem, b: CountItem) => number,
) {
  const seen = new Map<string, string>();

  for (const asset of assets) {
    const key = asset.songId ?? asset.id;
    if (!seen.has(key)) {
      const field = getField(asset);
      if (field) {
        seen.set(key, field);
      }
    }
  }

  const counts = new Map<string, number>();
  for (const value of seen.values()) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort(sortItems ?? ((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN")));
}

function countPacksBySong(assets: AssetItem[]) {
  const seen = new Map<string, CountItem>();
  for (const asset of assets) {
    const key = asset.songId ?? asset.id;
    if (!seen.has(key) && asset.pack) {
      seen.set(key, {
        name: asset.packDisplayName ?? asset.pack,
        value: asset.pack,
        count: 0,
      });
    }
  }

  const counts = new Map<string, CountItem>();
  for (const item of seen.values()) {
    const current = counts.get(item.value ?? item.name);
    if (current) {
      current.count += 1;
    } else {
      counts.set(item.value ?? item.name, { ...item, count: 1 });
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

function countBy(values: string[], sortItems?: (a: CountItem, b: CountItem) => number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort(sortItems ?? ((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN")));
}

function compareVersionDesc(a: CountItem, b: CountItem) {
  return compareVersionNameDesc(a.name, b.name) || b.count - a.count || a.name.localeCompare(b.name, "zh-CN");
}

function compareVersionNameDesc(a: string, b: string) {
  const parsedA = parseVersionParts(a);
  const parsedB = parseVersionParts(b);
  if (parsedA && parsedB) {
    const length = Math.max(parsedA.length, parsedB.length);
    for (let index = 0; index < length; index += 1) {
      const delta = (parsedB[index] ?? 0) - (parsedA[index] ?? 0);
      if (delta !== 0) {
        return delta;
      }
    }
    return 0;
  }
  if (parsedA) {
    return -1;
  }
  if (parsedB) {
    return 1;
  }
  return a.localeCompare(b, "zh-CN");
}

function parseVersionParts(value: string) {
  if (!/^\d+(?:\.\d+)+$/.test(value)) {
    return undefined;
  }
  return value.split(".").map((part) => Number.parseInt(part, 10));
}

function sortAssets(a: AssetItem, b: AssetItem, sort: string) {
  const sameSongArt = getSongArtKey(a) && getSongArtKey(a) === getSongArtKey(b);
  if (sameSongArt) {
    const originalPriority = getSongArtPriority(a) - getSongArtPriority(b);
    if (originalPriority !== 0) {
      return originalPriority;
    }
  }

  if (sort === "name") {
    return a.title.localeCompare(b.title, "zh-CN");
  }

  if (sort === "category") {
    return a.category.localeCompare(b.category, "zh-CN") || a.title.localeCompare(b.title, "zh-CN");
  }

  return (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || a.title.localeCompare(b.title, "zh-CN");
}

function getSongArtKey(asset: AssetItem) {
  if (asset.game !== "Arcaea" || (asset.category !== "曲绘" && asset.category !== "曲绘（AI超分后）")) {
    return "";
  }

  return asset.filename
    .replace(/\.[^.]+$/, "")
    .replace(/\.(?:jpg|jpeg|png|webp|avif|gif)_opt$/i, "")
    .replace(/_opt$/i, "")
    .normalize("NFC")
    .toLowerCase();
}

function getSongArtPriority(asset: AssetItem) {
  if (asset.category === "曲绘") {
    return 0;
  }
  if (asset.category === "曲绘（AI超分后）") {
    return 1;
  }
  return 2;
}
