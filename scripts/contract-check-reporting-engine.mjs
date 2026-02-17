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

function main() {
  const errors = [];
  const openapi = readFileSync("openapi/vmm.yaml", "utf8");
  const source = readFileSync("packages/reporting-engine/src/index.ts", "utf8");

  const expectedPaths = parseOpenApiPaths(openapi).filter((item) => item.path.includes("/reports/") || item.path.includes("/playback"));
  for (const item of expectedPaths) {
    const method = item.method.toLowerCase();
    mustInclude(source, `app.${method}("${toFastifyPath(item.path)}"`, "reporting-engine route contract", errors);
  }

  mustInclude(source, "featureEnabled: false", "reporting-engine response contract", errors);
  mustInclude(source, "source: result.source", "reporting-engine playback response contract", errors);
  mustInclude(source, "top20", "reporting-engine ranking response contract", errors);

  if (errors.length > 0) {
    console.error("Contract check failed (reporting-engine):");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`Contract check passed (reporting-engine, ${expectedPaths.length} routes).`);
}

main();
