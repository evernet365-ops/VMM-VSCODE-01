import dgram, { type Socket } from "node:dgram";
import type { Logger, ServiceMetrics } from "@evernet/shared";

const NTP_UNIX_EPOCH_DIFF_SECONDS = 2_208_988_800;
const MIN_SYNC_INTERVAL_MIN = 1;
const MAX_SYNC_INTERVAL_MIN = 9_999;

export interface NtpSyncConfig {
  enabled: boolean;
  siteId: string;
  upstreamHost: string;
  upstreamPort: number;
  syncIntervalMin: number;
  requestTimeoutMs: number;
  serverEnabled: boolean;
  serverHost: string;
  serverPort: number;
  manualTimeIso?: string;
}

export interface NtpSyncStatus {
  enabled: boolean;
  mode: "disabled" | "system" | "manual" | "upstream";
  siteId: string;
  upstreamHost: string;
  upstreamPort: number;
  syncIntervalMin: number;
  requestTimeoutMs: number;
  serverEnabled: boolean;
  serverHost: string;
  serverPort: number;
  serverBound: boolean;
  offsetMs: number;
  manualTimeIso?: string;
  lastSyncAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
}

type QueryNtpTime = (host: string, port: number, timeoutMs: number) => Promise<number>;
type CreateUdpServer = () => Socket;
type Now = () => number;

function normalizeSyncIntervalMin(value: number): number {
  if (!Number.isFinite(value)) {
    return 60;
  }
  const rounded = Math.floor(value);
  if (rounded < MIN_SYNC_INTERVAL_MIN) {
    return MIN_SYNC_INTERVAL_MIN;
  }
  if (rounded > MAX_SYNC_INTERVAL_MIN) {
    return MAX_SYNC_INTERVAL_MIN;
  }
  return rounded;
}

function parseManualTimeIso(value?: string): { iso?: string; ms?: number } {
  if (!value) {
    return {};
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return {};
  }
  return { iso: new Date(parsed).toISOString(), ms: parsed };
}

function readNtpTransmitTimeMs(packet: Buffer): number {
  const seconds = packet.readUInt32BE(40);
  const fraction = packet.readUInt32BE(44);
  const unixSeconds = seconds - NTP_UNIX_EPOCH_DIFF_SECONDS;
  return unixSeconds * 1000 + Math.round((fraction * 1000) / 0x1_0000_0000);
}

function writeNtpTimestamp(packet: Buffer, offset: number, unixMs: number): void {
  const unixSeconds = Math.floor(unixMs / 1000);
  const milliseconds = unixMs % 1000;
  const ntpSeconds = unixSeconds + NTP_UNIX_EPOCH_DIFF_SECONDS;
  const ntpFraction = Math.floor((milliseconds / 1000) * 0x1_0000_0000);
  packet.writeUInt32BE(ntpSeconds >>> 0, offset);
  packet.writeUInt32BE(ntpFraction >>> 0, offset + 4);
}

export async function queryNtpTime(host: string, port: number, timeoutMs: number): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const packet = Buffer.alloc(48);
    packet[0] = 0x1b;

    let settled = false;
    const cleanup = (): void => {
      socket.removeAllListeners();
      socket.close();
    };
    const done = (cb: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      cb();
    };

    const timeout = setTimeout(() => {
      done(() => reject(new Error("ntp request timeout")));
    }, Math.max(100, timeoutMs));

    socket.once("message", (message) => {
      clearTimeout(timeout);
      if (message.length < 48) {
        done(() => reject(new Error("invalid ntp response length")));
        return;
      }
      done(() => resolve(readNtpTransmitTimeMs(message)));
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      done(() => reject(error));
    });

    socket.send(packet, 0, packet.length, port, host, (error) => {
      if (!error) {
        return;
      }
      clearTimeout(timeout);
      done(() => reject(error));
    });
  });
}

export class NtpSyncController {
  private readonly config: NtpSyncConfig;
  private readonly logger: Logger;
  private readonly metrics: ServiceMetrics;
  private readonly serviceName: string;
  private readonly queryFn: QueryNtpTime;
  private readonly createServer: CreateUdpServer;
  private readonly now: Now;

  private syncTimer?: NodeJS.Timeout;
  private server?: Socket;
  private serverBound = false;
  private offsetMs = 0;
  private manualTimeIso?: string;
  private manualTimeMs?: number;
  private lastSyncAt?: string;
  private lastSuccessAt?: string;
  private lastError?: string;

  constructor(args: {
    config: NtpSyncConfig;
    logger: Logger;
    metrics: ServiceMetrics;
    serviceName: string;
    queryFn?: QueryNtpTime;
    createServer?: CreateUdpServer;
    now?: Now;
  }) {
    this.config = {
      ...args.config,
      syncIntervalMin: normalizeSyncIntervalMin(args.config.syncIntervalMin)
    };
    this.logger = args.logger;
    this.metrics = args.metrics;
    this.serviceName = args.serviceName;
    this.queryFn = args.queryFn ?? queryNtpTime;
    this.createServer = args.createServer ?? (() => dgram.createSocket("udp4"));
    this.now = args.now ?? (() => Date.now());

    const manual = parseManualTimeIso(this.config.manualTimeIso);
    this.manualTimeIso = manual.iso;
    this.manualTimeMs = manual.ms;
  }

  start(): void {
    if (!this.config.enabled) {
      return;
    }

    if (this.config.serverEnabled) {
      this.startServer();
    }

    if (this.manualTimeMs !== undefined) {
      this.logger.info("ntp manual time mode enabled", {
        tenant_id: this.config.siteId,
        manual_time_iso: this.manualTimeIso
      });
      return;
    }

    void this.syncOnce();
    this.syncTimer = setInterval(() => {
      void this.syncOnce();
    }, this.config.syncIntervalMin * 60 * 1000);
  }

  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    if (this.server) {
      this.server.close();
      this.server = undefined;
      this.serverBound = false;
    }
  }

  setManualTime(isoTime?: string): { accepted: boolean; reason?: string } {
    if (!this.config.enabled) {
      return { accepted: false, reason: "feature disabled" };
    }

    if (!isoTime) {
      this.manualTimeIso = undefined;
      this.manualTimeMs = undefined;
      if (!this.syncTimer) {
        void this.syncOnce();
        this.syncTimer = setInterval(() => {
          void this.syncOnce();
        }, this.config.syncIntervalMin * 60 * 1000);
      }
      return { accepted: true };
    }

    const parsed = parseManualTimeIso(isoTime);
    if (parsed.ms === undefined || parsed.iso === undefined) {
      return { accepted: false, reason: "invalid iso time" };
    }

    this.manualTimeIso = parsed.iso;
    this.manualTimeMs = parsed.ms;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    return { accepted: true };
  }

  getStatus(): NtpSyncStatus {
    return {
      enabled: this.config.enabled,
      mode: this.getMode(),
      siteId: this.config.siteId,
      upstreamHost: this.config.upstreamHost,
      upstreamPort: this.config.upstreamPort,
      syncIntervalMin: this.config.syncIntervalMin,
      requestTimeoutMs: this.config.requestTimeoutMs,
      serverEnabled: this.config.serverEnabled,
      serverHost: this.config.serverHost,
      serverPort: this.config.serverPort,
      serverBound: this.serverBound,
      offsetMs: this.offsetMs,
      manualTimeIso: this.manualTimeIso,
      lastSyncAt: this.lastSyncAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError
    };
  }

  getCurrentTimeIso(): string {
    if (this.manualTimeMs !== undefined) {
      return new Date(this.manualTimeMs).toISOString();
    }
    return new Date(this.now() + this.offsetMs).toISOString();
  }

  private getMode(): NtpSyncStatus["mode"] {
    if (!this.config.enabled) {
      return "disabled";
    }
    if (this.manualTimeMs !== undefined) {
      return "manual";
    }
    return this.lastSuccessAt ? "upstream" : "system";
  }

  private async syncOnce(): Promise<void> {
    if (!this.config.enabled || this.manualTimeMs !== undefined) {
      return;
    }

    const localNow = this.now();
    this.lastSyncAt = new Date(localNow).toISOString();
    this.metrics.ntpLastSyncTs.labels(this.serviceName, this.config.siteId).set(localNow);

    try {
      const upstreamNow = await this.queryFn(
        this.config.upstreamHost,
        this.config.upstreamPort,
        this.config.requestTimeoutMs
      );
      this.offsetMs = upstreamNow - localNow;
      this.lastSuccessAt = new Date(this.now()).toISOString();
      this.lastError = undefined;

      this.metrics.ntpSyncTotal.labels(this.serviceName, this.config.siteId, "success").inc();
      this.metrics.ntpOffsetMs.labels(this.serviceName, this.config.siteId).set(this.offsetMs);

      this.logger.info("ntp sync success", {
        tenant_id: this.config.siteId,
        offset_ms: this.offsetMs,
        upstream_host: this.config.upstreamHost,
        upstream_port: this.config.upstreamPort
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.metrics.ntpSyncTotal.labels(this.serviceName, this.config.siteId, "failure").inc();
      this.logger.warn("ntp sync failed", {
        tenant_id: this.config.siteId,
        upstream_host: this.config.upstreamHost,
        upstream_port: this.config.upstreamPort,
        error: this.lastError
      });
    }
  }

  private startServer(): void {
    try {
      const server = this.createServer();
      this.server = server;

      server.on("message", (message, remote) => {
        if (message.length < 48) {
          this.metrics.ntpServerRequestTotal.labels(this.serviceName, this.config.siteId, "invalid").inc();
          return;
        }

        try {
          const nowMs = this.manualTimeMs ?? this.now() + this.offsetMs;
          const response = Buffer.alloc(48);
          response[0] = 0x24;
          response[1] = 1;
          response[2] = 6;
          response[3] = 0xec;
          message.copy(response, 24, 40, 48);
          writeNtpTimestamp(response, 16, nowMs);
          writeNtpTimestamp(response, 32, nowMs);
          writeNtpTimestamp(response, 40, nowMs);

          server.send(response, 0, response.length, remote.port, remote.address);
          this.metrics.ntpServerRequestTotal.labels(this.serviceName, this.config.siteId, "success").inc();
        } catch (error) {
          this.metrics.ntpServerRequestTotal.labels(this.serviceName, this.config.siteId, "failure").inc();
          this.logger.warn("ntp server response failed", {
            tenant_id: this.config.siteId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });

      server.on("error", (error) => {
        this.serverBound = false;
        this.logger.warn("ntp server error", {
          tenant_id: this.config.siteId,
          host: this.config.serverHost,
          port: this.config.serverPort,
          error: error.message
        });
      });

      server.bind(this.config.serverPort, this.config.serverHost, () => {
        this.serverBound = true;
        this.logger.info("ntp server listening", {
          tenant_id: this.config.siteId,
          host: this.config.serverHost,
          port: this.config.serverPort
        });
      });
    } catch (error) {
      this.serverBound = false;
      this.logger.warn("ntp server startup failed", {
        tenant_id: this.config.siteId,
        host: this.config.serverHost,
        port: this.config.serverPort,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export function clampSyncIntervalMin(value: number): number {
  return normalizeSyncIntervalMin(value);
}
