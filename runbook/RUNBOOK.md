# EverNet VMM Runbook

## 1. Fault Isolation Workflow

1. Check service liveness: `docker compose ps`
2. Check health endpoints: `curl http://localhost:3010/healthz` ... `curl http://localhost:3016/healthz`
3. Check DB state: `docker compose exec postgres psql -U evernet -d evernet_vmm -c "select now();"`
4. Check metrics: Prometheus targets page `http://localhost:9090/targets`
5. Check dashboard: Grafana `http://localhost:3000`

## 2. API Timeout Simulation

1. Set low timeout in `.env.local`:
   - `API_TIMEOUT_MS=100`
2. Restart one service:
   - `docker compose up -d --build connector-vss`
3. Verify circuit breaker transition:
   - `curl http://localhost:3013/healthz`

## 3. DB Failure Simulation

1. Stop DB: `docker compose stop postgres`
2. Trigger write path:
   - `curl -X POST http://localhost:3011/internal/events -H "content-type: application/json" -d "{...}"`
3. Confirm service does not crash and returns controlled error (503).
4. Start DB back: `docker compose start postgres`

## 4. Webhook Failure Simulation

1. Edit `config/gateway/gateway.json.example` and set route to invalid URL (`https://127.0.0.1:9/fail`).
2. Restart notification-gateway.
3. Send notification request.
4. Confirm `notification_log` has failed entries and service stays healthy.
5. Quick drill command:
   - `corepack pnpm run drill:webhook`

## 5. Circuit Breaker Drill Script

1. Trigger repeated failures against orchestrator or gateway.
2. Observe `connector-vss` health:
   - `curl http://localhost:3013/healthz`
3. Confirm `state=open` in response and in `circuit_breaker_state` table.
4. Observation helper:
   - `corepack pnpm run drill:circuit`

## 6. Load Shedding Switches

- Disable AI:
  - `ENABLE_AI=false`
- Increase poll interval:
  - `POLL_INTERVAL=300`
- Pause non-critical notifications:
  - `NOTIFY_NON_CRITICAL=false`

After updating env values, restart services:

```bash
docker compose up -d --build
```

## 7. Smoke Validation

```bash
node scripts/smoke-test.mjs
```

Expected outputs:

- all service health checks are `ok` or controlled `degraded`
- notification send flow succeeds
- orchestrator event ingest/query succeeds
- reporting anomalies endpoint returns data

## 8. DB Failure Drill Command

```bash
corepack pnpm run drill:db
```

The command stops postgres, sends a write request to orchestrator, expects 5xx behavior, and auto-recovers postgres.
