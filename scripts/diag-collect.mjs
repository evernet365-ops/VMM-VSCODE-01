import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function maskEnv(env) {
  const allowed = [
    "NODE_ENV",
    "FEATURE_VMS_HEALTH_MONITOR",
    "FEATURE_VMM_PLAYBACK_FALLBACK_SCAN",
    "FEATURE_VMM_PLAYBACK_CACHE",
    "FEATURE_VMM_SITE_SHARDING",
    "FEATURE_ROLLOUT_GRADIENT",
    "FEATURE_INTERNAL_AUTHZ",
    "FEATURE_VMS_EVENT_DEDUP",
    "ROLLOUT_PERCENT",
    "ROLLOUT_SCOPE"
  ];

  const result = {};
  for (const key of allowed) {
    if (env[key] !== undefined) {
      result[key] = env[key];
    }
  }
  return result;
}

function parseTargets() {
  const raw = process.argv.find((arg) => arg.startsWith("--targets="));
  if (!raw) {
    return [
      "http://localhost:3010",
      "http://localhost:3011",
      "http://localhost:3013",
      "http://localhost:3014",
      "http://localhost:3015"
    ];
  }
  return raw
    .slice("--targets=".length)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function fetchWithTimeout(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text()
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const targets = parseTargets();
  const checks = [];
  for (const baseUrl of targets) {
    const healthz = await fetchWithTimeout(`${baseUrl}/healthz`);
    const metrics = await fetchWithTimeout(`${baseUrl}/metrics`);
    checks.push({
      baseUrl,
      healthz,
      metrics: {
        ok: metrics.ok,
        status: metrics.status,
        bodySample: metrics.body.slice(0, 2000)
      }
    });
  }

  const payload = {
    collectedAt: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    env: maskEnv(process.env),
    checks
  };

  const outDir = path.resolve("diag");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `diag-${nowStamp()}.json`);
  writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`diag written: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
