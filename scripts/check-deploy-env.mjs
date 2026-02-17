import { existsSync, readFileSync } from "node:fs";

const connectorFile = "deploy/env/connector-vss.prod.env";
const schedulerFile = "deploy/env/scheduler.prod.env";

const connectorRequiredKeys = [
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

const schedulerRequiredKeys = [
  "NODE_ENV",
  "SCHEDULER_PORT",
  "SCHEDULER_SITES",
  "SCHEDULER_INTERVAL_MS",
  "FEATURE_VMM_NTP_TIME_SYNC",
  "NTP_SERVER_ENABLED",
  "NTP_SERVER_HOST",
  "NTP_SERVER_PORT",
  "NTP_UPSTREAM_HOST",
  "NTP_UPSTREAM_PORT",
  "NTP_SYNC_INTERVAL_MIN",
  "NTP_REQUEST_TIMEOUT_MS",
  "NTP_MANUAL_TIME_ISO",
  "API_TIMEOUT_MS",
  "API_RETRIES",
  "API_BACKOFF_MS"
];

const allowEmptyValues = new Set(["NTP_MANUAL_TIME_ISO"]);

const requiredWhenSampoEnabled = [
  "SAMPO_NVR_BASE_URL",
  "SAMPO_CAMERA_BASE_URL",
  "SAMPO_USERNAME",
  "SAMPO_PASSWORD"
];

const requiredWhenNtpEnabled = [
  "NTP_UPSTREAM_HOST",
  "NTP_UPSTREAM_PORT",
  "NTP_SYNC_INTERVAL_MIN",
  "NTP_REQUEST_TIMEOUT_MS"
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

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validateNumberRange(values, key, min, max, errors) {
  if (!values.has(key)) {
    return;
  }
  const value = asNumber(values.get(key));
  if (value === undefined) {
    errors.push(`${key} must be a number`);
    return;
  }
  if (value < min || value > max) {
    errors.push(`${key} must be between ${min} and ${max}, got ${value}`);
  }
}

function validateFile(filePath, requiredKeys) {
  if (!existsSync(filePath)) {
    return [`missing file ${filePath}`];
  }

  const source = readFileSync(filePath, "utf8");
  const { values, duplicates } = parseEnv(source);
  const missing = requiredKeys.filter((key) => !values.has(key));
  const empty = requiredKeys.filter(
    (key) => values.has(key) && values.get(key) === "" && !allowEmptyValues.has(key)
  );
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

  const ntpEnabled = isTrue(values.get("FEATURE_VMM_NTP_TIME_SYNC"));
  if (ntpEnabled) {
    const missingNtp = requiredWhenNtpEnabled.filter((key) => !values.has(key));
    if (missingNtp.length > 0) {
      errors.push(`missing NTP keys while FEATURE_VMM_NTP_TIME_SYNC=true: ${missingNtp.join(", ")}`);
    }
  }

  validateNumberRange(values, "NTP_SERVER_PORT", 1, 65535, errors);
  validateNumberRange(values, "NTP_UPSTREAM_PORT", 1, 65535, errors);
  validateNumberRange(values, "NTP_SYNC_INTERVAL_MIN", 1, 9999, errors);
  validateNumberRange(values, "NTP_REQUEST_TIMEOUT_MS", 100, 120000, errors);

  return errors.map((error) => `${filePath}: ${error}`);
}

function main() {
  const errors = [
    ...validateFile(connectorFile, connectorRequiredKeys),
    ...validateFile(schedulerFile, schedulerRequiredKeys)
  ];

  if (errors.length > 0) {
    console.error("Deploy env check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Deploy env check passed (${connectorFile}, ${schedulerFile}).`);
}

main();
