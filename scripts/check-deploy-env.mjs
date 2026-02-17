import { existsSync, readFileSync } from "node:fs";

const targetFile = "deploy/env/connector-vss.prod.env";

const requiredKeys = [
  "NODE_ENV",
  "CONNECTOR_VSS_PORT",
  "CONNECTOR_SITE_ID",
  "FEATURE_VMS_HEALTH_MONITOR",
  "FEATURE_VMS_POLLING_SHARDING",
  "FEATURE_VMS_SAMPO_CGI",
  "API_TIMEOUT_MS",
  "API_RETRIES",
  "API_BACKOFF_MS",
  "EVENT_QUEUE_MAX"
];

const requiredWhenSampoEnabled = [
  "SAMPO_NVR_BASE_URL",
  "SAMPO_CAMERA_BASE_URL",
  "SAMPO_USERNAME",
  "SAMPO_PASSWORD"
];

function parseEnv(source) {
  const result = new Map();
  const duplicates = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (result.has(key)) {
      duplicates.push(key);
    }
    result.set(key, value);
  }

  return { values: result, duplicates };
}

function isTrue(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

function main() {
  if (!existsSync(targetFile)) {
    console.error(`Deploy env check failed: missing file ${targetFile}`);
    process.exit(1);
  }

  const source = readFileSync(targetFile, "utf8");
  const { values, duplicates } = parseEnv(source);
  const missing = requiredKeys.filter((key) => !values.has(key));
  const empty = requiredKeys.filter((key) => values.has(key) && values.get(key) === "");
  const errors = [];

  if (duplicates.length > 0) {
    errors.push(`duplicate keys: ${duplicates.join(", ")}`);
  }
  if (missing.length > 0) {
    errors.push(`missing required keys: ${missing.join(", ")}`);
  }
  if (empty.length > 0) {
    errors.push(`empty required values: ${empty.join(", ")}`);
  }

  const sampoEnabled = isTrue(values.get("FEATURE_VMS_SAMPO_CGI"));
  if (sampoEnabled) {
    const missingSampo = requiredWhenSampoEnabled.filter((key) => !values.has(key));
    const emptySampo = requiredWhenSampoEnabled.filter((key) => values.has(key) && values.get(key) === "");
    if (missingSampo.length > 0) {
      errors.push(`missing SAMPO keys while FEATURE_VMS_SAMPO_CGI=true: ${missingSampo.join(", ")}`);
    }
    if (emptySampo.length > 0) {
      errors.push(`empty SAMPO values while FEATURE_VMS_SAMPO_CGI=true: ${emptySampo.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    console.error("Deploy env check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Deploy env check passed (${targetFile}).`);
}

main();
