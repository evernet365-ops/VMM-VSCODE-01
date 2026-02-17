import { readFileSync } from "node:fs";

function mustInclude(text, pattern, context, errors) {
  if (!text.includes(pattern)) {
    errors.push(`${context} missing: ${pattern}`);
  }
}

function parseOpenApiPaths(yamlContent) {
  const lines = yamlContent.split(/\r?\n/);
  const paths = [];
  let currentPath = null;
  for (const line of lines) {
    const pathMatch = /^  (\/[^:]+):\s*$/.exec(line);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = /^    (get|post|put|delete|patch):\s*$/.exec(line);
    if (methodMatch && currentPath) {
      paths.push({ path: currentPath, method: methodMatch[1].toUpperCase() });
    }
  }
  return paths;
}

function toFastifyPath(openapiPath) {
  return openapiPath.replaceAll(/\{([^}]+)\}/g, ":$1");
}

function isAiOrchestratorPath(pathname) {
  return pathname === "/healthz" ||
    pathname === "/metrics" ||
    pathname === "/internal/events" ||
    pathname === "/api/v1/sites/{siteId}/ai-events" ||
    pathname === "/api/v1/sites/{siteId}/poll-state";
}

function main() {
  const errors = [];
  const openapi = readFileSync("openapi/vmm.yaml", "utf8");
  const source = readFileSync("packages/ai-orchestrator/src/index.ts", "utf8");

  const expectedPaths = parseOpenApiPaths(openapi).filter((item) => isAiOrchestratorPath(item.path));
  for (const item of expectedPaths) {
    const method = item.method.toLowerCase();
    mustInclude(source, `app.${method}("${toFastifyPath(item.path)}"`, "ai-orchestrator route contract", errors);
  }

  mustInclude(source, "return { status: \"accepted\", eventId: event.id };", "ai-orchestrator response contract", errors);
  mustInclude(source, "return { error: \"siteId, cameraId, eventType, severity, dedupKey are required\" };", "ai-orchestrator validation contract", errors);
  mustInclude(source, "return { error: \"database write failed, request retained for retry\" };", "ai-orchestrator db failure contract", errors);

  if (errors.length > 0) {
    console.error("Contract check failed (ai-orchestrator):");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`Contract check passed (ai-orchestrator, ${expectedPaths.length} routes).`);
}

main();
