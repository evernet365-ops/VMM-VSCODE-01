import { requestWithRetry } from "@evernet/shared";

export interface GenericCgiProbeConfig {
  providerName: string;
  nvrBaseUrl?: string;
  cameraBaseUrl?: string;
  username?: string;
  password?: string;
  nvrPaths: string[];
  cameraPaths: string[];
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}

export interface GenericCgiProbeResult {
  success: boolean;
  latencyMs: number;
  offlineCameras: number;
  detail: string;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildAuthHeader(username?: string, password?: string): Record<string, string> {
  if (!username || !password) {
    return {};
  }
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return { authorization: `Basic ${token}` };
}

async function probeAnyPath(baseUrl: string | undefined, paths: string[], headers: Record<string, string>, config: GenericCgiProbeConfig): Promise<boolean> {
  if (!baseUrl || paths.length === 0) {
    return false;
  }

  const base = trimTrailingSlash(baseUrl);
  for (const path of paths) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    try {
      const response = await requestWithRetry(`${base}${normalizedPath}`, {
        method: "GET",
        headers: {
          accept: "*/*",
          ...headers
        }
      }, {
        timeoutMs: config.timeoutMs,
        retries: config.retries,
        backoffMs: config.backoffMs
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // fail-soft
    }
  }

  return false;
}

export async function probeGenericCgi(config: GenericCgiProbeConfig): Promise<GenericCgiProbeResult> {
  const startedAt = Date.now();
  if (!config.nvrBaseUrl && !config.cameraBaseUrl) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      offlineCameras: 1,
      detail: `${config.providerName} config missing base url`
    };
  }

  const headers = buildAuthHeader(config.username, config.password);
  const nvrOk = await probeAnyPath(config.nvrBaseUrl, config.nvrPaths, headers, config);
  const cameraOk = await probeAnyPath(config.cameraBaseUrl, config.cameraPaths, headers, config);
  const success = nvrOk || cameraOk;

  return {
    success,
    latencyMs: Date.now() - startedAt,
    offlineCameras: cameraOk ? 0 : 1,
    detail: success
      ? `${config.providerName} probe ok`
      : `${config.providerName} probe failed (nvr=${nvrOk ? "ok" : "down"}, camera=${cameraOk ? "ok" : "down"})`
  };
}
