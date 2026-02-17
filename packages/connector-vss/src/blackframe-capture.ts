export interface BlackframeCaptureConfig {
  enabled: boolean;
  uploadUrl?: string;
  uploadToken?: string;
  minIntervalSec: number;
  timeoutMs: number;
}

type CaptureContext = {
  serviceName: string;
  siteId: string;
  cameraId: string;
  nowMs: number;
  detail: string;
};

export class BlackframeCaptureService {
  private readonly config: BlackframeCaptureConfig;
  private readonly lastCaptureAtByCamera = new Map<string, number>();

  constructor(config: BlackframeCaptureConfig) {
    this.config = config;
  }

  async capture(ctx: CaptureContext): Promise<{ ok: boolean; reason: string }> {
    if (!this.config.enabled) {
      return { ok: false, reason: "disabled" };
    }

    const minIntervalMs = Math.max(1, this.config.minIntervalSec) * 1000;
    const lastCaptureAt = this.lastCaptureAtByCamera.get(ctx.cameraId) ?? 0;
    if (ctx.nowMs - lastCaptureAt < minIntervalMs) {
      return { ok: false, reason: "throttled" };
    }
    this.lastCaptureAtByCamera.set(ctx.cameraId, ctx.nowMs);

    if (!this.config.uploadUrl || !this.config.uploadToken) {
      return { ok: false, reason: "missing upload config" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(100, this.config.timeoutMs));
    try {
      const response = await fetch(this.config.uploadUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.uploadToken}`
        },
        body: JSON.stringify({
          service: ctx.serviceName,
          siteId: ctx.siteId,
          cameraId: ctx.cameraId,
          ts: new Date(ctx.nowMs).toISOString(),
          detail: ctx.detail,
          sample: "blackframe"
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { ok: false, reason: `upload status ${response.status}` };
      }
      return { ok: true, reason: "uploaded" };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
