import { useEffect, useState } from "react";

interface DayStats {
  date: string;
  visitors: number;
  views: number;
}

interface StatsResponse {
  todayVisitors: number;
  todayViews: number;
  weekVisitors: number;
  weekViews: number;
  days: DayStats[];
}

const PRODUCTION_HOST = "www.unknnownnn.homes";
const LOCAL_API_ORIGIN = "http://localhost:3001";
const DAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function buildEmptyDays() {
  const now = new Date();
  const days: DayStats[] = [];

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    days.push({
      date: date.toISOString().slice(0, 10),
      visitors: 0,
      views: 0,
    });
  }

  return days;
}

function buildFallbackStats(): StatsResponse {
  return {
    todayVisitors: 0,
    todayViews: 0,
    weekVisitors: 0,
    weekViews: 0,
    days: buildEmptyDays(),
  };
}

function formatDay(dateStr: string) {
  return DAY_LABELS[new Date(dateStr).getDay()];
}

async function fetchStats(): Promise<StatsResponse | null> {
  const candidates = ["/api/stats"];
  if (
    typeof window !== "undefined" &&
    window.location.hostname &&
    window.location.hostname !== PRODUCTION_HOST
  ) {
    candidates.push(`${LOCAL_API_ORIGIN}/api/stats`);
  }

  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as Partial<StatsResponse>;
      if (Array.isArray(data.days) && data.days.length === 7) {
        return {
          todayVisitors: data.todayVisitors ?? 0,
          todayViews: data.todayViews ?? 0,
          weekVisitors: data.weekVisitors ?? 0,
          weekViews: data.weekViews ?? 0,
          days: data.days,
        };
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export default function VisitorStats() {
  const [data, setData] = useState<StatsResponse>(buildFallbackStats());
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchStats().then((nextData) => {
      if (cancelled) {
        return;
      }

      if (nextData) {
        setData(nextData);
        setError(false);
      } else {
        setError(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const maxViews = Math.max(...data.days.map((day) => day.views), 1);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="visitor-panel glass-panel">
      <div className="visitor-kpis">
        <div className="visitor-kpi">
          <span>今日访问</span>
          <strong>{data.todayViews.toLocaleString("zh-CN")}</strong>
          <small>独立访客 {data.todayVisitors.toLocaleString("zh-CN")}</small>
        </div>
        <div className="visitor-kpi">
          <span>本周访问</span>
          <strong>{data.weekViews.toLocaleString("zh-CN")}</strong>
          <small>独立访客 {data.weekVisitors.toLocaleString("zh-CN")}</small>
        </div>
      </div>

      <div className="chart-wrap">
        <div className="chart-strip" aria-label="最近 7 日访问量">
          {data.days.map((day, index) => {
            const isToday = day.date === today;
            return (
              <div key={day.date} className={"chart-col" + (isToday ? " today" : "")}>
                <span className="chart-val">{day.views || "0"}</span>
                <div
                  className="chart-bar"
                  style={
                    {
                      "--i": index,
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
      </div>

      {error ? <p className="chart-note">统计服务暂不可用，当前显示的是占位图表。</p> : null}
      <p className="visitor-note">主数字为浏览量，副标题显示独立访客数。</p>
    </section>
  );
}
