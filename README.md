# EverNet VMM

Enterprise-ready VMM/VMS development skeleton with multi-service architecture, site isolation, notification gateway, AI orchestration pipeline, and observability stack.

## Documents

- `README.md`: project overview and quick start
- `RULES.md`: coding and operational rules
- `PLANS.md`: implementation roadmap and milestones
- `SKILLS.md`: team capability matrix and required ownership
- `MCP.md`: MCP integration and usage conventions
- `ARCHITECTURE.md`: service boundaries and data flow
- `UIUX.md`: enterprise UI/UX flow, layout, and interaction standards
- `CONTRIBUTING.md`: contribution workflow
- `SECURITY.md`: security baseline and secrets handling
- `runbook/RUNBOOK.md`: incident runbook and drills

## Stack

- Node.js 24 + TypeScript
- pnpm workspace
- PostgreSQL + Redis
- Prometheus + Grafana
- Docker Compose full stack

## Quick Start

```bash
corepack prepare pnpm@10.4.1 --activate
corepack pnpm install
docker compose up -d --build
node scripts/smoke-test.mjs
```

## Required Deliverables Included

- `docker-compose.yml`
- `.env.example`
- `assets/` (brand, icons, tokens, ui patterns, mock snapshot)
- `config/gateway/gateway.json.example`
- `openapi/vmm.yaml`
- `openapi/notification-gateway.yaml`
- `db/seed/seed.sql`
- `scripts/smoke-test.mjs`
- `runbook/RUNBOOK.md`

## Service Endpoints

- notification-gateway: `http://localhost:3010`
- ai-orchestrator: `http://localhost:3011`
- ai-worker: `http://localhost:3012`
- connector-vss: `http://localhost:3013`
- reporting-engine: `http://localhost:3014`
- scheduler: `http://localhost:3015`
- web-dashboard: `http://localhost:3016`
  - UI: `http://localhost:3016/app`
- prometheus: `http://localhost:9090`
- grafana: `http://localhost:3000`

## Local Commands

```bash
corepack pnpm run typecheck
corepack pnpm run build
corepack pnpm run test
corepack pnpm run lint
corepack pnpm run smoke
```

## CI

- GitHub Actions workflow: `.github/workflows/ci.yml`
- Runs on `push`/`pull_request` to `main`
- Pipeline steps: install -> typecheck -> build -> test -> lint
- Docker smoke workflow: `.github/workflows/docker-smoke.yml`
- Docker smoke steps: compose up -> health checks -> smoke script -> compose down

## Asset Usage

- Static assets are served by `web-dashboard` from `/assets/*`
- UI page consumes:
  - `/assets/brand/logo-lockup.svg`
  - `/assets/tokens/design-tokens.css`
  - `/assets/ui/pattern-grid.svg`
