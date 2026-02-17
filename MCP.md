# MCP

## Purpose

This project can consume MCP resources to provide controlled context for coding agents and automation.

## Recommended MCP Resource Types

- Repository metadata and ownership map
- DB schema snapshots and migration index
- API catalog and OpenAPI summaries
- Operational playbooks and incident templates

## Integration Rules

1. Prefer MCP resources over ad-hoc file scraping when available.
2. Keep resources minimal and versioned.
3. Do not include secrets in MCP resources.
4. Validate MCP payload versions before use.

## Suggested Resource Contracts

- `repo://services`: service list, owners, ports, health URLs
- `db://schema/current`: canonical schema hash and migration list
- `api://openapi/index`: available OpenAPI specs and versions
- `ops://runbooks`: runbook index and drill scripts

## Update Process

1. Update source files.
2. Regenerate MCP resource payloads.
3. Validate against schema.
4. Publish new version with changelog entry.