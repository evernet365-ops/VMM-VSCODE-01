import { requestWithRetry } from "@evernet/shared";

export interface VivotekProbeConfig {
  nvrBaseUrl?: string;
  ipcamBaseUrl?: string;
  username?: string;
  password?: string;
  cameraId?: string;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}

export interface VivotekProbeResult {
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

function buildIpcamBase(baseUrl: string, cameraId?: string): string {
  if (!cameraId || baseUrl.includes("/CamConfig/")) {
    return baseUrl;
  }
  return `${trimTrailingSlash(baseUrl)}/CamConfig/${encodeURIComponent(cameraId)}`;
}

async function probeGet(url: string, headers: Record<string, string>, config: VivotekProbeConfig): Promise<boolean> {
  try {
    const response = await requestWithRetry(url, { method: "GET", headers }, {
      timeoutMs: config.timeoutMs,
      retries: config.retries,
      backoffMs: config.backoffMs
    });
    if (!response.ok) {
      return false;
    }
    const length = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 0) {
      return true;
    }
    return true;
  } catch {
    return false;
  }
}

export async function probeVivotek(config: VivotekProbeConfig): Promise<VivotekProbeResult> {
  const startedAt = Date.now();
  if (!config.nvrBaseUrl || !config.ipcamBaseUrl) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      offlineCameras: 1,
      detail: "vivotek config missing base url"
    };
  }

  const nvrBaseUrl = trimTrailingSlash(config.nvrBaseUrl);
  const ipcamBase = buildIpcamBase(config.ipcamBaseUrl, config.cameraId);
  const headers = {
    accept: "*/*",
    ...buildAuthHeader(config.username, config.password)
  };

  const nvrCandidates = ["/api/serverInfo", "/api/deviceTree", "/api/dataSourceList"];
  let nvrOk = false;
  for (const path of nvrCandidates) {
    const ok = await probeGet(`${nvrBaseUrl}${path}`, headers, config);
    if (ok) {
      nvrOk = true;
      break;
    }
  }

  const ipcamOk = await probeGet(`${trimTrailingSlash(ipcamBase)}/cgi-bin/viewer/video.jpg`, headers, config);
  const success = nvrOk && ipcamOk;

  return {
    success,
    latencyMs: Date.now() - startedAt,
    offlineCameras: ipcamOk ? 0 : 1,
    detail: success ? "vivotek nvr/ipcam probe ok" : `vivotek probe failed (nvr=${nvrOk ? "ok" : "down"}, ipcam=${ipcamOk ? "ok" : "down"})`
  };
}
