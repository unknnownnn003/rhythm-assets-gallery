import { useEffect, useState } from "react";

import type { ArcaeaApkPublicMeta } from "../lib/types";

type DownloadCardFallback = {
  title: string;
  status: string;
  version: string;
  updatedAt: string;
  cacheCount: string;
  href: string;
  button: string;
  note: string;
};

type Props = {
  fallback: DownloadCardFallback;
};

const API_PATH = "/api/apk/arcaea/latest";
const DOWNLOAD_PATH = "/api/download/arcaea/latest";
const PRODUCTION_HOST = "www.unknnownnn.homes";
const LOCAL_API_ORIGIN = "http://localhost:3001";

function formatDate(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "未知大小";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function buildApiCandidates(apiPath: string) {
  const candidates = [apiPath];

  if (
    typeof window !== "undefined" &&
    window.location.hostname &&
    window.location.hostname !== PRODUCTION_HOST
  ) {
    candidates.push(`${LOCAL_API_ORIGIN}${apiPath}`);
  }

  return candidates;
}

async function fetchArcaeaApkMeta(): Promise<ArcaeaApkPublicMeta | null> {
  for (const url of buildApiCandidates(API_PATH)) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as Partial<ArcaeaApkPublicMeta>;
      if (!Array.isArray(data.history) || !("downloadHref" in data)) {
        continue;
      }

      return {
        latest: data.latest ?? null,
        history: data.history,
        lastChecked: data.lastChecked ?? "",
        downloadCount: typeof data.downloadCount === "number" ? data.downloadCount : 0,
        downloadHref: typeof data.downloadHref === "string" ? data.downloadHref : DOWNLOAD_PATH,
      };
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function buildCardData(meta: ArcaeaApkPublicMeta | null, fallback: DownloadCardFallback) {
  if (!meta?.latest) {
    return fallback;
  }

  const updatedAt = formatDate(meta.latest.scrapedAt);
  const downloadCount = meta.downloadCount ?? 0;

  return {
    title: fallback.title,
    status: "可用",
    version: meta.latest.version,
    updatedAt: updatedAt || fallback.updatedAt,
    cacheCount: `${downloadCount} 次`,
    href: meta.downloadHref || DOWNLOAD_PATH,
    button: `下载 ${meta.latest.version}`,
    note: `文件大小 ${formatBytes(meta.latest.sizeBytes)}，支持断点续传。`,
  };
}

export default function ArcaeaApkDownloadCard({ fallback }: Props) {
  const [meta, setMeta] = useState<ArcaeaApkPublicMeta | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchArcaeaApkMeta().then((nextMeta) => {
      if (cancelled || !nextMeta) {
        return;
      }

      setMeta(nextMeta);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const card = buildCardData(meta, fallback);
  const isReady = Boolean(meta?.latest && card.href);

  return (
    <div className="hero-download-card">
      <div className="hero-download-head">
        <span className={`hero-download-badge${isReady ? " is-ready" : ""}`}>
          {card.status}
        </span>
        <strong>{card.title}</strong>
      </div>
      <div className="hero-download-stats">
        <div>
          <small>版本</small>
          <span>{card.version}</span>
        </div>
        <div>
          <small>更新日期</small>
          <span>{card.updatedAt}</span>
        </div>
        <div>
          <small>累计下载</small>
          <span>{card.cacheCount}</span>
        </div>
      </div>
      {card.href ? (
        <a className="hero-download-btn" href={card.href}>
          {card.button}
        </a>
      ) : (
        <span className="hero-download-btn is-pending">{card.button}</span>
      )}
      <p className="hero-download-note">{card.note}</p>
    </div>
  );
}
