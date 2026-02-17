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

function isSchedulerPath(pathname) {
  return pathname === "/healthz" ||
    pathname === "/metrics" ||
    pathname === "/api/v1/sites/{siteId}/time-sync/status" ||
    pathname === "/api/v1/sites/{siteId}/time-sync/manual";
}

function main() {
  const errors = [];
  const openapi = readFileSync("openapi/vmm.yaml", "utf8");
  const source = readFileSync("packages/scheduler/src/index.ts", "utf8");

  const expectedPaths = parseOpenApiPaths(openapi).filter((item) => isSchedulerPath(item.path));
  for (const item of expectedPaths) {
    const method = item.method.toLowerCase();
    mustInclude(source, `app.${method}("${toFastifyPath(item.path)}"`, "scheduler route contract", errors);
  }

  mustInclude(source, "status: \"invalid\"", "scheduler validation contract", errors);
  mustInclude(source, "ntp: ntpSync.getStatus()", "scheduler ntp response contract", errors);
  mustInclude(source, "feature_ntp_time_sync", "scheduler startup log contract", errors);

  if (errors.length > 0) {
    console.error("Contract check failed (scheduler):");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`Contract check passed (scheduler, ${expectedPaths.length} routes).`);
}

main();
