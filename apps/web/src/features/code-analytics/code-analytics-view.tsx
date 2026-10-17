import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { ProjectShell } from "@client/components/layout/project-shell";
import { api } from "@client/lib/api";
import "./code-analytics.css";

type Point = { date: string; scans: number; views: number; clicks: number; downloads: number; plays: number };
type Metric = Exclude<keyof Point, "date">;

const metricOptions: Array<{ key: Metric; label: string }> = [
  { key: "scans", label: "扫码" },
  { key: "views", label: "查看" },
  { key: "clicks", label: "点击" },
  { key: "downloads", label: "下载" },
  { key: "plays", label: "播放" },
];

export function CodeAnalyticsView() {
  const { projectId = "" } = useParams();
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [metric, setMetric] = useState<Metric>("scans");
  const [error, setError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");

  useEffect(() => {
    let active = true;
    void api.code(projectId).then((code) => {
      if (!active) return;
      setTitle(code.title);
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : "统计数据暂时无法读取"));
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void api.codeAnalytics(projectId, days).then((analytics) => {
      if (active) {
        setPoints(analytics.items);
        setAnalyticsError("");
      }
    }).catch((cause) => active && setAnalyticsError(cause instanceof Error ? cause.message : "统计数据暂时无法读取"));
    return () => { active = false; };
  }, [days, projectId]);

  const totals = useMemo(() => points.reduce((sum, point) => ({ scans: sum.scans + point.scans, views: sum.views + point.views, clicks: sum.clicks + point.clicks, downloads: sum.downloads + point.downloads, plays: sum.plays + point.plays }), { scans: 0, views: 0, clicks: 0, downloads: 0, plays: 0 }), [points]);
  const activeMetric = metricOptions.find((item) => item.key === metric) ?? metricOptions[0];
  const maximum = Math.max(1, ...points.map((point) => point[metric]));

  if (error || analyticsError) return <ProjectShell><main className="code-analytics paper-panel"><p className="public-error" role="alert">{error || analyticsError}</p></main></ProjectShell>;
  if (!title) return <ProjectShell><main className="route-loading" role="status"><Loader2 className="spin" />正在读取统计…</main></ProjectShell>;
  return <ProjectShell><main className="code-analytics paper-panel">
    <header className="code-analytics__header"><div><span className="index-label">TP QR / ANALYTICS</span><h1>{title}</h1><p>只统计已发布版本的匿名访问事件。</p></div><BarChart3 size={34} aria-hidden="true" /></header>
    <div className="code-analytics__ranges" role="group" aria-label="统计时间范围">{([7, 30, 90] as const).map((item) => <button key={item} type="button" aria-pressed={days === item} onClick={() => setDays(item)}>最近 {item} 天</button>)}</div>
    <div className="code-analytics__cards" role="tablist" aria-label="统计指标">{metricOptions.map(({ key, label }) => <button type="button" role="tab" aria-selected={metric === key} key={key} onClick={() => setMetric(key)}><span>{label}</span><strong>{totals[key]}</strong></button>)}</div>
    <section className="code-analytics__chart" aria-label="扫码趋势"><h2>最近 {days} 天{activeMetric.label}趋势</h2>{points.length && points.some((point) => point[metric] > 0) ? <div className="code-analytics__bars">{points.map((point) => <div className="code-analytics__bar" key={point.date} title={`${point.date}: ${point[metric]} 次${activeMetric.label}`}><i style={{ height: `${Math.max(3, (point[metric] / maximum) * 100)}%` }} /><small>{point.date.slice(5)}</small></div>)}</div> : <p>还没有统计数据，发布二维码后这里会自动更新。</p>}</section>
  </main></ProjectShell>;
}
