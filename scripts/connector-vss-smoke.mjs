#!/usr/bin/env node

const HELP = `
connector-vss smoke checker

Optional env:
  SMOKE_CONNECTOR_URL (default: http://localhost:3013)
  SMOKE_TIMEOUT_MS (default: 5000)
`;

const REQUIRED_METRICS = [
  "vmm_camera_reconnects",
  "vmm_camera_fps",
  "vmm_camera_drop_frames",
  "vmm_camera_last_frame_ts_ms",
  "vmm_provider_probe_total"
];

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkHealth(baseUrl, timeoutMs) {
  const response = await fetchWithTimeout(`${baseUrl}/healthz`, { method: "GET" }, timeoutMs);
  if (!response.ok) {
    throw new Error(`healthz failed with status=${response.status}`);
  }

  const payload = await response.json();
  if (payload?.status !== "ok") {
    throw new Error(`healthz payload invalid: ${JSON.stringify(payload)}`);
  }
}

async function checkMetrics(baseUrl, timeoutMs) {
  const response = await fetchWithTimeout(`${baseUrl}/metrics`, { method: "GET" }, timeoutMs);
  if (!response.ok) {
    throw new Error(`metrics failed with status=${response.status}`);
  }

  const body = await response.text();
  const missing = REQUIRED_METRICS.filter((name) => !body.includes(name));
  if (missing.length > 0) {
    throw new Error(`metrics missing keys: ${missing.join(", ")}`);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(HELP.trim());
    process.exit(0);
  }

  const baseUrl = trimTrailingSlash(process.env.SMOKE_CONNECTOR_URL ?? "http://localhost:3013");
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "5000");

  await checkHealth(baseUrl, timeoutMs);
  console.log(`[connector-vss] healthz ok: ${baseUrl}/healthz`);

  await checkMetrics(baseUrl, timeoutMs);
  console.log(`[connector-vss] metrics ok: ${baseUrl}/metrics`);

  console.log("connector-vss smoke passed.");
}

main().catch((error) => {
  console.error(`connector-vss smoke failed: ${String(error)}`);
  process.exit(1);
});
