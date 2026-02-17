## Summary

- What changed:
- Why this change is needed:
- Scope (services/modules affected):

## Validation

- [ ] `corepack pnpm run typecheck`
- [ ] `corepack pnpm run build`
- [ ] `corepack pnpm run test`
- [ ] `corepack pnpm run lint`
- [ ] Docker smoke passed (if applicable)

## API / Schema Impact

- [ ] No API change
- [ ] OpenAPI updated (`openapi/*.yaml`)
- [ ] DB migration added (`db/migrations/*`)
- [ ] Seed updates required (`db/seed/seed.sql`)

## Security / Isolation

- [ ] No secrets added to repo
- [ ] Site isolation preserved (no cross-site query path)
- [ ] Notification path remains via `POST /internal/notify`

## Ops / Docs

- [ ] Runbook updated (`runbook/RUNBOOK.md`) if needed
- [ ] Architecture/docs updated (`ARCHITECTURE.md`, `README.md`, etc.)

## Rollback Plan

- Rollback approach:
- Any data migration rollback required: