import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { generate } from "./mcp-generate.mjs";

const FILES = [
  { path: "mcp/repo-services.json", requiredKeys: ["services"] },
  { path: "mcp/db-schema.json", requiredKeys: ["migrations", "schemas"] },
  { path: "mcp/api-index.json", requiredKeys: ["openapi"] },
  { path: "mcp/ops-runbooks.json", requiredKeys: ["runbooks"] }
];

function hash(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

function stablePayload(content) {
  const parsed = JSON.parse(content);
  if (parsed && typeof parsed === "object" && "generatedAt" in parsed) {
    delete parsed.generatedAt;
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function validateStructure(file) {
  if (!existsSync(file.path)) {
    throw new Error(`missing MCP resource: ${file.path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file.path, "utf8"));
  } catch (error) {
    throw new Error(`invalid JSON in ${file.path}: ${String(error)}`);
  }
  for (const key of file.requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`${file.path} missing required key: ${key}`);
    }
  }
}

function ensureArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
}

function validateSemantics() {
  const repo = JSON.parse(readFileSync("mcp/repo-services.json", "utf8"));
  ensureArray(repo.services, "mcp/repo-services.json.services");
  const seenNames = new Set();
  const seenPorts = new Set();
  for (const item of repo.services) {
    if (!item?.name || typeof item.name !== "string") {
      throw new Error("repo-services: each service requires name");
    }
    if (!Number.isInteger(item.port) || item.port <= 0) {
      throw new Error(`repo-services: invalid port for ${item.name}`);
    }
    if (!String(item.health ?? "").endsWith("/healthz")) {
      throw new Error(`repo-services: invalid health endpoint for ${item.name}`);
    }
    if (!String(item.metrics ?? "").endsWith("/metrics")) {
      throw new Error(`repo-services: invalid metrics endpoint for ${item.name}`);
    }
    if (seenNames.has(item.name)) {
      throw new Error(`repo-services: duplicate service name ${item.name}`);
    }
    if (seenPorts.has(item.port)) {
      throw new Error(`repo-services: duplicate service port ${item.port}`);
    }
    seenNames.add(item.name);
    seenPorts.add(item.port);
  }

  const dbSchema = JSON.parse(readFileSync("mcp/db-schema.json", "utf8"));
  ensureArray(dbSchema.migrations, "mcp/db-schema.json.migrations");
  for (const migration of dbSchema.migrations) {
    if (!String(migration).endsWith(".sql")) {
      throw new Error(`db-schema: migration must end with .sql (${migration})`);
    }
    if (!existsSync(`db/migrations/${migration}`)) {
      throw new Error(`db-schema: migration file not found (${migration})`);
    }
  }

  const apiIndex = JSON.parse(readFileSync("mcp/api-index.json", "utf8"));
  ensureArray(apiIndex.openapi, "mcp/api-index.json.openapi");
  for (const spec of apiIndex.openapi) {
    if (!spec?.path || !existsSync(spec.path)) {
      throw new Error(`api-index: openapi file not found (${spec?.path ?? "unknown"})`);
    }
  }

  const runbooks = JSON.parse(readFileSync("mcp/ops-runbooks.json", "utf8"));
  ensureArray(runbooks.runbooks, "mcp/ops-runbooks.json.runbooks");
  for (const item of runbooks.runbooks) {
    if (!item?.path || !existsSync(item.path)) {
      throw new Error(`ops-runbooks: script not found (${item?.path ?? "unknown"})`);
    }
  }
}

async function main() {
  for (const file of FILES) {
    validateStructure(file);
  }
  validateSemantics();

  const generated = await generate({ write: false });
  const errors = [];

  for (const file of FILES) {
    const expectedContent = generated.files[file.path];
    const actualContent = readFileSync(file.path, "utf8");
    if (hash(stablePayload(expectedContent)) !== hash(stablePayload(actualContent))) {
      errors.push(`${file.path} is stale; run pnpm mcp:generate or pnpm mcp:update`);
    }
  }

  if (errors.length > 0) {
    console.error("MCP check failed:");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`MCP check passed (${FILES.length} resources).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
