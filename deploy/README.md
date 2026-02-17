# Deploy Env Overlay Guide

This folder keeps deployment-only environment overlays that are loaded on top of `.env.example`.

## Files

- `env/connector-vss.prod.env`: production defaults for `connector-vss` vendor probes and feature flags.
- `env/scheduler.prod.env`: production defaults for `scheduler` NTP sync/server controls.

## Loading order

`docker-compose.yml` loads env files for `connector-vss` in this order:

1. `.env.example`
2. `deploy/env/connector-vss.prod.env`

Later files override earlier values.

`docker-compose.yml` loads env files for `scheduler` in this order:

1. `.env.example`
2. `deploy/env/scheduler.prod.env`

## Safe rollout procedure

1. Keep new feature flags `false` in `.env.example`.
2. Enable only required flags in `deploy/env/connector-vss.prod.env`.
3. Replace placeholder secrets before deployment:
   - `SAMPO_PASSWORD`
4. Run:
   - `corepack pnpm run deploy:env:check`
   - `docker compose config`
   - `corepack pnpm --filter @evernet/connector-vss run test`
5. Deploy and verify:
   - `http://<connector-vss-host>:3013/healthz`
   - `http://<connector-vss-host>:3013/metrics`
   - `corepack pnpm run smoke:connector`
   - `corepack pnpm run smoke:scheduler:ntp`

## Scheduler NTP rollout

1. Edit `deploy/env/scheduler.prod.env`:
   - `FEATURE_VMM_NTP_TIME_SYNC=true`
   - `NTP_SERVER_ENABLED=true` (only if LAN devices should sync from this node)
   - `NTP_UPSTREAM_HOST=time.google.com`
   - `NTP_UPSTREAM_PORT=123`
   - `NTP_SYNC_INTERVAL_MIN=1..9999`
2. Redeploy scheduler and verify:
   - `http://<scheduler-host>:3015/api/v1/sites/<site-id>/time-sync/status`
3. Optional manual time mode (temporary):
   - `POST /api/v1/sites/<site-id>/time-sync/manual` with `{ "isoTime": "2026-01-01T00:00:00.000Z" }`
4. Return to upstream mode:
   - `POST /api/v1/sites/<site-id>/time-sync/manual` with `{ "isoTime": null }`

## Rollback

- Immediate rollback: set feature flags to `false` in `deploy/env/connector-vss.prod.env` and redeploy.
- Full rollback: remove `deploy/env/connector-vss.prod.env` from `connector-vss.env_file` in `docker-compose.yml` and redeploy.
- NTP rollback: set `FEATURE_VMM_NTP_TIME_SYNC=false` and `NTP_SERVER_ENABLED=false` in `deploy/env/scheduler.prod.env`, then redeploy scheduler.
