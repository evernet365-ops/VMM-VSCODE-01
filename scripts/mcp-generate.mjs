import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const SERVICE_PORT_MAP = {
  NOTIFICATION_GATEWAY_PORT: { name: "notification-gateway", owners: ["team-ops"] },
  AI_ORCHESTRATOR_PORT: { name: "ai-orchestrator", owners: ["team-ml"] },
  AI_WORKER_PORT: { name: "ai-worker", owners: ["team-ml"] },
  CONNECTOR_VSS_PORT: { name: "connector-vss", owners: ["team-video"] },
  REPORTING_ENGINE_PORT: { name: "reporting-engine", owners: ["team-analytics"] },
  SCHEDULER_PORT: { name: "scheduler", owners: ["team-ops"] },
  WEB_DASHBOARD_PORT: { name: "web-dashboard", owners: ["team-frontend"] }
};

const RUNBOOK_ALLOWLIST = new Set([
  "stack-wait.mjs",
  "stack-diag.mjs",
  "stack-smoke.mjs",
  "stack-up.mjs",
  "stack-down.mjs",
  "stack-logs.mjs",
  "stack-status.mjs",
  "stack-clean.mjs",
  "drill-db-failure.mjs",
  "drill-circuit-observe.mjs",
  "drill-webhook-failure.mjs",
  "smoke-test.mjs"
]);

const VERSION = "1.0.0";

async function maxMtime(paths) {
  let max = 0;
  for (const p of paths) {
    const stat = await fs.stat(p);
    const mtime = stat.mtimeMs;
    if (mtime > max) {
      max = mtime;
    }
  }
  return new Date(max || Date.now()).toISOString();
}

async function readEnvFile(envPath) {
  const content = await fs.readFile(envPath, "utf8");
  const result = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    result[key] = rest.join("=");
  }
  return result;
}

async function generateServices(envPath) {
  const env = await readEnvFile(envPath);
  const services = [];
  for (const [envKey, meta] of Object.entries(SERVICE_PORT_MAP)) {
    if (!env[envKey]) continue;
    const port = Number(env[envKey]);
    const baseUrl = `http://localhost:${port}`;
    services.push({
      name: meta.name,
      port,
      health: `${baseUrl}/healthz`,
      metrics: `${baseUrl}/metrics`,
      owners: meta.owners
    });
  }
  services.sort((a, b) => a.name.localeCompare(b.name));
  return {
    version: VERSION,
    generatedAt: await maxMtime([envPath]),
    services
  };
}

async function generateDbSchema(migrationsDir) {
  const entries = await fs.readdir(migrationsDir);
  const migrations = entries.filter((f) => f.endsWith(".sql")).sort();
  const tables = new Set();

  for (const file of migrations) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const regex = /create\s+table\s+if\s+not\s+exists\s+([a-zA-Z0-9_]+)/gi;
    let match;
    while ((match = regex.exec(sql)) !== null) {
      tables.add(match[1]);
    }
  }

  return {
    version: VERSION,
    generatedAt: await maxMtime(migrations.map((m) => path.join(migrationsDir, m))),
    migrations,
    schemas: [
      {
        name: "public",
        tables: Array.from(tables).sort()
      }
    ]
  };
}

async function generateApiIndex(openapiDir) {
  const entries = await fs.readdir(openapiDir);
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
  const openapi = yamlFiles.map((file) => ({
    name: file.replace(/\.(yaml|yml)$/i, ""),
    path: path.posix.join("openapi", file)
  }));

  return {
    version: VERSION,
    generatedAt: yamlFiles.length > 0 ? await maxMtime(yamlFiles.map((f) => path.join(openapiDir, f))) : new Date(0).toISOString(),
    openapi,
    opsEndpoints: []
  };
}

async function generateRunbooks(scriptsDir) {
  const entries = await fs.readdir(scriptsDir);
  const runbooks = entries
    .filter((f) => RUNBOOK_ALLOWLIST.has(f))
    .sort()
    .map((file) => ({ name: file.replace(".mjs", ""), path: path.posix.join("scripts", file) }));

  return {
    version: VERSION,
    generatedAt: runbooks.length > 0 ? await maxMtime(runbooks.map((r) => path.join(scriptsDir, `${r.name}.mjs`))) : new Date(0).toISOString(),
    runbooks
  };
}

function toJsonContent(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function generate({ write = true } = {}) {
  const [services, dbSchema, apiIndex, runbooks] = await Promise.all([
    generateServices(".env.example"),
    generateDbSchema(path.join("db", "migrations")),
    generateApiIndex("openapi"),
    generateRunbooks("scripts")
  ]);

  const files = {
    "mcp/repo-services.json": toJsonContent(services),
    "mcp/db-schema.json": toJsonContent(dbSchema),
    "mcp/api-index.json": toJsonContent(apiIndex),
    "mcp/ops-runbooks.json": toJsonContent(runbooks)
  };

  const hashes = Object.fromEntries(Object.entries(files).map(([file, content]) => [file, hashContent(content)]));

  if (write) {
    await fs.mkdir("mcp", { recursive: true });
    await Promise.all(Object.entries(files).map(([file, content]) => fs.writeFile(file, content)));
    console.log("MCP resources generated:");
    for (const file of Object.keys(files)) {
      console.log(`- ${file}`);
    }
  }

  return { files, hashes };
}

async function main() {
  await generate({ write: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
