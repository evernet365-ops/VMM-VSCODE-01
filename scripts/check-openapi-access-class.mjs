import { readFileSync } from "node:fs";

const allowed = new Set(["External", "Internal", "Ops"]);
const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const files = ["openapi/vmm.yaml", "openapi/notification-gateway.yaml"];

function countIndent(line) {
  let count = 0;
  while (count < line.length && line[count] === " ") {
    count += 1;
  }
  return count;
}

function parseOperationContexts(content) {
  const lines = content.split(/\r?\n/);
  const contexts = [];
  let currentPath = "";
  let currentMethod = "";
  let methodIndent = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.replace(/\t/g, "    ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const indent = countIndent(line);

    if (trimmed.startsWith("/") && trimmed.endsWith(":") && indent === 2) {
      currentPath = trimmed.slice(0, -1);
      currentMethod = "";
      methodIndent = -1;
      continue;
    }

    const methodMatch = trimmed.match(/^([a-z]+):$/);
    if (currentPath && methodMatch && methods.has(methodMatch[1]) && indent === 4) {
      currentMethod = methodMatch[1];
      methodIndent = indent;
      contexts.push({
        path: currentPath,
        method: currentMethod,
        line: i + 1,
        accessClass: ""
      });
      continue;
    }

    if (currentMethod && indent <= methodIndent) {
      currentMethod = "";
      methodIndent = -1;
      continue;
    }

    if (currentMethod && trimmed.startsWith("x-access-class:")) {
      const value = trimmed.split(":").slice(1).join(":").trim();
      const current = contexts[contexts.length - 1];
      if (current) {
        current.accessClass = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  return contexts;
}

function checkFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const operations = parseOperationContexts(content);
  const errors = [];

  for (const op of operations) {
    if (!op.accessClass) {
      errors.push(`${filePath}:${op.line} ${op.method.toUpperCase()} ${op.path} missing x-access-class`);
      continue;
    }
    if (!allowed.has(op.accessClass)) {
      errors.push(
        `${filePath}:${op.line} ${op.method.toUpperCase()} ${op.path} invalid x-access-class "${op.accessClass}" ` +
        `(allowed: ${Array.from(allowed).join(", ")})`
      );
    }

    if (op.accessClass === "Internal" && !op.path.startsWith("/internal/")) {
      errors.push(
        `${filePath}:${op.line} ${op.method.toUpperCase()} ${op.path} marked Internal but path is not /internal/*`
      );
    }

    if (op.accessClass === "External" && !op.path.startsWith("/api/v1/sites/{siteId}/")) {
      errors.push(
        `${filePath}:${op.line} ${op.method.toUpperCase()} ${op.path} marked External but path is not /api/v1/sites/{siteId}/*`
      );
    }

    if (op.accessClass === "Ops" && op.path !== "/healthz" && op.path !== "/metrics") {
      errors.push(
        `${filePath}:${op.line} ${op.method.toUpperCase()} ${op.path} marked Ops but path is not /healthz or /metrics`
      );
    }
  }

  return { filePath, operations, errors };
}

function main() {
  const allErrors = [];
  let totalOperations = 0;

  for (const file of files) {
    const result = checkFile(file);
    totalOperations += result.operations.length;
    allErrors.push(...result.errors);
  }

  if (allErrors.length > 0) {
    console.error("OpenAPI access-class check failed:");
    for (const err of allErrors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`OpenAPI access-class check passed (${totalOperations} operations checked).`);
}

main();
