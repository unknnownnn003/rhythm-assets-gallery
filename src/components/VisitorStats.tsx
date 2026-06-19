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
const DAY_LABELS = [
  "\u5468\u65e5",
  "\u5468\u4e00",
  "\u5468\u4e8c",
  "\u5468\u4e09",
  "\u5468\u56db",
  "\u5468\u4e94",
  "\u5468\u516d",
];

function buildEmptyDays() {
  const now = new Date();
  const days: DayStats[] = [];

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - index);
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

function formatDay(dateString: string) {
  return DAY_LABELS[new Date(dateString).getDay()];
}

function buildStatCandidates() {
  const candidates = ["/api/stats?track=1"];

  if (
    typeof window !== "undefined" &&
    window.location.hostname &&
    window.location.hostname !== PRODUCTION_HOST
  ) {
    candidates.push(`${LOCAL_API_ORIGIN}/api/stats?track=1`);
  }

  return candidates;
}

async function fetchStats(): Promise<StatsResponse | null> {
  for (const url of buildStatCandidates()) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        keepalive: true,
      });
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
          <span>{"\u4eca\u65e5\u8bbf\u95ee"}</span>
          <strong>{data.todayViews.toLocaleString("zh-CN")}</strong>
          <small>{"\u72ec\u7acb\u8bbf\u5ba2 "}{data.todayVisitors.toLocaleString("zh-CN")}</small>
        </div>
        <div className="visitor-kpi">
          <span>{"\u672c\u5468\u8bbf\u95ee"}</span>
          <strong>{data.weekViews.toLocaleString("zh-CN")}</strong>
          <small>{"\u72ec\u7acb\u8bbf\u5ba2 "}{data.weekVisitors.toLocaleString("zh-CN")}</small>
        </div>
      </div>

      <div className="chart-wrap">
        <div className="chart-strip" aria-label="\u6700\u8fd1 7 \u65e5\u8bbf\u95ee\u91cf">
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

      {error ? <p className="chart-note">{"\u7edf\u8ba1\u670d\u52a1\u6682\u4e0d\u53ef\u7528\uff0c\u5f53\u524d\u663e\u793a\u7684\u662f\u5360\u4f4d\u56fe\u8868\u3002"}</p> : null}
    </section>
  );
}
