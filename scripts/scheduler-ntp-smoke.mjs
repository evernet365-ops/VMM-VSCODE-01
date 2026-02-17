#!/usr/bin/env node

const HELP = `
scheduler ntp smoke checker

Optional env:
  SMOKE_SCHEDULER_URL (default: http://localhost:3015)
  SMOKE_TIMEOUT_MS (default: 5000)
  SMOKE_NTP_MANUAL_TIME_ISO (default: 2026-01-01T00:00:00.000Z)
`;

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

async function assertHealth(baseUrl, timeoutMs) {
  const response = await fetchWithTimeout(`${baseUrl}/healthz`, { method: "GET" }, timeoutMs);
  if (!response.ok) {
    throw new Error(`scheduler healthz failed with status=${response.status}`);
  }
}

async function assertStatus(baseUrl, timeoutMs) {
  const response = await fetchWithTimeout(`${baseUrl}/api/v1/time-sync/status`, { method: "GET" }, timeoutMs);
  if (!response.ok) {
    throw new Error(`time-sync status failed with status=${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.ntp || typeof payload.ntp !== "object") {
    throw new Error("time-sync status payload missing ntp object");
  }
}

async function setManual(baseUrl, isoTime, timeoutMs) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/v1/time-sync/manual`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isoTime })
    },
    timeoutMs
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`set manual time failed status=${response.status} body=${body}`);
  }
}

async function clearManual(baseUrl, timeoutMs) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/v1/time-sync/manual`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isoTime: null })
    },
    timeoutMs
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`clear manual time failed status=${response.status} body=${body}`);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(HELP.trim());
    process.exit(0);
  }

  const baseUrl = trimTrailingSlash(process.env.SMOKE_SCHEDULER_URL ?? "http://localhost:3015");
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "5000");
  const manualTimeIso = process.env.SMOKE_NTP_MANUAL_TIME_ISO ?? "2026-01-01T00:00:00.000Z";

  await assertHealth(baseUrl, timeoutMs);
  console.log(`[scheduler] healthz ok: ${baseUrl}/healthz`);

  await assertStatus(baseUrl, timeoutMs);
  console.log(`[scheduler] time-sync status ok: ${baseUrl}/api/v1/time-sync/status`);

  await setManual(baseUrl, manualTimeIso, timeoutMs);
  console.log(`[scheduler] manual time set ok: ${manualTimeIso}`);

  await clearManual(baseUrl, timeoutMs);
  console.log("[scheduler] manual time cleared ok");

  console.log("scheduler ntp smoke passed.");
}

main().catch((error) => {
  console.error(`scheduler ntp smoke failed: ${String(error)}`);
  process.exit(1);
});
