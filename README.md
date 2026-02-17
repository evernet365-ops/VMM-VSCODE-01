# EverNet VMM

Enterprise-ready VMM/VMS development skeleton with multi-service architecture, site isolation, notification gateway, AI orchestration pipeline, and observability stack.

## Documents

- `README.md`: project overview and quick start
- `RULES.md`: coding and operational rules
- `PLANS.md`: implementation roadmap and milestones
- `SKILLS.md`: team capability matrix and required ownership
- `MCP.md`: MCP integration and usage conventions
- `ARCHITECTURE.md`: service boundaries and data flow
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