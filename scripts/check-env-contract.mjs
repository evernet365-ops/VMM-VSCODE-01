import { readFileSync } from "node:fs";

const requiredKeys = [
  "NODE_ENV",
  "ENABLE_AI",
  "POLL_INTERVAL",
  "NOTIFY_NON_CRITICAL",
  "POLL_JITTER_SECONDS",
  "DATABASE_URL",
  "DB_POOL_MAX",
  "REDIS_URL",
  "NOTIFICATION_GATEWAY_PORT",
  "AI_ORCHESTRATOR_PORT",
  "AI_WORKER_PORT",
  "CONNECTOR_VSS_PORT",
  "REPORTING_ENGINE_PORT",
  "SCHEDULER_PORT",
  "WEB_DASHBOARD_PORT",
  "NOTIFICATION_GATEWAY_URL",
  "AI_ORCHESTRATOR_URL",
  "REPORTING_ENGINE_URL",
  "GATEWAY_CONFIG_PATH",
  "EVENT_QUEUE_MAX",
  "API_TIMEOUT_MS",
  "API_RETRIES",
  "API_BACKOFF_MS",
  "PROMETHEUS_PORT",
  "GRAFANA_PORT",
  "GRAFANA_ADMIN_USER",
  "GRAFANA_ADMIN_PASSWORD"
];

function parseEnvFile(filePath) {
  const source = readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);
  const keys = [];
  const duplicates = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (seen.has(key)) {
      duplicates.push(key);
    } else {
      seen.add(key);
      keys.push(key);
    }
  }

  return { keys, duplicates };
}

function main() {
  const { keys, duplicates } = parseEnvFile(".env.example");
  const keySet = new Set(keys);
  const missing = requiredKeys.filter((key) => !keySet.has(key));

  if (duplicates.length > 0 || missing.length > 0) {
    console.error("Environment contract check failed:");
    if (duplicates.length > 0) {
      console.error(`- duplicate keys: ${duplicates.join(", ")}`);
    }
    if (missing.length > 0) {
      console.error(`- missing required keys: ${missing.join(", ")}`);
    }
    process.exit(1);
  }

  console.log(`Environment contract check passed (${keys.length} keys).`);
}

main();
