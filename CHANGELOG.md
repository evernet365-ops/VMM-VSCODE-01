# Changelog

All notable changes to this project are documented in this file.

## [0.1.1] - 2026-02-17

### Added

- Rollout gradient framework (`FEATURE_ROLLOUT_GRADIENT`) with scope-based sticky sampling.
- Event dedup/suppression guard (`FEATURE_VMS_EVENT_DEDUP`) and related metrics.
- Internal API protection (`FEATURE_INTERNAL_AUTHZ`) with HMAC signature validation and rate limiting.
- Diagnostic tooling: `scripts/diag-collect.mjs` and `scripts/smoke-aggregate.mjs`.
- MCP resources: `mcp/prompts.json` and `mcp/ops-diag.json`, plus prompt template `prompts/development.json`.
- Grafana dashboard `config/grafana/dashboards/ntp-sharding-playback.json`.
- Web dashboard UX v2 switch (`FEATURE_WEB_DASHBOARD_UX_V2`) and UI version telemetry metric.

### Changed

- Connector/reporting/scheduler/notification/orchestrator internal paths now support rollout and auth guard integration.
- Playback fallback/cache and site-aware sharding observability expanded.
- Environment contract, deploy guide, and MCP generation/check scripts updated.

## [0.1.0] - 2026-02-17

### Added

- Bootstrapped EverNet VMM monorepo with 8 service packages.
- Added full development stack with Docker Compose, PostgreSQL, Redis, Prometheus, and Grafana.
- Implemented shared runtime/config/types/metrics utilities.
- Added SQL-first migrations and seed data.
- Added OpenAPI specs for core VMM and notification gateway.
- Added runbook and operational docs (`ARCHITECTURE`, `RULES`, `PLANS`, `SKILLS`, `MCP`, `UIUX`).
- Added enterprise dashboard UI flow with site-scoped views and static asset pipeline.
- Added shared asset directory (`assets/brand`, `assets/icons`, `assets/tokens`, `assets/ui`, `assets/mock`).

### Changed

- Merged remote `main` history and reconciled project-level `README.md` and `.gitignore`.
