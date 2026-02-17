export type Severity = "normal" | "suspect" | "critical";

export type GatewayMode = "text" | "cards";

export interface AiEvent {
  id?: string;
  siteId: string;
  cameraId: string;
  eventType: string;
  severity: Severity;
  score: number;
  tsEvent: string;
  dedupKey: string;
  metadata?: Record<string, unknown>;
}

export interface AiArtifact {
  id?: string;
  eventId?: string;
  type: string;
  storagePath: string;
  metadataJson?: Record<string, unknown>;
}

export interface NotifyCardLink {
  text: string;
  url: string;
}

export interface NotifyCard {
  type: "summary" | "top20" | "links";
  title: string;
  body: string;
  links?: NotifyCardLink[];
}

export interface NotifyRequest {
  siteId: string;
  severity: Severity;
  title: string;
  message: string;
  channels?: string[];
  card?: NotifyCard;
  sourceService?: string;
  metadata?: Record<string, unknown>;
}

export interface CircuitBreakerState {
  state: "closed" | "open" | "half_open";
  failureCount: number;
  lastFailureAt?: string;
  lastLatencyMs: number;
}

export interface PollState {
  siteId: string;
  component: string;
  severity: Severity;
  nextPollAt: string;
  lastLatencyMs: number;
  consecutiveFailures: number;
  loadShedMode: boolean;
}
