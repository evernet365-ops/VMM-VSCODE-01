import dotenv from "dotenv";

dotenv.config({ path: process.env.ENV_FILE ?? ".env.local" });
dotenv.config();

export function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} is not a number: ${raw}`);
  }
  return value;
}

export interface ServiceRuntimeConfig {
  serviceName: string;
  port: number;
  nodeEnv: string;
  enableAI: boolean;
  pollIntervalSec: number;
  pollJitterSec: number;
  notifyNonCritical: boolean;
  apiTimeoutMs: number;
  apiRetries: number;
  apiBackoffMs: number;
  eventQueueMax: number;
}

export function loadServiceRuntimeConfig(serviceName: string, defaultPort: number): ServiceRuntimeConfig {
  return {
    serviceName,
    port: getNumberEnv("PORT", defaultPort),
    nodeEnv: process.env.NODE_ENV ?? "development",
    enableAI: getBooleanEnv("ENABLE_AI", true),
    pollIntervalSec: getNumberEnv("POLL_INTERVAL", 300),
    pollJitterSec: getNumberEnv("POLL_JITTER_SECONDS", 60),
    notifyNonCritical: getBooleanEnv("NOTIFY_NON_CRITICAL", false),
    apiTimeoutMs: getNumberEnv("API_TIMEOUT_MS", 3000),
    apiRetries: getNumberEnv("API_RETRIES", 3),
    apiBackoffMs: getNumberEnv("API_BACKOFF_MS", 300),
    eventQueueMax: getNumberEnv("EVENT_QUEUE_MAX", 1000)
  };
}
