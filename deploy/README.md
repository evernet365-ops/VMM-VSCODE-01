# Deploy Env Overlay Guide

This folder keeps deployment-only environment overlays that are loaded on top of `.env.example`.

## Files

- `env/connector-vss.prod.env`: production defaults for `connector-vss` vendor probes and feature flags.

## Loading order

`docker-compose.yml` loads env files for `connector-vss` in this order:

1. `.env.example`
2. `deploy/env/connector-vss.prod.env`

Later files override earlier values.

## Safe rollout procedure

1. Keep new feature flags `false` in `.env.example`.
2. Enable only required flags in `deploy/env/connector-vss.prod.env`.
3. Replace placeholder secrets before deployment:
   - `SAMPO_PASSWORD`
4. Run:
   - `docker compose config`
   - `corepack pnpm --filter @evernet/connector-vss run test`
5. Deploy and verify:
   - `http://<connector-vss-host>:3013/healthz`
   - `http://<connector-vss-host>:3013/metrics`
   - `corepack pnpm run smoke:connector`

## Rollback

- Immediate rollback: set feature flags to `false` in `deploy/env/connector-vss.prod.env` and redeploy.
- Full rollback: remove `deploy/env/connector-vss.prod.env` from `connector-vss.env_file` in `docker-compose.yml` and redeploy.
