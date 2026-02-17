#!/usr/bin/env node

const HELP = `
SAMPO smoke checker

Required env:
  SAMPO_NVR_BASE_URL
  SAMPO_CAMERA_BASE_URL

Optional env:
  SAMPO_USERNAME
  SAMPO_PASSWORD
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

function looksLikePlaceholder(value) {
  return typeof value === "string" && value.includes("<") && value.includes(">");
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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
  const nvrBaseUrl = process.env.SAMPO_NVR_BASE_URL;
  const cameraBaseUrl = process.env.SAMPO_CAMERA_BASE_URL;
  const username = process.env.SAMPO_USERNAME;
  const password = process.env.SAMPO_PASSWORD;
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "5000");

  if (!nvrBaseUrl || !cameraBaseUrl) {
    console.error("Missing required env: SAMPO_NVR_BASE_URL and SAMPO_CAMERA_BASE_URL");
    console.error(HELP.trim());
    process.exit(1);
  }

  if (looksLikePlaceholder(nvrBaseUrl) || looksLikePlaceholder(cameraBaseUrl)) {
    console.error("SAMPO base URL still uses placeholder value. Replace <nvr-ip>/<camera-ip> with real host.");
    process.exit(1);
  }

  if (!isValidHttpUrl(nvrBaseUrl) || !isValidHttpUrl(cameraBaseUrl)) {
    console.error("Invalid SAMPO base URL. Use full URL such as https://10.0.0.10:443 or http://10.0.0.20:80");
    process.exit(1);
  }

  const headers = {
    accept: "*/*",
    ...buildAuthHeader(username, password)
  };

  const checks = [
    ["connector-health", `${trimTrailingSlash(connectorUrl)}/healthz`],
    ["nvr-magicBox", `${trimTrailingSlash(nvrBaseUrl)}/cgi-bin/magicBox.cgi?action=getSystemInfo`],
    ["nvr-eventIndexes", `${trimTrailingSlash(nvrBaseUrl)}/cgi-bin/eventManager.cgi?action=getEventIndexes`],
    ["nvr-serverInfo", `${trimTrailingSlash(nvrBaseUrl)}/api/serverInfo`],
    ["camera-magicBox", `${trimTrailingSlash(cameraBaseUrl)}/cgi-bin/magicBox.cgi?action=getSystemInfo`],
    ["camera-snapshot", `${trimTrailingSlash(cameraBaseUrl)}/cgi-bin/viewer/video.jpg`],
    ["camera-serverInfo", `${trimTrailingSlash(cameraBaseUrl)}/api/serverInfo`]
  ];

  let failed = 0;
  for (const [name, url] of checks) {
    const result = await check(name, url, headers, timeoutMs);
    if (!result.ok) {
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`SAMPO smoke failed: ${failed}/${checks.length} checks failed.`);
    process.exit(1);
  }

  console.log(`SAMPO smoke passed: ${checks.length}/${checks.length}.`);
}

main().catch((error) => {
  console.error(`SAMPO smoke crashed: ${String(error)}`);
  process.exit(1);
});
