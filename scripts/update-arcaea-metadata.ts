import { existsSync, readFileSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

type LocalizedText = Record<string, string | undefined>;

type SongList = {
  songs?: Array<{
    idx?: number;
    id: string;
    title_localized?: LocalizedText;
    artist?: string;
    bpm?: string;
    set?: string;
    side?: number | string;
    bg?: string;
    bg_inverse?: string;
    version?: string;
    bydversion?: string;
    etrversion?: string;
    difficulties?: Array<{
      ratingClass?: number;
      chartDesigner?: string;
      jacketDesigner?: string;
      rating?: number;
      ratingPlus?: boolean;
      bpm?: string;
      bg?: string;
      bg_inverse?: string;
      version?: string;
      title_localized?: LocalizedText;
      artist?: string;
    }>;
  }>;
};

type PackList = {
  packs?: Array<{
    id: string;
    section: string;
    pack_parent?: string;
    plus_character?: number;
    name_localized?: LocalizedText;
    description_localized?: LocalizedText;
  }>;
};

type CharacterMetadata = {
  character_id?: number;
  name?: string;
  pack_id?: string;
  search_strings?: string[];
};

type StoryOrdering = {
  ordering?: Array<{
    act?: number;
    paths?: Array<{
      title?: string;
      type?: string;
      characters?: number[];
      nodes?: string[];
      purchases?: string[];
    }>;
  }>;
};

type StoryNode = {
  node: string;
  pathTitle?: string;
  type?: string;
  act?: number;
  pathSlug?: string;
  characters?: number[];
  purchases?: string[];
  cgPath?: string;
  clearSongId?: string;
};

const PROJECT_ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "scripts", "data", "arcaea-metadata.json");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const assetsDir = args["assets-dir"] ?? args.assets;
  if (!assetsDir) {
    throw new Error("Usage: npm run arcaea:metadata -- --assets-dir <extracted-apk-assets-dir> [--out scripts/data/arcaea-metadata.json]");
  }

  const resolvedAssetsDir = path.resolve(PROJECT_ROOT, assetsDir);
  const outputPath = path.resolve(PROJECT_ROOT, args.out ?? DEFAULT_OUTPUT);
  const songList = readJson<SongList>(path.join(resolvedAssetsDir, "songs", "songlist"));
  const packList = readJson<PackList>(path.join(resolvedAssetsDir, "songs", "packlist"));
  const characters = readOptionalJson<CharacterMetadata[]>(path.join(resolvedAssetsDir, "char", "characters.json")) ?? [];
  const storyNodes = await readStoryNodes(resolvedAssetsDir);

  const metadata = {
    source: toPosixPath(path.relative(PROJECT_ROOT, resolvedAssetsDir)) || resolvedAssetsDir,
    generatedAt: new Date().toISOString(),
    songs: songList.songs ?? [],
    packs: packList.packs ?? [],
    characters,
    storyNodes,
  };

  await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(`update-arcaea-metadata: songs=${metadata.songs.length}, packs=${metadata.packs.length}, characters=${characters.length}, storyNodes=${storyNodes.length}`);
  console.log(`update-arcaea-metadata: wrote ${outputPath}`);
}

async function readStoryNodes(assetsDir: string): Promise<StoryNode[]> {
  const orderingPath = path.join(assetsDir, "app-data", "story2", "ordering");
  if (!existsSync(orderingPath)) {
    return [];
  }

  const ordering = readJson<StoryOrdering>(orderingPath);
  const nodes = new Map<string, StoryNode>();
  for (const act of ordering.ordering ?? []) {
    for (const storyPath of act.paths ?? []) {
      for (const node of storyPath.nodes ?? []) {
        nodes.set(node, {
          node,
          pathTitle: storyPath.title,
          type: storyPath.type,
          act: act.act,
          pathSlug: slugifyStoryPathTitle(storyPath.title),
          characters: storyPath.characters,
          purchases: storyPath.purchases,
        });
      }
    }
  }

  for (const branch of ["main", "side"] as const) {
    const branchDir = path.join(assetsDir, "app-data", "story", branch);
    if (!existsSync(branchDir)) {
      continue;
    }

    const files = await readdir(branchDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.startsWith("entries_")) {
        continue;
      }

      const major = file.name.slice("entries_".length);
      const data = readJson<{ entries?: Array<{ minor?: number | string; storyCgPath?: string; clearSongId?: string }> }>(path.join(branchDir, file.name));
      for (const entry of data.entries ?? []) {
        const node = `${major}-${entry.minor}`;
        const current = nodes.get(node) ?? { node, type: branch };
        nodes.set(node, {
          ...current,
          cgPath: entry.storyCgPath ?? current.cgPath,
          clearSongId: entry.clearSongId ?? current.clearSongId,
        });
      }
    }
  }

  return [...nodes.values()].sort((a, b) => a.node.localeCompare(b.node, "zh-CN"));
}

function slugifyStoryPathTitle(value?: string) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, "") || undefined;
}

function readJson<T>(filePath: string): T {
  if (!existsSync(filePath)) {
    throw new Error(`Missing required Arcaea metadata file: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readOptionalJson<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function parseArgs(args: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = value;
      index += 1;
    }
  }
  return parsed;
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
