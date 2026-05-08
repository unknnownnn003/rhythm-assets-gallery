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
  const [sort, setSort] = useState("recent");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasLoadedUrlParams, setHasLoadedUrlParams] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlQuery = params.get("q")?.trim() ?? "";
    const urlCategory = params.get("category")?.trim() ?? "";
    const urlTag = params.get("tag")?.trim() ?? "";
    const urlSort = params.get("sort")?.trim() ?? "";

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
    if (sort !== "recent") {
      params.set("sort", sort);
    }

    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [debouncedQuery, hasLoadedUrlParams, selectedCategory, selectedTag, sort]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedQuery, selectedCategory, selectedTag, sort]);

  const categories = useMemo(() => countBy(assets.map((asset) => asset.category)), [assets]);
  const tags = useMemo(
    () => countBy(assets.flatMap((asset) => asset.tags).filter((tag) => game === "All" || tag !== game)),
    [assets, game],
  );

  const fuse = useMemo(
    () =>
      new Fuse(assets, {
        keys: ["title", "artist", "filename", "category", "tags", "pack", "version"],
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
      .sort((a, b) => sortAssets(a, b, sort));
  }, [assets, debouncedQuery, fuse, selectedCategory, selectedTag, sort]);

  const visibleAssets = filteredAssets.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAssets.length;

  const clearFilters = () => {
    setSelectedCategory("");
    setSelectedTag("");
    setSort("recent");
  };

  return (
    <div className="gallery-app">
      <div className="gallery-toolbar">
        <SearchBar value={query} onChange={setQuery} resultCount={filteredAssets.length} />

        <details className="mobile-filter">
          <summary>筛选与排序</summary>
          <FilterPanel
            categories={categories}
            tags={tags}
            selectedCategory={selectedCategory}
            selectedTag={selectedTag}
            sort={sort}
            onCategoryChange={setSelectedCategory}
            onTagChange={setSelectedTag}
            onSortChange={setSort}
            onClear={clearFilters}
          />
        </details>
      </div>

      <div className="gallery-layout">
        <aside className="desktop-filter" aria-label="图库筛选">
          <FilterPanel
            categories={categories}
            tags={tags}
            selectedCategory={selectedCategory}
            selectedTag={selectedTag}
            sort={sort}
            onCategoryChange={setSelectedCategory}
            onTagChange={setSelectedTag}
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

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
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
