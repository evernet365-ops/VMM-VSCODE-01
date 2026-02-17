import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics
} from "prom-client";

export interface ServiceMetrics {
  registry: Registry;
  cameraOnlineTotal: Counter<string>;
  cameraOfflineTotal: Counter<string>;
  nvrOnlineTotal: Counter<string>;
  cameraReconnects: Gauge<string>;
  cameraFps: Gauge<string>;
  cameraDropFrames: Gauge<string>;
  cameraLastFrameTs: Gauge<string>;
  cameraJitterMs: Gauge<string>;
  cameraStabilityScore: Gauge<string>;
  blackframeCaptureTotal: Counter<string>;
  blackframeCaptureFailTotal: Counter<string>;
  providerProbeTotal: Counter<string>;
  ntpSyncTotal: Counter<string>;
  ntpOffsetMs: Gauge<string>;
  ntpLastSyncTs: Gauge<string>;
  ntpServerRequestTotal: Counter<string>;
  playbackFallbackTotal: Counter<string>;
  playbackScanDurationMs: Histogram<string>;
  playbackSlowQueryTotal: Counter<string>;
  playbackSlowQueryAlertTotal: Counter<string>;
  playbackCacheHitsTotal: Counter<string>;
  playbackCacheMissTotal: Counter<string>;
  playbackCacheEvictTotal: Counter<string>;
  playbackCacheTtlExpiredTotal: Counter<string>;
  pollShardBucketTotal: Counter<string>;
  rolloutExposureTotal: Counter<string>;
  eventDedupTotal: Counter<string>;
  eventSuppressTotal: Counter<string>;
  internalAuthFailTotal: Counter<string>;
  internalRateLimitedTotal: Counter<string>;
  dashboardPageViewsTotal: Counter<string>;
  managementReportRequestsTotal: Counter<string>;
  managementReportSlowQueryTotal: Counter<string>;
  aiEventsTotal: Counter<string>;
  notificationSentTotal: Counter<string>;
  notificationFailedTotal: Counter<string>;
  apiLatencyMs: Histogram<string>;
  dbConnections: Gauge<string>;
}

export function createServiceMetrics(serviceName: string): ServiceMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const labels = ["service", "site_id"];

  const cameraOnlineTotal = new Counter({
    name: "vmm_camera_online_total",
    help: "Total online camera signals",
    labelNames: labels,
    registers: [registry]
  });

  const cameraOfflineTotal = new Counter({
    name: "vmm_camera_offline_total",
    help: "Total offline camera signals",
    labelNames: labels,
    registers: [registry]
  });

  const nvrOnlineTotal = new Counter({
    name: "vmm_nvr_online_total",
    help: "Total online NVR signals",
    labelNames: labels,
    registers: [registry]
  });

  const cameraReconnects = new Gauge({
    name: "vmm_camera_reconnects",
    help: "Recent reconnect count observed",
    labelNames: labels,
    registers: [registry]
  });

  const cameraFps = new Gauge({
    name: "vmm_camera_fps",
    help: "Observed frames per second",
    labelNames: labels,
    registers: [registry]
  });

  const cameraDropFrames = new Gauge({
    name: "vmm_camera_drop_frames",
    help: "Observed dropped frames in the latest window",
    labelNames: labels,
    registers: [registry]
  });

  const cameraLastFrameTs = new Gauge({
    name: "vmm_camera_last_frame_ts_ms",
    help: "Timestamp of last received frame in milliseconds",
    labelNames: labels,
    registers: [registry]
  });

  const cameraJitterMs = new Gauge({
    name: "vmm_camera_jitter_ms",
    help: "Jitter of frame arrivals in milliseconds (short window)",
    labelNames: labels,
    registers: [registry]
  });

  const cameraStabilityScore = new Gauge({
    name: "vmm_camera_stability_score",
    help: "Stability score over long window (0-1)",
    labelNames: labels,
    registers: [registry]
  });

  const blackframeCaptureTotal = new Counter({
    name: "vmm_blackframe_capture_total",
    help: "Total blackframe capture attempts",
    labelNames: ["service", "site_id", "camera_id", "outcome"],
    registers: [registry]
  });

  const blackframeCaptureFailTotal = new Counter({
    name: "vmm_blackframe_capture_fail_total",
    help: "Total blackframe capture failures",
    labelNames: ["service", "site_id", "camera_id", "reason"],
    registers: [registry]
  });

  const providerProbeTotal = new Counter({
    name: "vmm_provider_probe_total",
    help: "Total provider probe attempts by outcome",
    labelNames: ["service", "site_id", "provider", "outcome"],
    registers: [registry]
  });

  const ntpSyncTotal = new Counter({
    name: "vmm_ntp_sync_total",
    help: "Total NTP sync attempts by outcome",
    labelNames: ["service", "site_id", "outcome"],
    registers: [registry]
  });

  const ntpOffsetMs = new Gauge({
    name: "vmm_ntp_offset_ms",
    help: "Observed NTP offset from upstream in milliseconds",
    labelNames: labels,
    registers: [registry]
  });

  const ntpLastSyncTs = new Gauge({
    name: "vmm_ntp_last_sync_ts_ms",
    help: "Timestamp of last NTP sync attempt in milliseconds",
    labelNames: labels,
    registers: [registry]
  });

  const ntpServerRequestTotal = new Counter({
    name: "vmm_ntp_server_requests_total",
    help: "Total local NTP server requests",
    labelNames: ["service", "site_id", "outcome"],
    registers: [registry]
  });

  const playbackFallbackTotal = new Counter({
    name: "vmm_playback_fallback_total",
    help: "Total playback queries served via fallback scan",
    labelNames: labels,
    registers: [registry]
  });

  const playbackScanDurationMs = new Histogram({
    name: "vmm_playback_scan_duration_ms",
    help: "Duration of playback fallback scan in milliseconds",
    labelNames: labels,
    buckets: [50, 100, 250, 500, 1000, 2000, 5000, 10000],
    registers: [registry]
  });

  const playbackSlowQueryTotal = new Counter({
    name: "vmm_playback_slow_query_total",
    help: "Count of playback queries exceeding slow threshold",
    labelNames: labels,
    registers: [registry]
  });

  const playbackSlowQueryAlertTotal = new Counter({
    name: "vmm_playback_slow_query_alert_total",
    help: "Count of playback slow query alert threshold crossings",
    labelNames: labels,
    registers: [registry]
  });

  const playbackCacheHitsTotal = new Counter({
    name: "vmm_playback_cache_hits_total",
    help: "Count of playback cache hits",
    labelNames: labels,
    registers: [registry]
  });

  const playbackCacheMissTotal = new Counter({
    name: "vmm_playback_cache_miss_total",
    help: "Count of playback cache misses",
    labelNames: labels,
    registers: [registry]
  });

  const playbackCacheEvictTotal = new Counter({
    name: "vmm_playback_cache_evict_total",
    help: "Count of playback cache evictions",
    labelNames: labels,
    registers: [registry]
  });

  const playbackCacheTtlExpiredTotal = new Counter({
    name: "vmm_playback_cache_ttl_expired_total",
    help: "Count of playback cache ttl expirations",
    labelNames: labels,
    registers: [registry]
  });

  const pollShardBucketTotal = new Counter({
    name: "vmm_poll_shard_bucket_total",
    help: "Count of poll cycles by shard bucket and site",
    labelNames: ["service", "site_id", "bucket"],
    registers: [registry]
  });

  const rolloutExposureTotal = new Counter({
    name: "vmm_rollout_exposure_total",
    help: "Feature rollout exposure by outcome",
    labelNames: ["service", "feature", "scope", "outcome"],
    registers: [registry]
  });

  const eventDedupTotal = new Counter({
    name: "vmm_event_dedup_total",
    help: "Event dedup pass/suppress decisions",
    labelNames: ["service", "site_id", "outcome"],
    registers: [registry]
  });

  const eventSuppressTotal = new Counter({
    name: "vmm_event_suppress_total",
    help: "Suppressed event count by reason",
    labelNames: ["service", "site_id", "reason"],
    registers: [registry]
  });

  const internalAuthFailTotal = new Counter({
    name: "vmm_internal_auth_fail_total",
    help: "Internal API signature/auth failures",
    labelNames: ["service", "scope", "reason"],
    registers: [registry]
  });

  const internalRateLimitedTotal = new Counter({
    name: "vmm_internal_rate_limited_total",
    help: "Internal API requests blocked by rate limit",
    labelNames: ["service", "scope"],
    registers: [registry]
  });

  const dashboardPageViewsTotal = new Counter({
    name: "vmm_dashboard_page_views_total",
    help: "Dashboard page views by site and UI version",
    labelNames: ["service", "site_id", "ui_version"],
    registers: [registry]
  });

  const managementReportRequestsTotal = new Counter({
    name: "vmm_management_report_requests_total",
    help: "Total management report requests",
    labelNames: ["service", "site_id", "report_type"],
    registers: [registry]
  });

  const managementReportSlowQueryTotal = new Counter({
    name: "vmm_management_report_slow_query_total",
    help: "Count of slow management report queries",
    labelNames: ["service", "site_id", "report_type"],
    registers: [registry]
  });

  const aiEventsTotal = new Counter({
    name: "vmm_ai_events_total",
    help: "Total AI events",
    labelNames: labels,
    registers: [registry]
  });

  const notificationSentTotal = new Counter({
    name: "vmm_notification_sent_total",
    help: "Total successful notifications",
    labelNames: labels,
    registers: [registry]
  });

  const notificationFailedTotal = new Counter({
    name: "vmm_notification_failed_total",
    help: "Total failed notifications",
    labelNames: labels,
    registers: [registry]
  });

  const apiLatencyMs = new Histogram({
    name: "vmm_api_latency_ms",
    help: "API latency in milliseconds",
    labelNames: ["service", "route", "method", "status"],
    buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000],
    registers: [registry]
  });

  const dbConnections = new Gauge({
    name: "vmm_db_connections",
    help: "Current DB connections in pool",
    labelNames: ["service"],
    registers: [registry]
  });

  dbConnections.labels(serviceName).set(0);

  return {
    registry,
    cameraOnlineTotal,
    cameraOfflineTotal,
    nvrOnlineTotal,
    cameraReconnects,
    cameraFps,
    cameraDropFrames,
    cameraLastFrameTs,
    cameraJitterMs,
    cameraStabilityScore,
    blackframeCaptureTotal,
    blackframeCaptureFailTotal,
    providerProbeTotal,
    ntpSyncTotal,
    ntpOffsetMs,
    ntpLastSyncTs,
    ntpServerRequestTotal,
    playbackFallbackTotal,
    playbackScanDurationMs,
    playbackSlowQueryTotal,
    playbackSlowQueryAlertTotal,
    playbackCacheHitsTotal,
    playbackCacheMissTotal,
    playbackCacheEvictTotal,
    playbackCacheTtlExpiredTotal,
    pollShardBucketTotal,
    rolloutExposureTotal,
    eventDedupTotal,
    eventSuppressTotal,
    internalAuthFailTotal,
    internalRateLimitedTotal,
    dashboardPageViewsTotal,
    managementReportRequestsTotal,
    managementReportSlowQueryTotal,
    aiEventsTotal,
    notificationSentTotal,
    notificationFailedTotal,
    apiLatencyMs,
    dbConnections
  };
}
