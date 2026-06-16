# AGENTS.md

## Project Overview

This project is a static gallery/download website for rhythm game visual assets, mainly Arcaea and Phigros.

The site replaces an OpenList-style file browser with a faster, image-first gallery experience. It should stay static, cache-friendly, and usable for mainland China users even when Cloudflare is slow.

Primary production site:

```text
https://www.unknnownnn.homes
```

Production server context:

- Baota Linux panel on Alibaba Cloud Hong Kong.
- Public IP is configured locally in `.deploy.env`, not in source logic.
- Website root: `/www/wwwroot/www.unknnownnn.homes`
- Remote original asset root: `/media/webpan/曲绘`
- Server is small, about 2 cores and 1 GB RAM. Keep remote build memory conservative.

Do not add a backend, database, login system, comments, admin panel, or upload UI unless the user explicitly asks.

The only server-side exception is a tiny Node.js HTTP API server at `scripts/stats-server.mjs` (deployed to `/www/wwwroot/stats-server.mjs`, managed by PM2 as `rhythm-stats-api`) for visitor counting and Arcaea APK runtime download metadata. It stores its runtime data outside the web root under `/www/wwwroot/stats-data/` so it survives atomic deploy switches. Nginx proxies `/api/` requests to this server on `localhost:3001`. This was explicitly requested.

---

## Tech Stack

Use:

- Astro
- React only for interactive components
- TypeScript
- Tailwind CSS
- Fuse.js for client-side search
- Sharp for thumbnail generation
- Node.js scripts with `tsx`
- Windows PowerShell deployment script: `scripts/deploy.ps1`

The package requires Node.js `>=22.12.0`. Remote build mode also checks this.

---

## Repository Location

```text
E:\rhythm-assets-gallery
```

Work only inside this repository unless the user explicitly points to an external reference file.

---

## Source Assets

Local default source of truth:

```text
public/assets
```

Remote production source of truth:

```text
/media/webpan/曲绘
```

The scanner defaults to:

```env
ASSET_ROOT=public/assets
PUBLIC_ASSET_BASE_URL=/assets
PUBLIC_THUMB_BASE_URL=/thumbs
```

If `.env` exists, respect:

```env
ASSET_ROOT=
PUBLIC_ASSET_BASE_URL=
PUBLIC_THUMB_BASE_URL=
```

Never move, delete, rename, compress, overwrite, or modify original files in `public/assets` or the remote asset directory unless the user explicitly asks.

Generated files are:

```text
public/data/*.json
public/thumbs/{320w,640w,1280w}/*.webp
public/sitemap.xml
```

These are generated artifacts and should not be casually committed.

Static SEO/app shell files that are intentional source files include:

```text
public/robots.txt
public/site.webmanifest
public/site-icon.png
public/icon-192.png
public/icon-512.png
public/apple-touch-icon.png
```

The current site icon source is the Arcaea sticker at:

```text
D:\Files\曲绘\Arcaea\APK\arcaea_6.14.0c\assets\img\multiplayer\stickers\ayu.png
```

If regenerating icons, use Sharp or another image tool to make square PNGs without modifying the source sticker.

---

## Asset Index Contract

`AssetItem` is defined in `src/lib/types.ts`. Keep scanner output compatible with it.

Important fields include:

```ts
type AssetItem = {
  id: string;
  game: "Arcaea" | "Phigros" | "Unknown";
  category: string;
  title: string;
  artist?: string;
  version?: string;
  bydVersion?: string;
  etrVersion?: string;
  pack?: string;
  packDisplayName?: string;
  packDescription?: string;
  packSection?: string;
  idx?: number;
  bpm?: string;
  side?: string;
  sideLabel?: string;
  bg?: string;
  difficulty?: "PST" | "PRS" | "FTR" | "BYD" | "ETR";
  difficultyLabel?: string;
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
  wikiUrl?: string;
  tags: string[];
};
```

`id` must remain stable as long as `relativePath` does not change. The current strategy hashes normalized relative path.

---

## Arcaea Parsing Rules

Arcaea jacket filenames are based on an external rename script. A typical filename is:

```text
TITLE_ARTIST_VERSION_BYD x.x_ETR x.x_SET_IDX 123_BPM 180_SIDE 1_BG_ORIGINAL.jpg
```

Important parsing constraints:

- `IDX`, `BPM`, and `SIDE` markers are stable anchors.
- `version` is the numeric version token, for example `6.11` or `3.3`.
- `title`, `artist`, and `set/pack` may contain underscores. Do not blindly split by fixed underscore count.
- Preserve underscores inside title or artist when they are part of the actual name.
- Remove display pollution from optimization suffixes such as `.jpg_opt`, `_opt`, and `_optimization`.
- `bydVersion` and `etrVersion` mean the song has BYD/ETR metadata, not necessarily that the file is an exclusive BYD/ETR jacket.
- `difficulty` means this image file is an independent difficulty jacket and is detected from the original filename suffix:
  - `_0` = `PST` / `Past [PST]`
  - `_1` = `PRS` / `Present [PRS]`
  - `_2` = `FTR` / `Future [FTR]`
  - `_3` = `BYD` / `Beyond [BYD]`
  - `_4` = `ETR` / `Eternal [ETR]`
- `side` mapping:
  - `0` = 光侧
  - `1` = 对立侧（暗侧）
  - `2` = 消色侧
  - `3` = Lephon 侧
- `bg` should match the corresponding file in the `游玩背景` category where possible. Detail pages link the background field to that asset detail page when matched.

Known examples that should remain correctly parsed:

```text
Heart Jackin'_Yu_Asahina_3.3_alice_append_1_IDX 189_BPM 160_SIDE 0_alice_light_heartjackin.jpg_opt.jpg
Lights of Muse_Ayatsugu_Otowa_3.11_musedash_IDX 249_BPM 180_SIDE 0_musedash_light_lightsofmuse.jpg_opt.jpg
~_+_AQUASINE ~ MEMODEMO + METAROOM_6.11_extend_4_IDX 509_BPM 213.5_SIDE 0_nijuusei2_light_mask.jpg
```

If parsing fails, fall back to a safe filename-based title. Never let one bad filename crash the scan.

---

## Phigros Parsing Rules

Most Phigros jackets use:

```text
曲名 - 曲师
```

Split on the last literal ` - ` so spaces in names survive. Keep this exception intact:

```text
Chronos Collapse - La Campanella
```

That title is a song name, not `title - artist`.

---

## Category and Filtering

Detect categories from path segments. Known categories include:

- 曲绘
- 曲绘（AI超分后）
- 曲包封面
- 头像
- 角色
- 立绘
- LinkPlay预览
- 剧情
- 启动页面
- 游玩背景
- April Fools
- 世界模式

If no known category is found, use the nearest meaningful folder name.

Gallery filters currently include:

- Category
- Tags
- Version
- Pack / set
- Independent difficulty jacket
- Side
- Background

Version filter options should sort by semantic numeric version descending, not count or plain string order.

Do not overload tag filters with structured metadata when a dedicated select filter already exists.

---

## Detail Page Behavior

Asset detail pages should show:

- Large preview using generated thumbnail when available
- Metadata table
- Original filename
- File size and dimensions
- Download original image
- Copy direct link
- Tags
- Related assets

For Arcaea:

- Same-pack recommendations must only use the same `pack/set`.
- Same-pack recommendations should be randomized deterministically per current asset, not sorted only by recency.
- If `bg` matches a `游玩背景` asset, render it as a link to that background detail page.
- Do not show Arcaea pack ID, pack section, pack description, or song index in the visible detail metadata table.
- Prefer localized pack names (`packDisplayName`, from Arcaea `name_localized`) in user-facing UI instead of raw pack IDs.
- For background asset detail pages, the Related section should randomly show several songs using that background rather than unrelated same-category assets.
- Arcaea wiki links should go to `https://wiki.arcaea.cn/` and must match the asset type: song assets to song pages, background assets to background pages, pack-cover assets to relevant pack/category pages when available. Avoid guessing if a correct URL cannot be produced.
- Phigros detail pages should not link individual song art to Moegirl/MoeWiki pages because page coverage is incomplete and maintenance-heavy.

Image version behavior:

- For Arcaea jacket art, original jacket images are preferred over AI-upscaled versions when choosing primary previews.
- When both original and AI-upscaled versions exist, make it easy to discover and switch between them, but avoid duplicate controls with the same meaning.

---

## SEO, Sitemap, and Sharing

The site has first-stage SEO support. Preserve these files and helpers:

```text
public/robots.txt
public/sitemap.xml
public/site.webmanifest
scripts/generate-sitemap.ts
src/lib/seo.ts
```

SEO expectations:

- `robots.txt` should allow crawling and declare `Sitemap: https://www.unknnownnn.homes/sitemap.xml`.
- `scripts/generate-sitemap.ts` reads `public/data/arcaea-index.json` and `public/data/phigros-index.json`.
- The sitemap includes `/`, `/arcaea/`, `/phigros/`, and every `/asset/[id]/` detail page.
- Sitemap URLs must be XML-escaped and include `lastmod`; valid asset `mtimeMs` is preferred, but obviously bogus old dates should fall back to the current date.
- Homepage, Arcaea, Phigros, search, and detail pages should have meaningful `title`, `description`, `canonical`, and Open Graph tags.
- Image `alt` text should be generated from game, category, title, and artist via `assetAlt`.
- Detail pages can use the asset thumbnail as `og:image`; static page fallback should use `/site-icon.png`.
- Keep some visible natural-language explanatory text on homepage and game pages so search engines can understand the image-heavy site.

After SEO, scanner, or metadata changes, run `npm run update` before `npm run build` so sitemap and data stay in sync.

---

## Performance Rules

Mainland China users may have unstable access to Cloudflare. Keep the static site fast by default.

- Use static generation.
- Keep JavaScript small.
- Use thumbnails in gallery cards.
- Do not load originals in listing grids.
- Use lazy loading and `decoding="async"` for images.
- Use load-more or pagination for large galleries.
- Homepage should not load both full game indexes.
- Arcaea page should load only Arcaea index.
- Phigros page should load only Phigros index.
- Search input should be debounced.
- Desktop gallery filters should remain independently scrollable inside the viewport. The current fix is on `.desktop-filter`: sticky positioning plus `max-height: calc(100vh - 36px)` and `overflow-y: auto`. Do not regress this, or lower filter options become unreachable before the main content scrolls to the bottom.

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
npm run validate:assets
npm run import:incoming
```

`npm run update` means:

```text
npm run scan && npm run thumbs && npm run sitemap
```

Before finishing a coding task, run at least:

```powershell
npm run build
```

If the task touches scanner logic, asset metadata, generated data, or thumbnails, also run:

```powershell
npm run update
```

If the task touches SEO metadata, sitemap generation, robots, or detail-page URL coverage, also run:

```powershell
npm run update
npm run build
```

For deployment-related changes, run the relevant local checks before deploying.

---

## Deployment

Deployment uses:

```powershell
.\scripts\deploy.ps1 -Mode remote-build
```

The deploy script reads local deployment configuration from:

```text
.deploy.env
```

`.deploy.env` is intentionally ignored and must not be committed. Keep `.deploy.env.example` safe to commit.

After `npm install`, the repo installs a local `pre-commit` hook via `core.hooksPath=.githooks`. Keep that guard active. It blocks committed `.deploy.env`, private key material, and real deployment values accidentally pasted into `.deploy.env.example` or `README.md`.

Remote build mode:

1. Creates a local source archive excluding large/generated directories.
2. Cleans old remote build files.
3. Checks remote free disk space.
4. Uploads source archive with `scp`.
5. Reuses deployed `thumbs` before running `npm run update`.
6. Runs remote `npm ci` or `npm install`.
7. Runs remote `npm run update` and `npm run build`.
8. Atomically switches the generated `dist` into the Baota website root.

The server is memory-constrained. Keep these defaults unless there is a strong reason:

```env
DEPLOY_REMOTE_SHARP_CONCURRENCY=1
DEPLOY_REMOTE_SHARP_CACHE_MEMORY_MB=64
```

The script reuses existing deployed thumbnails. On normal metadata or page changes, it should skip existing thumbnails rather than regenerate thousands of files.

The visitor stats API server (`scripts/stats-server.mjs`) runs as a separate PM2 process and is not managed by the deploy script. It stores runtime data at `/www/wwwroot/stats-data/` (outside the web root), listens on `localhost:3001`, and now also serves Arcaea APK metadata plus streamed downloads from server-local cached files. Nginx proxies `/api/` to it via a location block in `/www/server/panel/vhost/nginx/www.unknnownnn.homes.conf`. This nginx config is managed by Baota — if Baota regenerates the site config, the `/api/` proxy block may need to be re-added.

If the user explicitly asks to update/publish/sync the website, the normal flow is:

```powershell
npm run update
npm run build
.\scripts\deploy.ps1 -Mode remote-build
```

For small UI-only changes where scanner data and sitemap are unaffected, `npm run build` before deploy is enough locally; the remote build script will still run `npm run update` as part of deployment.

If the user only asks for code changes and does not mention deployment, do not publish automatically.

Use SSH keys for deployment where possible. Do not store server passwords in scripts or committed files.

---

## Git Rules

The current main branch is:

```text
main
```

The repository may not have a remote configured. Check before attempting to push:

```powershell
git remote -v
```

Commit only intentional source, script, and documentation changes. Do not commit:

- `.env`
- `.deploy.env`
- `.deploy-work`
- `dist`
- `.astro`
- `node_modules`
- `public/assets`
- `public/thumbs`
- `public/data/*.json`
- preview/dev logs
- local proxy helper scripts

If `.git` writes fail on Windows because of permissions or `.git/index.lock`, diagnose the filesystem/ACL issue before assuming repo corruption.

---

## Coding Rules

- Use TypeScript.
- Prefer small, focused files.
- Preserve existing Astro/React/Tailwind patterns.
- Do not introduce a backend server for the MVP.
- Do not introduce a database.
- Do not add authentication.
- Do not hardcode absolute local Windows paths into source code.
- Use environment variables or project-relative defaults.
- Handle Chinese, Japanese, spaces, symbols, and special characters in filenames safely.
- Use URL encoding when generating public URLs.
- Use normalized POSIX-style paths in JSON output.
- Keep scanner output deterministic where practical.
- Log warnings instead of failing on individual unparseable files.
- Do not perform unrelated refactors.

---

## Work Style for Codex

Before making changes:

1. Inspect the current source tree and relevant files.
2. Read `package.json` if command behavior matters.
3. Make a short plan for substantial changes.
4. Implement one stage at a time.
5. Run the relevant commands.
6. Report changed files, verification results, and deployment status.

When debugging scanner output, inspect generated JSON with UTF-8-safe PowerShell commands and test specific filenames mentioned by the user.

When the user says to deploy after changes, verify locally first, then run remote build deployment.

If verifying production with Windows PowerShell, `curl.exe` or `Invoke-WebRequest` may occasionally fail with Schannel `SEC_E_NO_CREDENTIALS` even when the site is healthy. Treat that as a local TLS/client issue, try a different fetch method, and rely on the deploy script's successful remote build plus atomic switch as the primary deployment signal when HTTP verification is blocked.
