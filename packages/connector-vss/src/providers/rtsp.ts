import net from "node:net";
import tls from "node:tls";

export interface RtspProbeConfig {
  rtspUrl?: string;
  username?: string;
  password?: string;
  timeoutMs: number;
}

export interface RtspProbeResult {
  success: boolean;
  latencyMs: number;
  offlineCameras: number;
  detail: string;
}

function buildAuthHeader(username?: string, password?: string): string | undefined {
  if (!username || !password) {
    return undefined;
  }
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Authorization: Basic ${token}\r\n`;
}

function parseRtspStatus(data: string): number | undefined {
  const match = data.match(/^RTSP\/1\.0\s+(\d{3})/m);
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

async function probeRtspHandshake(urlValue: URL, timeoutMs: number, authHeader?: string): Promise<{ ok: boolean; status?: number }> {
  return new Promise((resolve) => {
    const isTls = urlValue.protocol === "rtsps:";
    const host = urlValue.hostname;
    const port = urlValue.port ? Number(urlValue.port) : 554;
    const path = `${urlValue.pathname || "/"}${urlValue.search || ""}`;
    const request = `OPTIONS rtsp://${host}:${port}${path} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: EverNetVMM\r\n${authHeader ?? ""}\r\n`;

    let settled = false;
    const socket = isTls
      ? tls.connect({ host, port, rejectUnauthorized: false })
      : net.createConnection({ host, port });

    const finish = (ok: boolean, status?: number): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve({ ok, status });
    };

    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("connect", () => {
      socket.write(request);
    });
    socket.once("data", (chunk: Buffer) => {
      const status = parseRtspStatus(chunk.toString("utf8"));
      const ok = status !== undefined && status >= 200 && status < 400;
      finish(ok, status);
    });
  });
}

export async function probeRtsp(config: RtspProbeConfig): Promise<RtspProbeResult> {
  const startedAt = Date.now();
  if (!config.rtspUrl) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      offlineCameras: 1,
      detail: "rtsp config missing url"
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(config.rtspUrl);
  } catch {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      offlineCameras: 1,
      detail: "rtsp url invalid"
    };
  }

  const authHeader = buildAuthHeader(config.username, config.password);
  const handshake = await probeRtspHandshake(parsed, config.timeoutMs, authHeader);

  return {
    success: handshake.ok,
    latencyMs: Date.now() - startedAt,
    offlineCameras: handshake.ok ? 0 : 1,
    detail: handshake.ok ? "rtsp probe ok" : `rtsp probe failed${handshake.status ? ` (${handshake.status})` : ""}`
  };
}
