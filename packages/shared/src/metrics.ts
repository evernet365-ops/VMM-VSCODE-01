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
    aiEventsTotal,
    notificationSentTotal,
    notificationFailedTotal,
    apiLatencyMs,
    dbConnections
  };
}
