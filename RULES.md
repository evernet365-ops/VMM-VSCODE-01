# RULES

## System Boundaries

1. All upstream services must send notifications only to `POST /internal/notify` in notification-gateway.
2. Cross-site data queries are forbidden in service logic and SQL.
3. Provider secrets must not be stored in upstream service configs.
4. Service modules must keep single responsibility.

## Runtime Reliability

1. External calls must use timeout + retry + exponential backoff.
2. External calls must be non-blocking for server request loops.
3. DB write failures must return controlled errors and must not crash services.
4. Queue saturation must trigger load shedding.
5. Circuit breaker opens on either:
   - 5 consecutive API failures
   - API latency > 5000 ms

## Load Shedding Controls

Required env toggles:

- `ENABLE_AI=false`
- `POLL_INTERVAL=300`
- `NOTIFY_NON_CRITICAL=false`

## API and Docs

1. OpenAPI files must be updated for every public API change.
2. `/healthz` and `/metrics` endpoints are required for each service.
3. Runbook must include timeout, DB failure, webhook failure, and circuit breaker drills.

## API Boundary Enforcement

1. External UI/API traffic must enter through `web-dashboard` only.
2. Internal notify path must be `POST /internal/notify` via `notification-gateway`; no direct provider calls from upstream services.
3. Internal AI ingest path must be `POST /internal/events` via `ai-orchestrator`.
4. Site-scoped query APIs must require `:siteId` and must filter by `site_id` at query level.
5. Operational endpoints (`/healthz`, `/metrics`) must not contain business payloads or secret data.
6. Any new endpoint must declare one access class in docs and OpenAPI:
   - `External`
   - `Internal`
   - `Ops`
