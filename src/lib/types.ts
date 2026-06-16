export type GameName = "Arcaea" | "Phigros" | "Unknown";

export type KnownAssetCategory =
  | "曲绘"
  | "曲绘（AI超分后）"
  | "曲包封面"
  | "头像"
  | "角色"
  | "立绘"
  | "LinkPlay预览"
  | "LinkPlay贴纸"
  | "剧情"
  | "剧情贴图"
  | "启动页面"
  | "游玩背景"
  | "April Fools"
  | "世界模式";

export type AssetCategory = KnownAssetCategory | (string & {});

export type AssetItem = {
  id: string;
  game: GameName;
  category: AssetCategory;
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
  songId?: string;
  bpm?: string;
  side?: string;
  sideLabel?: string;
  bg?: string;
  bgInverse?: string;
  difficulty?: "PST" | "PRS" | "FTR" | "BYD" | "ETR";
  difficultyLabel?: string;
  difficultyRating?: string;
  difficultyRatings?: string[];
  chartDesigner?: string;
  jacketDesigner?: string;
  characterId?: number;
  characterName?: string;
  characterEnglishName?: string;
  characterVariant?: string;
  relatedCharacterIds?: number[];
  relatedCharacterNames?: string[];
  storyNode?: string;
  storyPathTitle?: string;
  storyType?: string;
  storyAct?: number;
  relatedSongId?: string;
  relatedSongTitle?: string;
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

export type AssetIndex = AssetItem[];

export type GameSummary = {
  game: GameName;
  totalAssets: number;
  categories: Record<string, number>;
  tags: Record<string, number>;
};

export type SiteSummary = {
  totalAssets: number;
  games: GameSummary[];
  generatedAt: string;
};

export type TagSummary = {
  name: string;
  count: number;
};

export type ArcaeaApkVersion = {
  version: string;
  filename: string;
  sizeBytes: number;
  scrapedAt: string;
};

export type ArcaeaApkPublicMeta = {
  latest: ArcaeaApkVersion | null;
  history: ArcaeaApkVersion[];
  lastChecked: string;
  downloadCount: number;
  downloadHref: string;
};
