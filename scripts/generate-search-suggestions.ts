import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AssetItem } from "../src/lib/types";

type LocalizedText = Record<string, string | undefined>;
type SearchMap = Record<string, string[] | undefined>;

type ArcaeaSongDifficulty = {
  title_localized?: LocalizedText;
  artist?: string;
  search_title?: SearchMap;
  search_artist?: SearchMap;
};

type ArcaeaSongMetadata = {
  title_localized?: LocalizedText;
  artist?: string;
  search_title?: SearchMap;
  search_artist?: SearchMap;
  difficulties?: ArcaeaSongDifficulty[];
};

type ArcaeaCharacterMetadata = {
  name?: string;
  search_strings?: string[];
};

type ArcaeaMetadata = {
  songs?: ArcaeaSongMetadata[];
  characters?: ArcaeaCharacterMetadata[];
};

const PROJECT_ROOT = process.cwd();
const DATA_DIR = join(PROJECT_ROOT, "public", "data");
const OUTPUT = join(DATA_DIR, "search-suggestions.json");
const ARCAEA_METADATA_PATH = join(PROJECT_ROOT, "scripts", "data", "arcaea-metadata.json");
const SONG_ASSET_CATEGORIES = new Set<AssetItem["category"]>(["曲绘", "曲绘（AI超分后）"]);

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function normalizeSuggestion(value: string | undefined) {
  return value?.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeCharacterEnglishName(value?: string) {
  return value?.trim().replace(/_/g, " ") || undefined;
}

function hasCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function hasKanaOrHangul(value: string) {
  return /[\u3040-\u30ff\uac00-\ud7af]/.test(value);
}

function scoreChineseName(value: string) {
  let score = 0;

  if (/[对红调梦凛丽爱托云闪]/.test(value)) {
    score += 2;
  }

  if (/[對紅調夢凜麗愛託雲閃]/.test(value)) {
    score -= 1;
  }

  return score;
}

function pickChineseCharacterName(values?: string[]) {
  const candidates = (values ?? []).map((value) => value.trim()).filter(Boolean);
  const cjkOnly = candidates.filter((value) => hasCjk(value) && !hasKanaOrHangul(value));
  const preferred = cjkOnly
    .map((value, index) => ({ value, score: scoreChineseName(value), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.value;

  return preferred ?? candidates[0];
}

function createSuggestionCollector() {
  const seen = new Set<string>();
  const suggestions: string[] = [];

  function add(value: string | undefined) {
    const normalized = normalizeSuggestion(value);
    if (!normalized) {
      return;
    }

    const key = normalized.toLocaleLowerCase("en-US");
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    suggestions.push(normalized);
  }

  function addLocalized(localized?: LocalizedText) {
    if (!localized) {
      return;
    }

    for (const value of Object.values(localized)) {
      add(value);
    }
  }

  function addSearchMap(searchMap?: SearchMap) {
    if (!searchMap) {
      return;
    }

    for (const values of Object.values(searchMap)) {
      if (!values) {
        continue;
      }

      for (const value of values) {
        add(value);
      }
    }
  }

  return { suggestions, add, addLocalized, addSearchMap };
}

function collectArcaeaSongSuggestions(
  metadata: ArcaeaMetadata,
  assets: AssetItem[],
  add: (value: string | undefined) => void,
  addLocalized: (localized?: LocalizedText) => void,
  addSearchMap: (searchMap?: SearchMap) => void,
) {
  for (const song of metadata.songs ?? []) {
    addLocalized(song.title_localized);
    add(song.artist);
    addSearchMap(song.search_title);
    addSearchMap(song.search_artist);

    for (const difficulty of song.difficulties ?? []) {
      addLocalized(difficulty.title_localized);
      add(difficulty.artist);
      addSearchMap(difficulty.search_title);
      addSearchMap(difficulty.search_artist);
    }
  }

  for (const asset of assets) {
    if (!SONG_ASSET_CATEGORIES.has(asset.category)) {
      continue;
    }

    add(asset.title);
    add(asset.artist);
  }
}

function collectPhigrosSongSuggestions(
  assets: AssetItem[],
  add: (value: string | undefined) => void,
) {
  for (const asset of assets) {
    if (!SONG_ASSET_CATEGORIES.has(asset.category)) {
      continue;
    }

    add(asset.title);
    add(asset.artist);
  }
}

function collectCharacterSuggestions(
  metadata: ArcaeaMetadata,
  assets: AssetItem[],
  add: (value: string | undefined) => void,
) {
  if ((metadata.characters?.length ?? 0) > 0) {
    for (const character of metadata.characters ?? []) {
      add(pickChineseCharacterName(character.search_strings));
      add(normalizeCharacterEnglishName(character.name));

      for (const alias of character.search_strings ?? []) {
        add(alias);
      }
    }

    return;
  }

  for (const asset of assets) {
    add(asset.characterName);
    add(asset.characterEnglishName);

    for (const name of asset.relatedCharacterNames ?? []) {
      add(name);
    }
  }
}

function main() {
  const arcaeaAssets = readJson<AssetItem[]>(join(DATA_DIR, "arcaea-index.json"), []);
  const phigrosAssets = readJson<AssetItem[]>(join(DATA_DIR, "phigros-index.json"), []);
  const arcaeaMetadata = readJson<ArcaeaMetadata>(ARCAEA_METADATA_PATH, {});
  const { suggestions, add, addLocalized, addSearchMap } = createSuggestionCollector();

  collectArcaeaSongSuggestions(arcaeaMetadata, arcaeaAssets, add, addLocalized, addSearchMap);
  collectPhigrosSongSuggestions(phigrosAssets, add);
  collectCharacterSuggestions(arcaeaMetadata, arcaeaAssets, add);

  writeFileSync(OUTPUT, `${JSON.stringify(suggestions)}\n`, "utf8");
  console.log(`search-suggestions: wrote ${suggestions.length} suggestions`);
}

main();
