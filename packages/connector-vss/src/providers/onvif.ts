import { requestWithRetry } from "@evernet/shared";

export interface OnvifProbeConfig {
  deviceServiceUrl?: string;
  mediaServiceUrl?: string;
  username?: string;
  password?: string;
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}

export interface OnvifProbeResult {
  success: boolean;
  latencyMs: number;
  offlineCameras: number;
  detail: string;
}

const getSystemDateAndTimeEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>
  </s:Body>
</s:Envelope>`;

function buildAuthHeader(username?: string, password?: string): Record<string, string> {
  if (!username || !password) {
    return {};
  }
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return { authorization: `Basic ${token}` };
}

async function probeSoapEndpoint(url: string, config: OnvifProbeConfig, headers: Record<string, string>): Promise<boolean> {
  try {
    const response = await requestWithRetry(url, {
      method: "POST",
      headers: {
        "content-type": "application/soap+xml; charset=utf-8",
        ...headers
      },
      body: getSystemDateAndTimeEnvelope
    }, {
      timeoutMs: config.timeoutMs,
      retries: config.retries,
      backoffMs: config.backoffMs
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function probeOnvif(config: OnvifProbeConfig): Promise<OnvifProbeResult> {
  const startedAt = Date.now();
  const candidates = [config.deviceServiceUrl, config.mediaServiceUrl].filter((url): url is string => Boolean(url && url.length > 0));
  if (candidates.length === 0) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      offlineCameras: 1,
      detail: "onvif config missing service url"
    };
  }

  const headers = buildAuthHeader(config.username, config.password);
  for (const endpoint of candidates) {
    const ok = await probeSoapEndpoint(endpoint, config, headers);
    if (ok) {
      return {
        success: true,
        latencyMs: Date.now() - startedAt,
        offlineCameras: 0,
        detail: "onvif probe ok"
      };
    }
  }

  return {
    success: false,
    latencyMs: Date.now() - startedAt,
    offlineCameras: 1,
    detail: "onvif probe failed"
  };
}
