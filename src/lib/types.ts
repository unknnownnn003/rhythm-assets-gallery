export type GameName = "Arcaea" | "Phigros" | "Unknown";

export type KnownAssetCategory =
  | "曲绘"
  | "曲绘（AI超分后）"
  | "曲包封面"
  | "头像"
  | "角色"
  | "立绘"
  | "LinkPlay预览"
  | "剧情"
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
