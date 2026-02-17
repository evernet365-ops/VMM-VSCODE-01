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
  providerProbeTotal: Counter<string>;
  playbackFallbackTotal: Counter<string>;
  playbackScanDurationMs: Histogram<string>;
  playbackSlowQueryTotal: Counter<string>;
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

  const providerProbeTotal = new Counter({
    name: "vmm_provider_probe_total",
    help: "Total provider probe attempts by outcome",
    labelNames: ["service", "site_id", "provider", "outcome"],
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
    providerProbeTotal,
    playbackFallbackTotal,
    playbackScanDurationMs,
    playbackSlowQueryTotal,
    managementReportRequestsTotal,
    managementReportSlowQueryTotal,
    aiEventsTotal,
    notificationSentTotal,
    notificationFailedTotal,
    apiLatencyMs,
    dbConnections
  };
}
