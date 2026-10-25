import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, FileAudio, FileImage, FileText, FileVideo, Globe2, Plus, QrCode, Search, UserRound } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "@client/components/layout/app-shell";
import { QrSpecimen } from "@client/components/ui/qr-specimen";
import { api } from "@client/lib/api";
import type { CodeSummary } from "@client/lib/api";
import type { AccountAnalyticsSummary, ActiveContent, ActiveContentType } from "@tpqr/domain";
import { emptyContent } from "@client/features/content-editor/content-editor-model";
import "../dashboard.css";
import "../dashboard-overrides.css";

type CodeType = ActiveContentType;
type Filter = "全部" | "已发布" | "草稿" | "已暂停";
type Metric = "scans" | "views" | "clicks" | "downloads" | "plays";
type AnalyticsPoint = AccountAnalyticsSummary["trend"][number];

const metricOptions: Array<{ key: Metric; label: string }> = [
  { key: "scans", label: "扫码" },
  { key: "views", label: "查看" },
  { key: "clicks", label: "点击" },
  { key: "downloads", label: "下载" },
  { key: "plays", label: "播放" },
];

const contentTypeOptions: Array<{ type: CodeType; label: string; icon: typeof FileText }> = [
  { type: "image", label: "图片", icon: FileImage },
  { type: "video", label: "视频", icon: FileVideo },
  { type: "audio", label: "音频", icon: FileAudio },
  { type: "file", label: "文件", icon: FileText },
  { type: "url", label: "网址", icon: Globe2 },
  { type: "contact", label: "名片", icon: UserRound },
  { type: "text", label: "文字", icon: FileText },
];

const typeLabels = Object.fromEntries(contentTypeOptions.map(({ type, label }) => [type, label])) as Record<CodeType, string>;

function codeStatusLabel(code: CodeSummary): Filter {
  if (code.status === "paused") return "已暂停";
  return code.publishedVersionId ? "已发布" : "草稿";
}

function trendPoints(values: number[]): string {
  if (values.length < 2) return "0,210 560,210";
  const maximum = Math.max(...values, 1);
  return values.map((value, index) => `${(index / (values.length - 1)) * 560},${210 - (value / maximum) * 180}`).join(" ");
}

function initialContent(type: CodeType): ActiveContent {
  if (type === "url") return { type, url: `${window.location.origin}/`, title: "", description: "" };
  if (type === "contact") return { type, firstName: "", lastName: "", organization: "TP QR", title: "", phone: "", email: "", website: "", address: "", note: "" };
  if (type === "text") return { type, title: "", text: "在编辑器中完善这张活码的内容。" };
  // Keep the requested type in the code record; the editor replaces the placeholder asset after upload.
  return { ...emptyContent(type), title: `新的${typeLabels[type]}活码` };
}

export function DashboardView() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get("view") === "analytics" ? "analytics" : searchParams.get("view") === "codes" ? "codes" : searchParams.get("view") === "types" ? "types" : "overview";
  const [filter, setFilter] = useState<Filter>("全部");
  const [search, setSearch] = useState("");
  const [codes, setCodes] = useState<CodeSummary[]>([]);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [metric, setMetric] = useState<Metric>("scans");
  const [analytics, setAnalytics] = useState<AccountAnalyticsSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [createNotice, setCreateNotice] = useState("");
  const [newName, setNewName] = useState("新建活码");
  const [newType, setNewType] = useState<CodeType>("text");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void api.codes().then((result) => {
      if (!active) return;
      setCodes(result.items);
    }).catch(() => { if (active) void navigate("/login"); });
    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    let active = true;
    void api.dashboardAnalytics(days).then((result) => {
      if (active) setAnalytics(result);
    }).catch(() => {
      if (active) setAnalytics({ days, trend: [], byCode: [] });
    });
    return () => { active = false; };
  }, [days]);

  const metricTotals = useMemo(() => Object.fromEntries((analytics?.byCode ?? []).map((code) => [code.codeId, code[metric]])), [analytics, metric]);
  const trend = useMemo(() => (analytics?.trend ?? []).map((point: AnalyticsPoint) => point[metric]), [analytics, metric]);
  const hasTrendData = trend.some((value) => value > 0);

  const visibleCodes = useMemo(() => codes.filter((code) => {
    const status = codeStatusLabel(code);
    return (filter === "全部" || filter === status) && code.title.toLowerCase().includes(search.trim().toLowerCase());
  }), [codes, filter, search]);
  const hasSearchOrFilter = filter !== "全部" || search.trim().length > 0;

  async function createCode() {
    try {
      setCreateNotice("");
      const code = await api.createCode(newName.trim() || "新建活码", initialContent(newType));
      setCodes((current) => [code, ...current]);
      setCreating(false);
      const requestedType = newType === "text" || newType === "url" || newType === "contact" ? "" : `?type=${newType}`;
      await navigate(`/app/codes/${code.id}/qr${requestedType}`);
    } catch (error) {
      setCreateNotice(error instanceof Error ? error.message : "创建活码失败，请稍后重试");
    }
  }

  return <AppShell>
    <section className="dashboard-view">
      <div className="dashboard-view__heading">
        <h1>{view === "analytics" ? <>SCAN<br />DATA</> : view === "codes" ? <>MY<br />CODES</> : view === "types" ? <>CONTENT<br />TYPES</> : <>ACTIVE<br />CODES</>}</h1>
        <div className="dashboard-view__actions">
          <button type="button" onClick={() => setCreating(true)}><Plus />新建活码</button>
          <Link className="dashboard-decoder-link" to="/decoder"><QrCode />解码二维码</Link>
          <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索活码" aria-label="搜索活码" /></label>
          <div className="dashboard-filters" aria-label="活码状态筛选">
            {(["全部", "已发布", "草稿", "已暂停"] as Filter[]).map((item) => <button className={filter === item ? "is-active" : ""} key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}
          </div>
        </div>
      </div>

      {view === "types" ? <article className="dashboard-types paper-panel" aria-label="内容类型">
        <header><h2>选择内容类型</h2><span>创建后可在编辑器中继续上传和完善内容</span></header>
        <div className="dashboard-types__grid">
          {contentTypeOptions.map(({ type, label, icon: Icon }) => <button key={type} type="button" onClick={() => { setNewType(type); setCreating(true); }}>
            <Icon aria-hidden="true" />
            <strong>{label}</strong>
            <small>创建{label}活码</small>
          </button>)}
        </div>
      </article> : null}

      {view !== "codes" && view !== "types" ? <article className="dashboard-trend paper-panel">
        <header><h2>最近 {days} 天</h2><span>活码{metricOptions.find((item) => item.key === metric)?.label ?? "扫码"}次数</span></header>
        <div className="dashboard-trend__controls" role="group" aria-label="统计时间范围">
          {([7, 30, 90] as const).map((item) => <button key={item} type="button" aria-pressed={days === item} onClick={() => setDays(item)}>最近 {item} 天</button>)}
        </div>
        <div className="dashboard-trend__metrics" role="tablist" aria-label="统计指标">
          {metricOptions.map((item) => <button key={item.key} type="button" role="tab" aria-selected={metric === item.key} onClick={() => setMetric(item.key)}>{item.label}</button>)}
        </div>
        {hasTrendData ? <svg viewBox="0 0 560 230" role="img" aria-label={`最近 ${days} 天${metricOptions.find((item) => item.key === metric)?.label ?? "扫码"}趋势`}>{[0, 1, 2, 3].map((lineIndex) => <line key={lineIndex} x1="0" x2="560" y1={lineIndex * 65 + 15} y2={lineIndex * 65 + 15} />)}<polyline points={trendPoints(trend)} /></svg> : <p className="dashboard-trend__empty" role="status">{analytics ? "所选时间范围内暂无统计数据" : "正在加载统计数据…"}</p>}
      </article> : null}

      {view === "analytics" ? <article className="dashboard-analytics paper-panel" aria-label="扫码统计明细"><header><h2>按活码统计</h2><span>最近 {days} 天{metricOptions.find((item) => item.key === metric)?.label}次数</span></header>{visibleCodes.map((code) => <div className="dashboard-analytics__row" key={code.id}><span>{code.title}</span><strong>{metricTotals[code.id] ?? 0}</strong><small>次{metricOptions.find((item) => item.key === metric)?.label}</small></div>)}{visibleCodes.length === 0 || visibleCodes.every((code) => (metricTotals[code.id] ?? 0) === 0) ? <p className="dashboard-table__empty">暂无统计数据</p> : null}</article> : null}

      {view !== "types" ? <div className="dashboard-table paper-panel">
        <div className="dashboard-table__row dashboard-table__head"><span>活码</span><span>类型</span><span>状态</span><span>最近更新</span><span>{metricOptions.find((item) => item.key === metric)?.label ?? "扫码"}次数</span></div>
        {visibleCodes.map((code) => {
          const status = codeStatusLabel(code);
          return <Link className="dashboard-table__row" to={`/app/codes/${code.id}/qr`} key={code.id}><span><QrSpecimen data={`${window.location.origin}/s/${code.slug}`} size={72} />{code.title}</span><span data-label="类型">{typeLabels[code.contentType] ?? "活码"}</span><span data-label="状态"><i className={`project-status project-status--${status}`}>{status}</i></span><time data-label="最近更新">{new Date(code.updatedAt).toLocaleString("zh-CN")}</time><strong data-label={`${metricOptions.find((item) => item.key === metric)?.label ?? "扫码"}次数`}>{metricTotals[code.id] ?? 0}</strong></Link>;
        })}
        {visibleCodes.length === 0 ? <div className="dashboard-table__empty">
          {codes.length === 0 && !hasSearchOrFilter ? <>
            <QrCode aria-hidden="true" />
            <strong>还没有活码</strong>
            <p>创建第一张活码后，可在这里编辑内容、发布并查看访问情况。</p>
            <button type="button" onClick={() => setCreating(true)}>创建第一张活码</button>
          </> : <>
            <strong>暂无符合条件的活码</strong>
            <button type="button" onClick={() => { setFilter("全部"); setSearch(""); }}>清除搜索和筛选</button>
          </>}
        </div> : null}
      </div> : null}

      {view !== "types" ? <aside className="recent-submissions paper-panel"><h2>最近编辑</h2>{codes.slice(0, 5).map((code, index) => <Link to={`/app/codes/${code.id}/qr`} key={code.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{code.title}</strong><small>{new Date(code.updatedAt).toLocaleString("zh-CN")}</small><ArrowRight /></Link>)}{codes.length === 0 ? <p className="recent-submissions__empty">创建活码后，最近编辑的内容会显示在这里。</p> : null}</aside> : null}

      <Dialog.Root open={creating} onOpenChange={setCreating}>
        <Dialog.Portal>
          <Dialog.Overlay className="dashboard-create-overlay" />
          <Dialog.Content className="dashboard-create">
            <Dialog.Title className="dashboard-create__title">新建活码</Dialog.Title>
            <Dialog.Description className="dashboard-create__hint">图片、视频、音频和文件可在下一步上传，草稿不会写入虚假资源。</Dialog.Description>
            {createNotice ? <p className="dashboard-create__error" role="alert">{createNotice}</p> : null}
            <label>活码名称<input value={newName} onChange={(event) => setNewName(event.target.value)} autoFocus /></label>
            <label>内容类型<select value={newType} onChange={(event) => setNewType(event.target.value as CodeType)}>{contentTypeOptions.map(({ type, label }) => <option value={type} key={type}>{label}</option>)}</select></label>
            <div className="dashboard-create__actions">
              <Dialog.Close asChild><button type="button">取消</button></Dialog.Close>
              <button type="button" onClick={() => void createCode()}>创建并编辑</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  </AppShell>;
}
