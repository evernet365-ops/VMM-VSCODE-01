# ARCHITECTURE

## High-Level Components

- `connector-vss`: polling and device status sampling
- `ai-worker`: event producer
- `ai-orchestrator`: event ingest and persistence
- `notification-gateway`: only notification egress point
- `reporting-engine`: anomaly and ranking reports
- `scheduler`: periodic check and trigger workflows
- `web-dashboard`: dashboard summary API
- `shared`: shared utilities and types

## Runtime Topology

- Ports: gateway 3010, orchestrator 3011, worker 3012, connector 3013, reporting 3014, scheduler 3015, dashboard 3016.
- All services share PostgreSQL and (optionally) Redis; no cross-service DB access other than orchestrator/reporting/dashboard reading the same DB.
- Notification flows must go only through `notification-gateway` (`POST /internal/notify`).

## Data Flow

1. connector-vss and ai-worker generate signals/events.
2. ai-orchestrator persists events and artifacts.
3. ai-orchestrator and scheduler call notification-gateway.
4. reporting-engine and web-dashboard read site-scoped data from PostgreSQL.
5. all services expose metrics to Prometheus; Grafana visualizes.

## Database Schema (must include site_id)

- `site(id, name, enabled)`
- `nvr(id, site_id, name, status)`
- `camera(id, site_id, nvr_id, name, status, last_seen_at)`
- `ai_event(id, site_id, camera_id, event_type, severity, score, ts_event, dedup_key, metadata_json)`
- `ai_artifact(id, event_id, type, storage_path, metadata_json)`
- `notification_log(id, site_id, channel, severity, status, target, payload, error_message, created_at)`
- `poll_state(site_id, component, severity, next_poll_at, last_latency_ms, consecutive_failures, load_shed_mode)`
- `circuit_breaker_state(site_id, target_service, state, failure_count, last_failure_at, last_latency_ms, opened_at)`

## Isolation

- Every business table includes `site_id`.
- Every query path is site-scoped.
- Cross-site query patterns are rejected by design.

## Polling & State Machine

- Normal: poll every 3-5 minutes with +/-60s jitter.
- Suspect: poll every 1 minute.
- Critical: immediate notification path; may enter load shed.
- Transition triggers:
  - 5 consecutive API failures or latency > 5s -> breaker open, severity critical.
  - Recovery on successful probe lowers severity and closes breaker.
- State is persisted in `poll_state` and `circuit_breaker_state` for observability and restart safety.

## Reliability Controls

- Retry + backoff wrappers in shared HTTP helper
- Circuit breaker state tracking
- Load shedding toggles via env
- Health and metrics endpoints in all services

## Notification Pipeline

- Upstream services call only `notification-gateway` (`POST /internal/notify`).
- Per-site policy from `config/gateway/gateway.json.example`: `enabled`, `channels`, `rateLimitPerSitePerMin`, `gchat mode`, outbound routes.
- Cards mode supports summary/top20/links with auto-slicing (buttonsPerCard=6).
- Success/failure logged to `notification_log`; Prometheus metrics `vmm_notification_sent_total` and `vmm_notification_failed_total`.

### Alert Path (sequence)

```mermaid
sequenceDiagram
    autonumber
    participant VSS as connector-vss
    participant AIW as ai-worker
    participant AIO as ai-orchestrator
    participant NGW as notification-gateway
    participant DB as postgres
    participant CH as outbound channel

    VSS->>AIO: probe result (offline or missing_recording)
    AIW->>AIO: AI event (critical or suspect)
    AIO->>DB: write ai_event and ai_artifact
    AIO->>NGW: POST /internal/notify
    NGW->>NGW: per-site rate limit and channel policy
    NGW->>CH: outbound webhook, card, or text
    NGW->>DB: write notification_log
    NGW-->>AIO: result (sent or failed)
```

### Database ER (logical)

```mermaid
erDiagram
    site ||--o{ nvr : has
    site ||--o{ camera : has
    nvr ||--o{ camera : contains
    site ||--o{ ai_event : owns
    camera ||--o{ ai_event : emits
    ai_event ||--o{ ai_artifact : has
    site ||--o{ notification_log : records
    site ||--o{ poll_state : tracks
    site ||--o{ circuit_breaker_state : tracks

    site {
        text id PK
        text name
        bool enabled
    }
    nvr {
        text id PK
        text site_id FK
        text status
    }
    camera {
        text id PK
        text site_id FK
        text nvr_id FK
        text status
    }
    ai_event {
        uuid id PK
        text site_id FK
        text camera_id FK
        text event_type
        text severity
        text dedup_key
    }
    ai_artifact {
        uuid id PK
        uuid event_id FK
        text type
        text storage_path
    }
    notification_log {
        bigint id PK
        text site_id FK
        text channel
        text status
    }
    poll_state {
        text site_id PK
        text component PK
        text severity
        bool load_shed_mode
    }
    circuit_breaker_state {
        text site_id PK
        text target_service PK
        text state
        int failure_count
    }
```

## Observability

- Metrics: Prometheus scrapes each service `/metrics`.
- Key metrics: camera/nvr online/offline, ai_events_total, notification_sent/failed, api latency histogram, db pool gauge.
- Grafana dashboard provisioned from `config/grafana/dashboards/vmm-overview.json`.
- Health: each service exposes `/healthz`; `stack:wait` and CI smoke rely on these.

### Polling State Machine

```mermaid
stateDiagram-v2
    [*] --> normal
    normal --> suspect : probe failure\n(<5 times) or offline count >0\npoll 3-5m + jitter
    suspect --> critical : 5 consecutive failures\nor latency >5s
    suspect --> normal : probe success
    critical --> suspect : probe success
    critical --> normal : sustained success
    critical : load_shed = true\nnotify critical immediately
```

## Deployment & Ops

- Standard stack via `docker compose` with restart policies and healthchecks.
- One-command helpers:
  - `stack:up|wait|status|smoke|diag|clean`
  - `doctor`, `verify`
- Release automation: tag `v*` triggers release workflow; `release:cut` prepares changelog + tag locally.