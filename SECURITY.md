# SECURITY

## Secrets

- Commit only `.env.example`.
- Keep runtime secrets in `.env.local` or secret manager.
- Do not expose provider tokens to upstream services.

## Data Isolation

- Enforce site-level scoping in all APIs and queries.
- Prevent cross-site joins unless explicitly approved and audited.

## Service Hardening

- Use request timeout and bounded retries.
- Avoid process crashes on downstream failures.
- Keep notification egress centralized in notification-gateway.

## Reporting Security Issues

Report vulnerabilities privately to repository maintainers. Do not open public issues for exploitable findings.