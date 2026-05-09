import Fuse from "fuse.js";
import { useEffect, useMemo, useState } from "react";

import type { AssetItem, GameName } from "../lib/types";
import { AssetCard } from "./AssetCard";
import { FilterPanel } from "./FilterPanel";
import { SearchBar } from "./SearchBar";
import "./gallery.css";

type GalleryGridProps = {
  assets: AssetItem[];
  game: Exclude<GameName, "Unknown"> | "All";
};

const PAGE_SIZE = 40;

export default function GalleryGrid({ assets, game }: GalleryGridProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedMeta, setSelectedMeta] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("recent");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasLoadedUrlParams, setHasLoadedUrlParams] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlQuery = params.get("q")?.trim() ?? "";
    const urlCategory = params.get("category")?.trim() ?? "";
    const urlTag = params.get("tag")?.trim() ?? "";
    const urlSort = params.get("sort")?.trim() ?? "";
    const nextMeta: Record<string, string> = {};
    for (const key of META_FILTER_KEYS) {
      const value = params.get(key)?.trim();
      if (value) {
        nextMeta[key] = value;
      }
    }

    if (urlQuery) {
      setQuery(urlQuery);
      setDebouncedQuery(urlQuery);
    }
    if (urlCategory) {
      setSelectedCategory(urlCategory);
    }
    if (urlTag) {
      setSelectedTag(urlTag);
    }
    setSelectedMeta(nextMeta);
    if (["recent", "name", "category"].includes(urlSort)) {
      setSort(urlSort);
    }
    setHasLoadedUrlParams(true);
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
    if (selectedTag) {
      params.set("tag", selectedTag);
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
  }, [debouncedQuery, hasLoadedUrlParams, selectedCategory, selectedMeta, selectedTag, sort]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedQuery, selectedCategory, selectedMeta, selectedTag, sort]);

  const categories = useMemo(() => countBy(assets.map((asset) => asset.category)), [assets]);
  const tags = useMemo(
    () =>
      countBy(
        assets
          .flatMap((asset) => asset.tags)
          .filter((tag) => game === "All" || tag !== game)
          .filter((tag) => !isStructuredTag(tag)),
      ),
    [assets, game],
  );
  const metaFilters = useMemo(() => buildMetaFilters(assets), [assets]);

  const fuse = useMemo(
    () =>
      new Fuse(assets, {
        keys: ["title", "artist", "filename", "category", "tags", "pack", "version", "bydVersion", "etrVersion", "bg", "sideLabel", "idx"],
        threshold: 0.32,
        ignoreLocation: true,
      }),
    [assets],
  );

  const filteredAssets = useMemo(() => {
    const searched = debouncedQuery ? fuse.search(debouncedQuery).map((result) => result.item) : assets;

    return searched
      .filter((asset) => !selectedCategory || asset.category === selectedCategory)
      .filter((asset) => !selectedTag || asset.tags.includes(selectedTag))
      .filter((asset) => matchesMetaFilters(asset, selectedMeta))
      .sort((a, b) => sortAssets(a, b, sort));
  }, [assets, debouncedQuery, fuse, selectedCategory, selectedMeta, selectedTag, sort]);

  const visibleAssets = filteredAssets.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAssets.length;

  const clearFilters = () => {
    setSelectedCategory("");
    setSelectedTag("");
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

  return (
    <div className="gallery-app">
      <div className="gallery-toolbar">
        <SearchBar value={query} onChange={setQuery} resultCount={filteredAssets.length} />

        <details className="mobile-filter">
          <summary>筛选与排序</summary>
          <FilterPanel
            categories={categories}
            metaFilters={metaFilters}
            tags={tags}
            selectedCategory={selectedCategory}
            selectedTag={selectedTag}
            selectedMeta={selectedMeta}
            sort={sort}
            onCategoryChange={setSelectedCategory}
            onTagChange={setSelectedTag}
            onMetaChange={handleMetaChange}
            onSortChange={setSort}
            onClear={clearFilters}
          />
        </details>
      </div>

      <div className="gallery-layout">
        <aside className="desktop-filter" aria-label="图库筛选">
          <FilterPanel
            categories={categories}
            metaFilters={metaFilters}
            tags={tags}
            selectedCategory={selectedCategory}
            selectedTag={selectedTag}
            selectedMeta={selectedMeta}
            sort={sort}
            onCategoryChange={setSelectedCategory}
            onTagChange={setSelectedTag}
            onMetaChange={handleMetaChange}
            onSortChange={setSort}
            onClear={clearFilters}
          />
        </aside>

        <section className="gallery-results" aria-label={`${game} 资源列表`}>
          {visibleAssets.length > 0 ? (
            <div className="asset-grid">
              {visibleAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>没有匹配的资源</strong>
              <span>换一个关键词，或清空分类和标签筛选。</span>
            </div>
          )}

          {hasMore ? (
            <button
              className="load-more"
              type="button"
              onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
            >
              加载更多
              <span>
                已显示 {visibleAssets.length.toLocaleString("zh-CN")} /{" "}
                {filteredAssets.length.toLocaleString("zh-CN")}
              </span>
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const META_FILTER_KEYS = ["version", "pack", "difficulty", "side", "bg"] as const;

function buildMetaFilters(assets: AssetItem[]) {
  const filters = [
    { label: "更新版本", value: "version", items: countBy(assets.map((asset) => asset.version ?? ""), compareVersionDesc) },
    { label: "曲包 / 章节", value: "pack", items: countBy(assets.map((asset) => asset.pack ?? "")) },
    { label: "独立难度曲绘", value: "difficulty", items: countBy(assets.map((asset) => asset.difficulty ?? ""), compareDifficulty) },
    { label: "背景侧", value: "side", items: countBy(assets.map((asset) => asset.sideLabel ?? "")) },
    { label: "游玩背景", value: "bg", items: countBy(assets.map((asset) => asset.bg ?? "")) },
  ];

  return filters.filter((filter) => filter.items.length > 0);
}

function matchesMetaFilters(asset: AssetItem, selectedMeta: Record<string, string>) {
  return Object.entries(selectedMeta).every(([key, value]) => {
    if (!value) {
      return true;
    }

    if (key === "version") {
      return asset.version === value;
    }
    if (key === "pack") {
      return asset.pack === value;
    }
    if (key === "difficulty") {
      return asset.difficulty === value;
    }
    if (key === "side") {
      return asset.sideLabel === value;
    }
    if (key === "bg") {
      return asset.bg === value;
    }
    return true;
  });
}

function isStructuredTag(tag: string) {
  return /^(BYD|ETR|IDX)\b/i.test(tag) || tag.startsWith("背景 ");
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

type CountItem = {
  name: string;
  count: number;
};

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

function compareDifficulty(a: CountItem, b: CountItem) {
  const order = ["PST", "PRS", "FTR", "BYD", "ETR"];
  return order.indexOf(a.name) - order.indexOf(b.name);
}

function sortAssets(a: AssetItem, b: AssetItem, sort: string) {
  if (sort === "name") {
    return a.title.localeCompare(b.title, "zh-CN");
  }

  if (sort === "category") {
    return (
      a.category.localeCompare(b.category, "zh-CN") ||
      a.title.localeCompare(b.title, "zh-CN")
    );
  }

  return (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || a.title.localeCompare(b.title, "zh-CN");
}
