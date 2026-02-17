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

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
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
  enableVmsHealthMonitor?: boolean;
  enablePlaybackFallbackScan?: boolean;
  enableManagementReports?: boolean;
  enableVmsPollingSharding?: boolean;
  enableVmsVivotekCgi?: boolean;
  enableVmsOnvifProbe?: boolean;
  enableVmsRtspProbe?: boolean;
  enableVmsActiCgi?: boolean;
  enableVmsAvtechCgi?: boolean;
  enableVmsLilinCgi?: boolean;
  enableVmsGeovisionCgi?: boolean;
  enableVmsHisharpCgi?: boolean;
  enableVmsUniviewCgi?: boolean;
  enableVmsHikvisionCgi?: boolean;
  enableVmsXmCgi?: boolean;
  enableVmsSampoCgi?: boolean;
  enableNtpTimeSync?: boolean;
  ntpServerEnabled?: boolean;
  ntpServerHost?: string;
  ntpServerPort?: number;
  ntpUpstreamHost?: string;
  ntpUpstreamPort?: number;
  ntpSyncIntervalMin?: number;
  ntpRequestTimeoutMs?: number;
  ntpManualTimeIso?: string;
  vivotekNvrBaseUrl?: string;
  vivotekIpcamBaseUrl?: string;
  vivotekUsername?: string;
  vivotekPassword?: string;
  vivotekCameraId?: string;
  onvifDeviceServiceUrl?: string;
  onvifMediaServiceUrl?: string;
  onvifUsername?: string;
  onvifPassword?: string;
  rtspUrl?: string;
  rtspUsername?: string;
  rtspPassword?: string;
  actiNvrBaseUrl?: string;
  actiCameraBaseUrl?: string;
  actiUsername?: string;
  actiPassword?: string;
  avtechNvrBaseUrl?: string;
  avtechCameraBaseUrl?: string;
  avtechUsername?: string;
  avtechPassword?: string;
  lilinNvrBaseUrl?: string;
  lilinCameraBaseUrl?: string;
  lilinUsername?: string;
  lilinPassword?: string;
  geovisionNvrBaseUrl?: string;
  geovisionCameraBaseUrl?: string;
  geovisionUsername?: string;
  geovisionPassword?: string;
  hisharpNvrBaseUrl?: string;
  hisharpCameraBaseUrl?: string;
  hisharpUsername?: string;
  hisharpPassword?: string;
  univiewNvrBaseUrl?: string;
  univiewCameraBaseUrl?: string;
  univiewUsername?: string;
  univiewPassword?: string;
  hikvisionNvrBaseUrl?: string;
  hikvisionCameraBaseUrl?: string;
  hikvisionUsername?: string;
  hikvisionPassword?: string;
  xmNvrBaseUrl?: string;
  xmCameraBaseUrl?: string;
  xmUsername?: string;
  xmPassword?: string;
  sampoNvrBaseUrl?: string;
  sampoCameraBaseUrl?: string;
  sampoUsername?: string;
  sampoPassword?: string;
  pollIntervalSec: number;
  pollJitterSec: number;
  pollBucketCount: number;
  pollMaxConcurrency: number;
  pollSiteConcurrency: number;
  pollRateLimitPerSec: number;
  pollStaggerEnabled: boolean;
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
    enableVmsHealthMonitor: getBooleanEnv("FEATURE_VMS_HEALTH_MONITOR", false),
    enablePlaybackFallbackScan: getBooleanEnv("FEATURE_VMM_PLAYBACK_FALLBACK_SCAN", false),
    enableManagementReports: getBooleanEnv("FEATURE_VMM_MANAGEMENT_REPORTS", false),
    enableVmsPollingSharding: getBooleanEnv("FEATURE_VMS_POLLING_SHARDING", false),
    enableVmsVivotekCgi: getBooleanEnv("FEATURE_VMS_VIVOTEK_CGI", false),
    enableVmsOnvifProbe: getBooleanEnv("FEATURE_VMS_ONVIF_PROBE", false),
    enableVmsRtspProbe: getBooleanEnv("FEATURE_VMS_RTSP_PROBE", false),
    enableVmsActiCgi: getBooleanEnv("FEATURE_VMS_ACTI_CGI", false),
    enableVmsAvtechCgi: getBooleanEnv("FEATURE_VMS_AVTECH_CGI", false),
    enableVmsLilinCgi: getBooleanEnv("FEATURE_VMS_LILIN_CGI", false),
    enableVmsGeovisionCgi: getBooleanEnv("FEATURE_VMS_GEOVISION_CGI", false),
    enableVmsHisharpCgi: getBooleanEnv("FEATURE_VMS_HISHARP_CGI", false),
    enableVmsUniviewCgi: getBooleanEnv("FEATURE_VMS_UNIVIEW_CGI", false),
    enableVmsHikvisionCgi: getBooleanEnv("FEATURE_VMS_HIKVISION_CGI", false),
    enableVmsXmCgi: getBooleanEnv("FEATURE_VMS_XM_CGI", false),
    enableVmsSampoCgi: getBooleanEnv("FEATURE_VMS_SAMPO_CGI", false),
    enableNtpTimeSync: getBooleanEnv("FEATURE_VMM_NTP_TIME_SYNC", false),
    ntpServerEnabled: getBooleanEnv("NTP_SERVER_ENABLED", false),
    ntpServerHost: getOptionalEnv("NTP_SERVER_HOST") ?? "0.0.0.0",
    ntpServerPort: getNumberEnv("NTP_SERVER_PORT", 123),
    ntpUpstreamHost: getOptionalEnv("NTP_UPSTREAM_HOST") ?? "time.google.com",
    ntpUpstreamPort: getNumberEnv("NTP_UPSTREAM_PORT", 123),
    ntpSyncIntervalMin: getNumberEnv("NTP_SYNC_INTERVAL_MIN", 60),
    ntpRequestTimeoutMs: getNumberEnv("NTP_REQUEST_TIMEOUT_MS", 1500),
    ntpManualTimeIso: getOptionalEnv("NTP_MANUAL_TIME_ISO"),
    vivotekNvrBaseUrl: getOptionalEnv("VIVOTEK_NVR_BASE_URL"),
    vivotekIpcamBaseUrl: getOptionalEnv("VIVOTEK_IPCAM_BASE_URL"),
    vivotekUsername: getOptionalEnv("VIVOTEK_USERNAME"),
    vivotekPassword: getOptionalEnv("VIVOTEK_PASSWORD"),
    vivotekCameraId: getOptionalEnv("VIVOTEK_CAMERA_ID"),
    onvifDeviceServiceUrl: getOptionalEnv("ONVIF_DEVICE_SERVICE_URL"),
    onvifMediaServiceUrl: getOptionalEnv("ONVIF_MEDIA_SERVICE_URL"),
    onvifUsername: getOptionalEnv("ONVIF_USERNAME"),
    onvifPassword: getOptionalEnv("ONVIF_PASSWORD"),
    rtspUrl: getOptionalEnv("RTSP_URL"),
    rtspUsername: getOptionalEnv("RTSP_USERNAME"),
    rtspPassword: getOptionalEnv("RTSP_PASSWORD"),
    actiNvrBaseUrl: getOptionalEnv("ACTI_NVR_BASE_URL"),
    actiCameraBaseUrl: getOptionalEnv("ACTI_CAMERA_BASE_URL"),
    actiUsername: getOptionalEnv("ACTI_USERNAME"),
    actiPassword: getOptionalEnv("ACTI_PASSWORD"),
    avtechNvrBaseUrl: getOptionalEnv("AVTECH_NVR_BASE_URL"),
    avtechCameraBaseUrl: getOptionalEnv("AVTECH_CAMERA_BASE_URL"),
    avtechUsername: getOptionalEnv("AVTECH_USERNAME"),
    avtechPassword: getOptionalEnv("AVTECH_PASSWORD"),
    lilinNvrBaseUrl: getOptionalEnv("LILIN_NVR_BASE_URL"),
    lilinCameraBaseUrl: getOptionalEnv("LILIN_CAMERA_BASE_URL"),
    lilinUsername: getOptionalEnv("LILIN_USERNAME"),
    lilinPassword: getOptionalEnv("LILIN_PASSWORD"),
    geovisionNvrBaseUrl: getOptionalEnv("GEOVISION_NVR_BASE_URL"),
    geovisionCameraBaseUrl: getOptionalEnv("GEOVISION_CAMERA_BASE_URL"),
    geovisionUsername: getOptionalEnv("GEOVISION_USERNAME"),
    geovisionPassword: getOptionalEnv("GEOVISION_PASSWORD"),
    hisharpNvrBaseUrl: getOptionalEnv("HISHARP_NVR_BASE_URL"),
    hisharpCameraBaseUrl: getOptionalEnv("HISHARP_CAMERA_BASE_URL"),
    hisharpUsername: getOptionalEnv("HISHARP_USERNAME"),
    hisharpPassword: getOptionalEnv("HISHARP_PASSWORD"),
    univiewNvrBaseUrl: getOptionalEnv("UNIVIEW_NVR_BASE_URL"),
    univiewCameraBaseUrl: getOptionalEnv("UNIVIEW_CAMERA_BASE_URL"),
    univiewUsername: getOptionalEnv("UNIVIEW_USERNAME"),
    univiewPassword: getOptionalEnv("UNIVIEW_PASSWORD"),
    hikvisionNvrBaseUrl: getOptionalEnv("HIKVISION_NVR_BASE_URL"),
    hikvisionCameraBaseUrl: getOptionalEnv("HIKVISION_CAMERA_BASE_URL"),
    hikvisionUsername: getOptionalEnv("HIKVISION_USERNAME"),
    hikvisionPassword: getOptionalEnv("HIKVISION_PASSWORD"),
    xmNvrBaseUrl: getOptionalEnv("XM_NVR_BASE_URL"),
    xmCameraBaseUrl: getOptionalEnv("XM_CAMERA_BASE_URL"),
    xmUsername: getOptionalEnv("XM_USERNAME"),
    xmPassword: getOptionalEnv("XM_PASSWORD"),
    sampoNvrBaseUrl: getOptionalEnv("SAMPO_NVR_BASE_URL"),
    sampoCameraBaseUrl: getOptionalEnv("SAMPO_CAMERA_BASE_URL"),
    sampoUsername: getOptionalEnv("SAMPO_USERNAME"),
    sampoPassword: getOptionalEnv("SAMPO_PASSWORD"),
    pollIntervalSec: getNumberEnv("POLL_INTERVAL", 300),
    pollJitterSec: getNumberEnv("POLL_JITTER_SECONDS", 60),
    pollBucketCount: getNumberEnv("POLL_BUCKET_COUNT", 60),
    pollMaxConcurrency: getNumberEnv("POLL_MAX_CONCURRENCY", 32),
    pollSiteConcurrency: getNumberEnv("POLL_SITE_CONCURRENCY", 6),
    pollRateLimitPerSec: getNumberEnv("POLL_RATE_LIMIT_PER_SEC", 50),
    pollStaggerEnabled: getBooleanEnv("POLL_STAGGER_ENABLED", true),
    notifyNonCritical: getBooleanEnv("NOTIFY_NON_CRITICAL", false),
    apiTimeoutMs: getNumberEnv("API_TIMEOUT_MS", 3000),
    apiRetries: getNumberEnv("API_RETRIES", 3),
    apiBackoffMs: getNumberEnv("API_BACKOFF_MS", 300),
    eventQueueMax: getNumberEnv("EVENT_QUEUE_MAX", 1000)
  };
}
