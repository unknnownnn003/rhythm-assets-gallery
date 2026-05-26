import { useEffect, useState } from "react";

interface DayStats {
  date: string;
  visitors: number;
  views: number;
}

interface StatsResponse {
  days: DayStats[];
}

const DAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function buildEmptyDays() {
  const now = new Date();
  const days: DayStats[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toISOString().slice(0, 10),
      visitors: 0,
      views: 0,
    });
  }

  return days;
}

function buildFallbackStats(): StatsResponse {
  return { days: buildEmptyDays() };
}

function formatDay(dateStr: string) {
  return DAY_LABELS[new Date(dateStr).getDay()];
}

async function fetchStats(): Promise<StatsResponse | null> {
  const candidates = ["/api/stats"];
  if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    candidates.push("http://127.0.0.1:3001/api/stats");
  }

  try {
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const data = (await res.json()) as Partial<StatsResponse>;
        if (Array.isArray(data.days) && data.days.length === 7) {
          return { days: data.days };
        }
      } catch {
        // Try the next endpoint.
      }
    }
  } catch {
    // Fall back to placeholder data below.
  }

  return null;
}

export default function VisitorStats() {
  const [data, setData] = useState<StatsResponse>(buildFallbackStats());
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStats().then((d) => {
      if (cancelled) return;
      if (d) {
        setData(d);
        setError(false);
      } else {
        setError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const maxViews = Math.max(...data.days.map((d) => d.views), 1);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="chart-wrap">
      <div className="chart-strip" aria-label="7日访问量">
        {data.days.map((day, i) => {
          const isToday = day.date === today;
          return (
            <div key={day.date} className={"chart-col" + (isToday ? " today" : "")}>
              <span className="chart-val">{day.views || "·"}</span>
              <div
                className="chart-bar"
                style={
                  {
                    "--i": i,
                    "--h": day.views / maxViews,
                    minHeight: day.views > 0 ? "4px" : "0",
                  } as React.CSSProperties
                }
              />
              <span className="chart-day">{formatDay(day.date)}</span>
            </div>
          );
        })}
      </div>
      {error ? <p className="chart-note">统计服务暂不可用，正在显示近 7 日占位图。</p> : null}
    </div>
  );
}
