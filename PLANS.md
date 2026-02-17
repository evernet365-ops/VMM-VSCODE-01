# PLANS

## Milestone 1: Foundation (Done)

- Monorepo and workspace tooling
- Service skeletons for 8 packages
- Docker compose full-stack environment
- SQL-first migration and seed
- OpenAPI baseline
- Runbook baseline

## Milestone 2: Hardening

- Add integration tests for site isolation and notify policy
- Add persistence tests for circuit breaker and poll state
- Add structured error taxonomy and error codes
- Add authn/authz for internal APIs

## Milestone 3: Production Readiness

- Implement real notification providers via adapters
- Add queue middleware (Redis stream or message broker)
- Add SLO dashboards and alert rules
- Add CI/CD pipelines for build, scan, and deploy

## Milestone 4: Scale

- Capacity validation for 128 NVR / 1024 cameras
- Polling optimization with shard scheduler
- Long-term report storage and archival
- Multi-region deployment design