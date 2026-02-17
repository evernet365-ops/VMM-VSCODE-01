#!/usr/bin/env node

const HELP = `
VIVOTEK smoke checker

Required env:
  VIVOTEK_NVR_BASE_URL
  VIVOTEK_IPCAM_BASE_URL

Optional env:
  VIVOTEK_USERNAME
  VIVOTEK_PASSWORD
  VIVOTEK_CAMERA_ID
  SMOKE_CONNECTOR_URL (default: http://localhost:3013)
  SMOKE_TIMEOUT_MS (default: 5000)
  ALLOW_INSECURE_TLS (true/false, default: false)
`;

function boolFromEnv(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildAuthHeader(username, password) {
  if (!username || !password) {
    return {};
  }
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return { authorization: `Basic ${token}` };
}

function buildCameraBase(ipcamBaseUrl, cameraId) {
  if (!cameraId || ipcamBaseUrl.includes("/CamConfig/")) {
    return trimTrailingSlash(ipcamBaseUrl);
  }
  return `${trimTrailingSlash(ipcamBaseUrl)}/CamConfig/${encodeURIComponent(cameraId)}`;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function maskUrl(raw) {
  try {
    const value = new URL(raw);
    return `${value.protocol}//${value.host}${value.pathname}`;
  } catch {
    return raw;
  }
}

async function check(name, url, headers, timeoutMs) {
  const start = Date.now();
  try {
    const response = await fetchWithTimeout(url, { method: "GET", headers }, timeoutMs);
    const duration = Date.now() - start;
    const ok = response.ok;
    console.log(`[${name}] status=${response.status} ok=${ok} latencyMs=${duration} url=${maskUrl(url)}`);
    return { ok, status: response.status, latencyMs: duration };
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`[${name}] status=ERR ok=false latencyMs=${duration} url=${maskUrl(url)} error=${String(error)}`);
    return { ok: false, status: 0, latencyMs: duration };
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(HELP.trim());
    process.exit(0);
  }

  if (boolFromEnv(process.env.ALLOW_INSECURE_TLS, false)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const connectorUrl = process.env.SMOKE_CONNECTOR_URL ?? "http://localhost:3013";
  const nvrBaseUrl = process.env.VIVOTEK_NVR_BASE_URL;
  const ipcamBaseUrl = process.env.VIVOTEK_IPCAM_BASE_URL;
  const username = process.env.VIVOTEK_USERNAME;
  const password = process.env.VIVOTEK_PASSWORD;
  const cameraId = process.env.VIVOTEK_CAMERA_ID;
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "5000");

  if (!nvrBaseUrl || !ipcamBaseUrl) {
    console.error("Missing required env: VIVOTEK_NVR_BASE_URL and VIVOTEK_IPCAM_BASE_URL");
    console.error(HELP.trim());
    process.exit(1);
  }

  const headers = {
    accept: "*/*",
    ...buildAuthHeader(username, password)
  };

  const cameraBase = buildCameraBase(ipcamBaseUrl, cameraId);
  const checks = [
    ["connector-health", `${trimTrailingSlash(connectorUrl)}/healthz`],
    ["nvr-serverInfo", `${trimTrailingSlash(nvrBaseUrl)}/api/serverInfo`],
    ["nvr-deviceTree", `${trimTrailingSlash(nvrBaseUrl)}/api/deviceTree`],
    ["nvr-dataSourceList", `${trimTrailingSlash(nvrBaseUrl)}/api/dataSourceList`],
    ["ipcam-snapshot", `${cameraBase}/cgi-bin/viewer/video.jpg`]
  ];

  let failed = 0;
  for (const [name, url] of checks) {
    const result = await check(name, url, headers, timeoutMs);
    if (!result.ok) {
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`VIVOTEK smoke failed: ${failed}/${checks.length} checks failed.`);
    process.exit(1);
  }

  console.log(`VIVOTEK smoke passed: ${checks.length}/${checks.length}.`);
}

main().catch((error) => {
  console.error(`VIVOTEK smoke crashed: ${String(error)}`);
  process.exit(1);
});
