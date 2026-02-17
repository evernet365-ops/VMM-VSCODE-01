# CONTRIBUTING

## Branch and Commit

1. Create a topic branch from main.
2. Keep commits focused by module.
3. Use clear commit messages.

## Local Validation Before PR

```bash
corepack pnpm run typecheck
corepack pnpm run build
corepack pnpm run test
corepack pnpm run lint
```

If Docker is available:

```bash
docker compose up -d --build
node scripts/smoke-test.mjs
```

## PR Checklist

- OpenAPI updated when API changes
- SQL migration added for schema changes
- Site isolation verified
- Runbook updated when operations change
- No secrets committed