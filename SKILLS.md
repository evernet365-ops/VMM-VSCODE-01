# SKILLS

## Core Engineering Skills Required

- Distributed system design
- Node.js and TypeScript backend implementation
- PostgreSQL schema design and query optimization
- Docker and Compose operations
- Observability with Prometheus and Grafana
- Incident response and runbook execution

## Service Ownership Matrix

- connector-vss: polling strategy, jitter, suspect/critical state machine
- ai-orchestrator: event ingest, dedup, notify handoff
- ai-worker: AI event producer and breaker-safe dispatch
- notification-gateway: routing, per-site policy, rate limiting
- reporting-engine: site-scoped analytics and ranking APIs
- scheduler: periodic reporting checks and alert triggering
- web-dashboard: site summary APIs
- shared: config, types, metrics, HTTP resilience helpers

## Delivery Skills

- OpenAPI maintenance
- SQL migration authoring
- Smoke test authoring
- Disaster simulation and drill support
