#!/usr/bin/env node

const targets = [
  { name: "notification-gateway", url: process.env.SMOKE_GATEWAY_URL ?? "http://localhost:3010" },
  { name: "ai-orchestrator", url: process.env.SMOKE_ORCHESTRATOR_URL ?? "http://localhost:3011" },
  { name: "ai-worker", url: process.env.SMOKE_WORKER_URL ?? "http://localhost:3012" },
  { name: "connector-vss", url: process.env.SMOKE_CONNECTOR_URL ?? "http://localhost:3013" },
  { name: "reporting-engine", url: process.env.SMOKE_REPORTING_URL ?? "http://localhost:3014" },
  { name: "scheduler", url: process.env.SMOKE_SCHEDULER_URL ?? "http://localhost:3015" },
  { name: "web-dashboard", url: process.env.SMOKE_DASHBOARD_URL ?? "http://localhost:3016" }
];

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function checkHealth() {
  for (const target of targets) {
    const response = await fetch(`${target.url}/healthz`);
    assertOk(response.ok, `health check failed for ${target.name}`);
    const payload = await response.json();
    console.log(`[healthz] ${target.name}: ${payload.status}`);
  }
}

async function checkNotify() {
  const response = await fetch(`${targets[0].url}/internal/notify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      siteId: "site-a",
      severity: "critical",
      title: "Smoke Test Notification",
      message: "notification-gateway smoke test",
      channels: ["gchat"],
      card: {
        type: "summary",
        title: "Smoke Summary",
        body: "summary body",
        links: [
          { text: "Dashboard", url: "https://example.local/dashboard" },
          { text: "Report", url: "https://example.local/report" }
        ]
      }
    })
  });

  assertOk(response.ok, "notification smoke request failed");
  const payload = await response.json();
  console.log(`[notify] resultCount=${payload.resultCount}`);
}

async function checkOrchestratorFlow() {
  const dedupKey = `smoke-${Date.now()}`;
  const push = await fetch(`${targets[1].url}/internal/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      siteId: "site-a",
      cameraId: "cam-a-1",
      eventType: "offline",
      severity: "critical",
      score: 0.99,
      tsEvent: new Date().toISOString(),
      dedupKey,
      metadata: { source: "smoke" }
    })
  });

  assertOk(push.ok, "orchestrator event insert failed");
  const pushPayload = await push.json();
  console.log(`[orchestrator] inserted eventId=${pushPayload.eventId}`);

  const query = await fetch(`${targets[1].url}/api/v1/sites/site-a/ai-events?limit=10`);
  assertOk(query.ok, "orchestrator event query failed");
  const queryPayload = await query.json();
  assertOk(Array.isArray(queryPayload.items), "orchestrator response invalid");
  console.log(`[orchestrator] queried count=${queryPayload.count}`);
}

async function checkReporting() {
  const response = await fetch(`${targets[4].url}/api/v1/sites/site-a/reports/anomalies?window=15m`);
  assertOk(response.ok, "reporting anomalies request failed");
  const payload = await response.json();
  console.log(`[reporting] anomalies count=${payload.count}`);
}

async function main() {
  await checkHealth();
  await checkNotify();
  await checkOrchestratorFlow();
  await checkReporting();
  console.log("Smoke test completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
