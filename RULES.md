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