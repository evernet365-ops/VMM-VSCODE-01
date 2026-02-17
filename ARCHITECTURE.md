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

## Data Flow

1. connector-vss and ai-worker generate signals/events.
2. ai-orchestrator persists events and artifacts.
3. ai-orchestrator and scheduler call notification-gateway.
4. reporting-engine and web-dashboard read site-scoped data from PostgreSQL.
5. all services expose metrics to Prometheus; Grafana visualizes.

## Isolation

- Every business table includes `site_id`.
- Every query path is site-scoped.
- Cross-site query patterns are rejected by design.

## Reliability Controls

- Retry + backoff wrappers in shared HTTP helper
- Circuit breaker state tracking
- Load shedding toggles via env
- Health and metrics endpoints in all services