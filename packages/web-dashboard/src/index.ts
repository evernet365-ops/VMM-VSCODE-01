import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  closeDbPool,
  createLogger,
  createServiceMetrics,
  getDbPool,
  loadServiceRuntimeConfig
} from "@evernet/shared";

const runtime = loadServiceRuntimeConfig("web-dashboard", Number(process.env.WEB_DASHBOARD_PORT ?? 3016));
const logger = createLogger(runtime.serviceName);
const metrics = createServiceMetrics(runtime.serviceName);
const db = getDbPool();
const app = Fastify({ logger: false });
const assetRoot = path.resolve(process.cwd(), "assets");

function getAssetPath(relativeAssetPath: string): string | null {
  const normalized = path.posix.normalize(relativeAssetPath.replaceAll("\\", "/"));
  if (normalized.startsWith("../") || normalized.includes("/../") || normalized === "..") {
    return null;
  }
  return path.join(assetRoot, normalized);
}

function getAssetContentType(assetPath: string): string {
  const ext = path.extname(assetPath).toLowerCase();
  switch (ext) {
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

interface SiteRecord {
  id: string;
  name: string;
}

interface DashboardSummary {
  offlineCameras: number;
  aiEvents1h: number;
  notificationSent1h: number;
  notificationFailed1h: number;
  notificationSuccessRate1h: number;
}

interface IncidentRecord {
  ts_event: string;
  camera_id: string;
  event_type: string;
  severity: "normal" | "suspect" | "critical";
  score: string | number;
}

interface OfflineRankRecord {
  camera_id: string;
  offline_count: string | number;
}

interface ChannelQualityRecord {
  channel: string;
  sent_count: string | number;
  failed_count: string | number;
}

interface PollStateRecord {
  severity: "normal" | "suspect" | "critical";
  next_poll_at: string;
  consecutive_failures: number;
  load_shed_mode: boolean;
}

interface BreakerRecord {
  state: "closed" | "open" | "half_open";
  failure_count: number;
  last_latency_ms: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return date.toISOString().replace("T", " ").slice(0, 19);
}

async function loadSites(): Promise<SiteRecord[]> {
  const result = await db.query(
    `select id, name
     from site
     where enabled = true
     order by id asc`
  );
  return result.rows as SiteRecord[];
}

async function loadSummary(siteId: string): Promise<DashboardSummary> {
  const [offlineCameras, aiEvents, notifyRate] = await Promise.all([
    db.query(
      `select count(*)::int as offline_cameras
       from camera
       where site_id = $1
         and status = 'offline'`,
      [siteId]
    ),
    db.query(
      `select count(*)::int as ai_events_1h
       from ai_event
       where site_id = $1
         and ts_event >= now() - interval '1 hour'`,
      [siteId]
    ),
    db.query(
      `select
         coalesce(sum(case when status = 'sent' then 1 else 0 end), 0)::int as sent,
         coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::int as failed
       from notification_log
       where site_id = $1
         and created_at >= now() - interval '1 hour'`,
      [siteId]
    )
  ]);

  const sent = notifyRate.rows[0]?.sent ?? 0;
  const failed = notifyRate.rows[0]?.failed ?? 0;
  const total = sent + failed;

  return {
    offlineCameras: offlineCameras.rows[0]?.offline_cameras ?? 0,
    aiEvents1h: aiEvents.rows[0]?.ai_events_1h ?? 0,
    notificationSent1h: sent,
    notificationFailed1h: failed,
    notificationSuccessRate1h: total === 0 ? 1 : sent / total
  };
}

async function loadIncidents(siteId: string): Promise<IncidentRecord[]> {
  const result = await db.query(
    `select ts_event, camera_id, event_type, severity, score
     from ai_event
     where site_id = $1
     order by ts_event desc
     limit 8`,
    [siteId]
  );
  return result.rows as IncidentRecord[];
}

async function loadTopOffline(siteId: string): Promise<OfflineRankRecord[]> {
  const result = await db.query(
    `select camera_id, count(*) as offline_count
     from ai_event
     where site_id = $1
       and event_type = 'offline'
       and ts_event >= now() - interval '24 hours'
     group by camera_id
     order by offline_count desc
     limit 6`,
    [siteId]
  );
  return result.rows as OfflineRankRecord[];
}

async function loadChannelQuality(siteId: string): Promise<ChannelQualityRecord[]> {
  const result = await db.query(
    `select
       channel,
       sum(case when status = 'sent' then 1 else 0 end)::int as sent_count,
       sum(case when status = 'failed' then 1 else 0 end)::int as failed_count
     from notification_log
     where site_id = $1
       and created_at >= now() - interval '1 hour'
     group by channel
     order by channel asc`,
    [siteId]
  );
  return result.rows as ChannelQualityRecord[];
}

async function loadPollState(siteId: string): Promise<PollStateRecord | null> {
  const result = await db.query(
    `select severity, next_poll_at, consecutive_failures, load_shed_mode
     from poll_state
     where site_id = $1
       and component = 'connector-vss'
     limit 1`,
    [siteId]
  );
  return (result.rows[0] as PollStateRecord | undefined) ?? null;
}

async function loadBreaker(siteId: string): Promise<BreakerRecord | null> {
  const result = await db.query(
    `select state, failure_count, last_latency_ms
     from circuit_breaker_state
     where site_id = $1
       and target_service = 'vss-provider'
     limit 1`,
    [siteId]
  );
  return (result.rows[0] as BreakerRecord | undefined) ?? null;
}

function renderDashboardPage(args: {
  siteId: string;
  sites: SiteRecord[];
  summary: DashboardSummary;
  incidents: IncidentRecord[];
  topOffline: OfflineRankRecord[];
  channelQuality: ChannelQualityRecord[];
  pollState: PollStateRecord | null;
  breaker: BreakerRecord | null;
}): string {
  const siteTabs = args.sites
    .map((site) => {
      const activeClass = site.id === args.siteId ? "site-tab active" : "site-tab";
      return `<a class="${activeClass}" href="/app?site=${encodeURIComponent(site.id)}">${escapeHtml(site.name)} (${escapeHtml(site.id)})</a>`;
    })
    .join("");

  const incidentRows = args.incidents.length > 0
    ? args.incidents.map((incident) => {
        return `<tr>
          <td>${formatTimestamp(incident.ts_event)}</td>
          <td>${escapeHtml(incident.camera_id)}</td>
          <td>${escapeHtml(incident.event_type)}</td>
          <td><span class="pill ${escapeHtml(incident.severity)}">${escapeHtml(incident.severity)}</span></td>
          <td>${Number(incident.score).toFixed(3)}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="5" class="empty">No incident data in current site.</td></tr>`;

  const topOfflineRows = args.topOffline.length > 0
    ? args.topOffline.map((row, index) => {
        return `<li><span class="rank">#${index + 1}</span><span>${escapeHtml(row.camera_id)}</span><strong>${Number(row.offline_count)}</strong></li>`;
      }).join("")
    : `<li class="empty">No offline camera ranking in last 24h.</li>`;

  const channelRows = args.channelQuality.length > 0
    ? args.channelQuality.map((row) => {
        const sent = Number(row.sent_count);
        const failed = Number(row.failed_count);
        const total = sent + failed;
        const ratio = total === 0 ? 0 : Math.round((sent / total) * 100);
        return `<div class="channel-row">
          <div class="channel-meta">
            <span>${escapeHtml(row.channel)}</span>
            <small>${sent} sent / ${failed} failed</small>
          </div>
          <div class="meter"><span style="width:${ratio}%;"></span></div>
        </div>`;
      }).join("")
    : `<p class="empty">No notification traffic in last hour.</p>`;

  const pollSeverity = args.pollState?.severity ?? "normal";
  const breakerState = args.breaker?.state ?? "closed";
  const nextPoll = args.pollState?.next_poll_at ? formatTimestamp(args.pollState.next_poll_at) : "n/a";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EverNet VMM Control Center</title>
  <link rel="stylesheet" href="/assets/tokens/design-tokens.css" />
  <style>
    :root {
      --bg: var(--vmm-color-bg, #f3f6f8);
      --ink: var(--vmm-color-ink, #1d2730);
      --muted: var(--vmm-color-muted, #6d7b88);
      --panel: var(--vmm-color-surface, #ffffff);
      --line: var(--vmm-color-line, #dce4ea);
      --accent: var(--vmm-color-accent, #006f8d);
      --accent-soft: var(--vmm-color-accent-soft, #d7eff4);
      --warn: var(--vmm-color-warning, #d38600);
      --danger: var(--vmm-color-danger, #c2392d);
      --good: var(--vmm-color-success, #1a8f56);
      --shadow: var(--vmm-shadow-2, 0 16px 40px rgba(16, 33, 44, 0.08));
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "IBM Plex Sans", "Segoe UI", "Helvetica Neue", sans-serif;
      color: var(--ink);
      background:
        url('/assets/ui/pattern-grid.svg') repeat,
        radial-gradient(1600px 600px at -25% -20%, #d8efff 0%, transparent 50%),
        radial-gradient(1200px 500px at 120% -10%, #e8f7ef 0%, transparent 45%),
        var(--bg);
      min-height: 100vh;
    }

    .shell {
      display: grid;
      grid-template-columns: 248px 1fr;
      min-height: 100vh;
    }

    .nav {
      border-right: 1px solid var(--line);
      padding: 24px 16px;
      background: rgba(255,255,255,0.8);
      backdrop-filter: blur(8px);
    }

    .brand {
      margin: 0 0 20px;
    }

    .brand-logo {
      width: 180px;
      max-width: 100%;
      height: auto;
      display: block;
    }

    .brand small {
      display: block;
      color: var(--muted);
      font-weight: 500;
      margin-top: 6px;
    }

    .nav-group { margin: 18px 0; }
    .nav-title {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .nav a {
      display: block;
      text-decoration: none;
      color: var(--ink);
      padding: 9px 10px;
      border-radius: 10px;
      margin-bottom: 6px;
      font-weight: 500;
    }
    .nav a:hover { background: #ecf2f5; }
    .nav a.active { background: var(--accent-soft); color: var(--accent); }

    .main {
      padding: 22px 24px 28px;
      animation: rise .4s ease;
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      margin-bottom: 16px;
    }
    .title {
      margin: 0;
      font-size: 1.35rem;
      letter-spacing: 0.01em;
    }
    .subtitle {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: .92rem;
    }

    .site-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .site-tab {
      text-decoration: none;
      color: var(--ink);
      background: #edf2f6;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 7px 12px;
      font-size: .84rem;
    }
    .site-tab.active {
      background: #0d5d74;
      color: #fff;
      border-color: #0d5d74;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: var(--shadow);
      padding: 14px;
    }
    .card h3 {
      margin: 0;
      font-size: .76rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--muted);
    }
    .card strong {
      display: block;
      margin-top: 10px;
      font-size: 1.6rem;
      line-height: 1.1;
    }
    .card small {
      color: var(--muted);
      display: block;
      margin-top: 8px;
    }

    .workflow {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 14px;
      box-shadow: var(--shadow);
    }
    .workflow h2 {
      margin: 0 0 12px;
      font-size: 1rem;
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .step {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 11px;
      background: #fbfdfe;
    }
    .step strong {
      font-size: .82rem;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .step p {
      margin: 6px 0 0;
      font-size: .93rem;
    }

    .grid {
      display: grid;
      grid-template-columns: 1.45fr .9fr;
      gap: 12px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      box-shadow: var(--shadow);
    }
    .panel h2 {
      margin: 0 0 10px;
      font-size: 1rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: .9rem;
    }
    th, td {
      padding: 9px 6px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: middle;
    }
    th {
      color: var(--muted);
      font-size: .78rem;
      text-transform: uppercase;
      letter-spacing: .06em;
    }
    tr:last-child td { border-bottom: 0; }

    .pill {
      border-radius: 999px;
      padding: 3px 9px;
      font-size: .72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .pill.normal { background: #e5f7ed; color: var(--good); }
    .pill.suspect { background: #fff0d6; color: var(--warn); }
    .pill.critical { background: #fde4e2; color: var(--danger); }

    .rank-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .rank-list li {
      display: grid;
      grid-template-columns: 52px 1fr auto;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 10px;
      background: #fcfdff;
    }
    .rank {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      font-size: .74rem;
      background: #eaf0f4;
      padding: 4px 7px;
      width: fit-content;
    }

    .channel-row {
      margin-bottom: 10px;
    }
    .channel-meta {
      display: flex;
      justify-content: space-between;
      font-size: .86rem;
      margin-bottom: 5px;
    }
    .channel-meta small { color: var(--muted); }
    .meter {
      border: 1px solid var(--line);
      border-radius: 999px;
      height: 10px;
      background: #eef3f7;
      overflow: hidden;
    }
    .meter span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #1c9c68, #16b27b);
    }

    .empty { color: var(--muted); }

    .meta-row {
      display: flex;
      gap: 10px;
      margin-top: 12px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: .84rem;
    }
    .tag {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 8px;
      background: #f7fafc;
    }

    @media (max-width: 1180px) {
      .cards { grid-template-columns: repeat(2, minmax(0,1fr)); }
      .steps { grid-template-columns: repeat(2, minmax(0,1fr)); }
      .grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 840px) {
      .shell { grid-template-columns: 1fr; }
      .nav { border-right: 0; border-bottom: 1px solid var(--line); }
      .topbar { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="nav">
      <p class="brand">
        <img class="brand-logo" src="/assets/brand/logo-lockup.svg" alt="EverNet VMM" />
        <small>Control Center</small>
      </p>
      <div class="nav-group">
        <div class="nav-title">Operations</div>
        <a class="active" href="/app?site=${encodeURIComponent(args.siteId)}">Live Overview</a>
        <a href="/api/v1/sites/${encodeURIComponent(args.siteId)}/dashboard/summary">Summary API</a>
        <a href="/api/v1/sites/${encodeURIComponent(args.siteId)}/reports/anomalies?window=1h">Anomaly Report API</a>
      </div>
      <div class="nav-group">
        <div class="nav-title">Links</div>
        <a href="/metrics">Metrics</a>
        <a href="/healthz">Health</a>
        <a href="/api">API Index</a>
      </div>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1 class="title">Site Operations Dashboard</h1>
          <p class="subtitle">Enterprise monitoring flow: Detect -> Analyze -> Notify -> Recover</p>
        </div>
      </div>
      <div class="site-tabs">${siteTabs}</div>

      <section class="cards">
        <article class="card">
          <h3>Offline Cameras</h3>
          <strong>${args.summary.offlineCameras}</strong>
          <small>Current disconnected endpoints</small>
        </article>
        <article class="card">
          <h3>AI Events 1H</h3>
          <strong>${args.summary.aiEvents1h}</strong>
          <small>Recent AI detections in 60 minutes</small>
        </article>
        <article class="card">
          <h3>Notify Success</h3>
          <strong>${formatPercent(args.summary.notificationSuccessRate1h)}</strong>
          <small>${args.summary.notificationSent1h} sent / ${args.summary.notificationFailed1h} failed</small>
        </article>
        <article class="card">
          <h3>Circuit Breaker</h3>
          <strong>${escapeHtml(breakerState)}</strong>
          <small>Failure count: ${args.breaker?.failure_count ?? 0}</small>
        </article>
      </section>

      <section class="workflow">
        <h2>Operational Workflow</h2>
        <div class="steps">
          <div class="step">
            <strong>Detect</strong>
            <p>Polling severity: <span class="pill ${escapeHtml(pollSeverity)}">${escapeHtml(pollSeverity)}</span></p>
          </div>
          <div class="step">
            <strong>Analyze</strong>
            <p>AI worker mode: <b>${runtime.enableAI ? "enabled" : "disabled"}</b></p>
          </div>
          <div class="step">
            <strong>Notify</strong>
            <p>Success rate (1h): <b>${formatPercent(args.summary.notificationSuccessRate1h)}</b></p>
          </div>
          <div class="step">
            <strong>Recover</strong>
            <p>Next poll: <b>${escapeHtml(nextPoll)}</b></p>
          </div>
        </div>
        <div class="meta-row">
          <span class="tag">Consecutive failures: ${args.pollState?.consecutive_failures ?? 0}</span>
          <span class="tag">Load shed: ${args.pollState?.load_shed_mode ? "on" : "off"}</span>
          <span class="tag">Latency ms: ${args.breaker?.last_latency_ms ?? 0}</span>
        </div>
      </section>

      <section class="grid">
        <article class="panel">
          <h2>Recent Incidents (Site-Scoped)</h2>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Camera</th>
                <th>Event</th>
                <th>Severity</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>${incidentRows}</tbody>
          </table>
        </article>

        <article class="panel">
          <h2>Top Offline Cameras (24h)</h2>
          <ul class="rank-list">${topOfflineRows}</ul>
        </article>

        <article class="panel">
          <h2>Notification Channel Quality (1h)</h2>
          ${channelRows}
        </article>
      </section>
    </main>
  </div>
</body>
</html>`;
}

app.addHook("onRequest", async (request) => {
  (request as { startedAt?: number }).startedAt = Date.now();
});

app.addHook("onResponse", async (request, reply) => {
  const start = (request as { startedAt?: number }).startedAt ?? Date.now();
  metrics.apiLatencyMs.labels(runtime.serviceName, request.url, request.method, String(reply.statusCode)).observe(Date.now() - start);
  metrics.dbConnections.labels(runtime.serviceName).set((db as unknown as { totalCount?: number }).totalCount ?? 0);
});

app.get("/healthz", async () => {
  await db.query("select 1");
  return { status: "ok", service: runtime.serviceName };
});

app.get("/metrics", async (_, reply) => {
  reply.header("content-type", metrics.registry.contentType);
  return metrics.registry.metrics();
});

app.get("/assets/*", async (request, reply) => {
  const params = request.params as { "*": string };
  const relativeAssetPath = params["*"] ?? "";
  const absoluteAssetPath = getAssetPath(relativeAssetPath);

  if (!absoluteAssetPath) {
    reply.status(400);
    return { error: "invalid asset path" };
  }

  try {
    const file = await readFile(absoluteAssetPath);
    reply.type(getAssetContentType(absoluteAssetPath));
    return file;
  } catch {
    reply.status(404);
    return { error: "asset not found" };
  }
});

app.get("/api/v1/sites/:siteId/dashboard/summary", async (request) => {
  const params = request.params as { siteId: string };
  const summary = await loadSummary(params.siteId);

  return {
    siteId: params.siteId,
    summary
  };
});

app.get("/api", async () => {
  return {
    service: runtime.serviceName,
    description: "EverNet VMM dashboard API and UI",
    docs: [
      "/app",
      "/api/v1/sites/:siteId/dashboard/summary",
      "/metrics",
      "/healthz"
    ]
  };
});

app.get("/app", async (request, reply) => {
  const query = request.query as { site?: string };
  const sites = await loadSites();
  const fallbackSiteId = sites[0]?.id ?? "site-a";
  const siteId = sites.some((site) => site.id === query.site) ? String(query.site) : fallbackSiteId;

  const [summary, incidents, topOffline, channelQuality, pollState, breaker] = await Promise.all([
    loadSummary(siteId),
    loadIncidents(siteId),
    loadTopOffline(siteId),
    loadChannelQuality(siteId),
    loadPollState(siteId),
    loadBreaker(siteId)
  ]);

  reply.type("text/html; charset=utf-8");
  return renderDashboardPage({
    siteId,
    sites,
    summary,
    incidents,
    topOffline,
    channelQuality,
    pollState,
    breaker
  });
});

app.get("/", async (_request, reply) => {
  reply.redirect("/app");
});

async function start(): Promise<void> {
  await app.listen({ host: "0.0.0.0", port: runtime.port });
  logger.info("service started", { port: runtime.port });
}

async function shutdown(signal: string): Promise<void> {
  logger.warn("shutdown signal", { signal });
  await app.close();
  await closeDbPool();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

start().catch(async (error) => {
  logger.error("service start failed", { error: String(error) });
  await closeDbPool();
  process.exit(1);
});
