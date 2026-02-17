import type { ServiceMetrics } from "@evernet/shared";

export interface QueryableDb {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export function toManagementInterval(window: string): string {
  const allowed = new Set(["15m", "1h", "4h", "8h", "24h", "7d", "30d"]);
  if (!allowed.has(window)) {
    return "1 hour";
  }
  if (window.endsWith("m")) {
    return `${Number(window.slice(0, -1))} minutes`;
  }
  if (window.endsWith("h")) {
    return `${Number(window.slice(0, -1))} hours`;
  }
  return `${Number(window.slice(0, -1))} days`;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export interface DecisionOverview {
  aiEvents: number;
  criticalEvents: number;
  offlineCameras: number;
  notifySent: number;
  notifyFailed: number;
  notifySuccessRate: number;
}

export async function queryDecisionOverview(db: QueryableDb, siteId: string, interval: string): Promise<DecisionOverview> {
  const [ai, offline, notify] = await Promise.all([
    db.query(
      `select
         count(*)::int as ai_events,
         coalesce(sum(case when severity = 'critical' then 1 else 0 end), 0)::int as critical_events
       from ai_event
       where site_id = $1
         and ts_event >= now() - ($2)::interval`,
      [siteId, interval]
    ),
    db.query(
      `select count(*)::int as offline_cameras
       from camera
       where site_id = $1
         and status = 'offline'`,
      [siteId]
    ),
    db.query(
      `select
         coalesce(sum(case when status = 'sent' then 1 else 0 end), 0)::int as sent_count,
         coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::int as failed_count
       from notification_log
       where site_id = $1
         and created_at >= now() - ($2)::interval`,
      [siteId, interval]
    )
  ]);

  const aiEvents = toNumber(ai.rows[0]?.ai_events);
  const criticalEvents = toNumber(ai.rows[0]?.critical_events);
  const offlineCameras = toNumber(offline.rows[0]?.offline_cameras);
  const notifySent = toNumber(notify.rows[0]?.sent_count);
  const notifyFailed = toNumber(notify.rows[0]?.failed_count);
  const totalNotify = notifySent + notifyFailed;

  return {
    aiEvents,
    criticalEvents,
    offlineCameras,
    notifySent,
    notifyFailed,
    notifySuccessRate: totalNotify === 0 ? 1 : notifySent / totalNotify
  };
}

export async function queryChannelPerformance(db: QueryableDb, siteId: string, interval: string): Promise<Array<Record<string, unknown>>> {
  const result = await db.query(
    `select
       channel,
       coalesce(sum(case when status = 'sent' then 1 else 0 end), 0)::int as sent_count,
       coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::int as failed_count
     from notification_log
     where site_id = $1
       and created_at >= now() - ($2)::interval
     group by channel
     order by failed_count desc, sent_count desc
     limit 20`,
    [siteId, interval]
  );
  return result.rows;
}

export async function queryRiskRanking(db: QueryableDb, siteId: string, interval: string): Promise<Array<Record<string, unknown>>> {
  const result = await db.query(
    `select
       camera_id,
       count(*)::int as total_events,
       coalesce(sum(case when severity = 'critical' then 3 when severity = 'suspect' then 1 else 0 end), 0)::int as risk_score
     from ai_event
     where site_id = $1
       and ts_event >= now() - ($2)::interval
     group by camera_id
     order by risk_score desc, total_events desc
     limit 20`,
    [siteId, interval]
  );
  return result.rows;
}

export async function withManagementMetric<T>(
  metrics: ServiceMetrics,
  serviceName: string,
  siteId: string,
  reportType: string,
  fn: () => Promise<T>
): Promise<T> {
  metrics.managementReportRequestsTotal.labels(serviceName, siteId, reportType).inc();
  const start = Date.now();
  const result = await fn();
  if (Date.now() - start > 1200) {
    metrics.managementReportSlowQueryTotal.labels(serviceName, siteId, reportType).inc();
  }
  return result;
}
