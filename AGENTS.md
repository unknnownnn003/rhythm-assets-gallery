# AGENTS.md

## Project Overview

This project is a static gallery/download website for rhythm game visual assets, mainly Arcaea and Phigros.

The goal is to replace an OpenList-style file browser with a modern, fast, responsive, human-friendly gallery experience.

The website should support:

- Image gallery browsing
- Fast search
- Tag filtering
- Category filtering
- Game filtering
- Mobile / tablet / desktop responsive layouts
- Thumbnail-first loading
- Original image download
- Future automated asset update workflow

The primary users are in mainland China. The server is expected to be in Hong Kong. Cloudflare may be used, but Cloudflare can be slow in mainland China, so the site must remain fast even without relying heavily on Cloudflare.

Prioritize static generation, small JavaScript payloads, thumbnails, lazy loading, and cache-friendly assets.

---

## Tech Stack

Use:

- Astro
- React components only where interactivity is needed
- TypeScript
- Tailwind CSS
- Fuse.js for client-side search
- Sharp for thumbnail generation
- Node.js scripts for asset scanning and update automation

Do not add a database in the MVP.

Do not add user login, comments, admin dashboard, or upload UI in the MVP.

---

## Repository Location

The project is located at:

```text
E:\rhythm-assets-gallery
````

---

## Asset Storage Rule

The original image assets are stored directly inside:

```text
public/assets
```

The code must treat `public/assets` as the source of truth for displayable original images.

Do not move, delete, rename, compress, overwrite, or modify files inside `public/assets` unless the user explicitly asks.

The scanner should recursively scan `public/assets`.

If `.env` does not exist, the scanner should default to:

```env
ASSET_ROOT=public/assets
PUBLIC_ASSET_BASE_URL=/assets
PUBLIC_THUMB_BASE_URL=/thumbs
```

If `.env` exists, respect these variables:

```env
ASSET_ROOT=
PUBLIC_ASSET_BASE_URL=
PUBLIC_THUMB_BASE_URL=
```

---

## Expected Asset Directory Structure

The user may place files in this style:

```text
public/assets
├── Arcaea（至6.14.0）
│   ├── 曲绘
│   ├── 曲绘（AI超分后）
│   ├── 曲包封面
│   ├── 角色
│   ├── 剧情
│   ├── 启动页面
│   └── 游玩背景
└── Phigros（至3.19.1）
    ├── 曲绘
    ├── 头像
    ├── 曲包封面
    └── April Fools
```

The scanner must not depend on the exact version number in folder names.

For example:

* `Arcaea（至6.14.0）` should be detected as `Arcaea`
* `Phigros（至3.19.1）` should be detected as `Phigros`

---

## Generated Files

Generated data should be placed in:

```text
public/data
```

Expected generated files:

```text
public/data/arcaea-index.json
public/data/phigros-index.json
public/data/summary.json
public/data/recent-updates.json
public/data/tags.json
```

Generated thumbnails should be placed in:

```text
public/thumbs
```

Expected thumbnail sizes:

```text
320w
640w
1280w
```

Preferred thumbnail format:

```text
webp
```

The site should use thumbnails for browsing and only load original images when the user opens the detail page or downloads the file.

---

## Asset Index Requirements

Each asset item should include at least:

```ts
type GameName = "Arcaea" | "Phigros" | "Unknown";

type AssetItem = {
  id: string;
  game: GameName;
  category: string;
  title: string;
  artist?: string;
  version?: string;
  pack?: string;
  idx?: number;
  bpm?: string;
  side?: string;
  filename: string;
  extension: string;
  relativePath: string;
  url: string;
  thumbnailSmall?: string;
  thumbnailMedium?: string;
  thumbnailLarge?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  mtimeMs?: number;
  tags: string[];
};
```

The `id` must be stable across scans as long as the relative path does not change.

A good ID strategy is to hash the normalized relative path.

---

## Arcaea Filename Parsing

Many Arcaea song jacket files may use this pattern:

```text
TITLE_ARTIST_VERSION_PACK_IDX 123_BPM 180_SIDE 1_xxx.jpg
```

The parser should try to extract:

* title
* artist
* version
* pack
* idx
* bpm
* side

If parsing fails, fall back to filename-based title.

Never crash the scan because one filename cannot be parsed.

---

## Category Detection

Detect categories from path segments.

Common categories include:

* 曲绘
* 曲绘（AI超分后）
* 曲包封面
* 头像
* 角色
* 立绘
* LinkPlay预览
* 剧情
* 启动页面
* 游玩背景
* April Fools
* 世界模式

If no known category is found, use the nearest meaningful folder name as category.

---

## Future Automated Update Requirement

Reserve a future-friendly automated update workflow.

The project should eventually support this flow:

```text
1. External automation downloads or syncs new image assets.
2. New files are placed into public/assets or a temporary incoming directory.
3. A script validates and imports them.
4. The scanner updates JSON indexes.
5. The thumbnail generator creates missing thumbnails.
6. The site is rebuilt and deployed.
```

For now, implement the MVP so that manual updates work like this:

```powershell
npm run update
npm run build
```

But leave the structure ready for future automation.

Recommended future directories:

```text
automation/
├── incoming/
├── processed/
├── rejected/
└── logs/
```

Recommended future scripts:

```text
scripts/import-incoming-assets.ts
scripts/validate-assets.ts
scripts/update-assets.ts
```

Do not implement external downloaders in the MVP.

Do not add scraping or auto-download logic unless the user explicitly requests it.

---

## Performance Requirements

Mainland China users may have unstable or slow access to Cloudflare. Therefore:

* Do not rely on Cloudflare alone for speed.
* Keep the site static whenever possible.
* Keep JavaScript small.
* Avoid heavy client-side frameworks.
* Do not load full original images in gallery lists.
* Use thumbnails in gallery cards.
* Use lazy loading for images.
* Use `decoding="async"` for images.
* Use pagination or "load more" for large galleries.
* Do not load both Arcaea and Phigros full indexes on the homepage.
* Homepage should only load summary and recent update data.
* Arcaea page should load only Arcaea index.
* Phigros page should load only Phigros index.
* Use debounced search input.

---

## Responsive UI Requirements

The website must work well on:

* Desktop
* Laptop
* Tablet
* Mobile phones

Layout expectations:

* Desktop: wide gallery grid with visible filter sidebar
* Tablet: adaptive grid, filters can be collapsed
* Mobile: single-column or two-column image cards, filter drawer or collapsible filter panel

The UI should be modern, clean, image-focused, and suitable for rhythm game artwork.

Avoid OpenList-like plain file table UI.

---

## Pages

Required pages:

```text
src/pages/index.astro
src/pages/arcaea.astro
src/pages/phigros.astro
src/pages/asset/[id].astro
```

Homepage should show:

* Hero section
* Main search entry
* Game entry cards
* Category shortcuts
* Recently updated assets
* Basic site statistics

Gallery pages should show:

* Search bar
* Game/category/tag filters
* Sort options
* Responsive image grid
* Load more or pagination

Asset detail page should show:

* Large preview image
* Metadata
* Tags
* Original filename
* Download button
* Copy direct link button
* Related assets

---

## Commands

Expected commands:

```powershell
npm run dev
npm run build
npm run preview
npm run scan
npm run thumbs
npm run update
```

`npm run update` should run:

```text
scan + thumbnail generation
```

Before finishing any coding task, run at least:

```powershell
npm run build
```

If the task touches scanning or thumbnails, also run:

```powershell
npm run update
```

---

## Coding Rules

* Use TypeScript.
* Prefer small, focused files.
* Do not introduce a backend server for the MVP.
* Do not introduce a database for the MVP.
* Do not add authentication.
* Do not hardcode absolute local Windows paths into source code.
* Use environment variables or project-relative defaults.
* Do not modify original files in `public/assets`.
* Handle Chinese, Japanese, spaces, symbols, and special characters in filenames safely.
* Use URL encoding when generating public URLs.
* Use normalized POSIX-style paths in JSON output.
* Avoid fragile parsing that crashes on unusual filenames.
* Log warnings instead of failing when individual files cannot be parsed.
* Keep generated files deterministic where possible.

---

## Git Rules

The following directories may contain large generated or original files:

```text
public/assets
public/thumbs
public/data
automation/incoming
automation/processed
automation/rejected
automation/logs
```

Ask the user before changing `.gitignore` behavior for these directories.

Do not delete large files automatically.

---

## Work Style for Codex

Before making changes:

1. Inspect the project structure.
2. Read `package.json`.
3. Check whether Astro, React, Tailwind, Fuse.js, Sharp, and tsx are installed.
4. Make a short plan.
5. Implement one stage at a time.
6. Run the relevant commands.
7. Report changed files and how to test.

Do not rewrite the whole project in one step.

Do not perform unrelated refactors.

Do not touch files outside this project directory.