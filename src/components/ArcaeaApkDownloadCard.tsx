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

type CardAction = "download" | "pending" | "retry";
type RequestState = "idle" | "loading" | "complete";

type CardData = DownloadCardFallback & {
  action: CardAction;
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
    return "\u672a\u77e5\u5927\u5c0f";
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

function buildCardData(
  meta: ArcaeaApkPublicMeta | null,
  fallback: DownloadCardFallback,
  requestState: RequestState,
): CardData {
  if (meta?.latest) {
    const updatedAt = formatDate(meta.latest.scrapedAt);
    const downloadCount = meta.downloadCount ?? 0;

    return {
      title: fallback.title,
      status: "\u53ef\u7528",
      version: meta.latest.version,
      updatedAt: updatedAt || fallback.updatedAt,
      cacheCount: `${downloadCount} \u6b21`,
      href: meta.downloadHref || DOWNLOAD_PATH,
      button: `\u4e0b\u8f7d ${meta.latest.version}`,
      note: `\u6587\u4ef6\u5927\u5c0f ${formatBytes(meta.latest.sizeBytes)}\uff0c\u652f\u6301\u65ad\u70b9\u7eed\u4f20\u3002`,
      action: "download",
    };
  }

  if (requestState === "loading") {
    return {
      ...fallback,
      status: "\u83b7\u53d6\u4e2d",
      href: "",
      button: "\u6b63\u5728\u83b7\u53d6\u6700\u65b0\u7248\u672c",
      note: fallback.note || "\u6b63\u5728\u540c\u6b65\u6700\u65b0\u5ba2\u6237\u7aef\u4fe1\u606f\uff0c\u8bf7\u7a0d\u5019\u3002",
      action: "pending",
    };
  }

  if (requestState === "complete") {
    return {
      ...fallback,
      status: "\u6682\u65f6\u4e0d\u53ef\u7528",
      href: "",
      button: "\u5237\u65b0\u9875\u9762\u91cd\u8bd5",
      note:
        fallback.note ||
        "\u6682\u65f6\u65e0\u6cd5\u83b7\u53d6\u6700\u65b0\u5ba2\u6237\u7aef\u4fe1\u606f\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5\u3002",
      action: "retry",
    };
  }

  return {
    ...fallback,
    href: "",
    action: "pending",
  };
}

export default function ArcaeaApkDownloadCard({ fallback }: Props) {
  const [meta, setMeta] = useState<ArcaeaApkPublicMeta | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");

  useEffect(() => {
    let cancelled = false;

    setRequestState("loading");

    fetchArcaeaApkMeta().then((nextMeta) => {
      if (cancelled) {
        return;
      }

      setMeta(nextMeta);
      setRequestState("complete");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const card = buildCardData(meta, fallback, requestState);
  const isReady = card.action === "download" && Boolean(card.href);

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
          <small>{"\u7248\u672c"}</small>
          <span>{card.version}</span>
        </div>
        <div>
          <small>{"\u66f4\u65b0\u65e5\u671f"}</small>
          <span>{card.updatedAt}</span>
        </div>
        <div>
          <small>{"\u7d2f\u8ba1\u4e0b\u8f7d"}</small>
          <span>{card.cacheCount}</span>
        </div>
      </div>
      {card.action === "download" && card.href ? (
        <a className="hero-download-btn" href={card.href}>
          {card.button}
        </a>
      ) : card.action === "retry" ? (
        <button
          className="hero-download-btn"
          type="button"
          onClick={() => window.location.reload()}
        >
          {card.button}
        </button>
      ) : (
        <span className="hero-download-btn is-pending">{card.button}</span>
      )}
      <p className="hero-download-note">{card.note}</p>
    </div>
  );
}
