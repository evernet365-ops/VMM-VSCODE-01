# Release v0.1.1 Checklist

- Date: 2026-02-17
- Branch: `main`
- Release tag: `v0.1.1`

## 1) Core refs

- `main` commit: `083e7cc` (merge: sync main with vmm/main before publish)
- `v0.1.1` tag commit: `8fbfc8d` (docs: add latest delivery summary report)

## 2) Remote status

- `origin` (`https://github.com/systec88/VMMH01.git`)
  - `main`: synced to `083e7cc`
- `vmm` (`https://github.com/evernet365-ops/VMM.git`)
  - `main`: synced to `083e7cc`
  - `v0.1.1`: synced to `8fbfc8d`
- `vmm-vscode-01` (`https://github.com/evernet365-ops/VMM-VSCODE-01.git`)
  - `main`: synced to `083e7cc`
  - `v0.1.1`: synced to `8fbfc8d`
- `vmm00` (`https://github.com/evernet365-ops/VMM00.git`)
  - fetch/push failed: `Repository not found`

## 3) Verification baseline

- `corepack pnpm run verify` passed.
- `corepack pnpm run stack:smoke` failed because port `3000` was already allocated by another process (Grafana bind conflict).

## 4) Rollback

- Feature rollback: set new feature flags to `false` and redeploy.
- Git rollback:
  - single commit: `git revert <commit>`
  - release rollback marker: use previous stable tag and redeploy.

## 5) Follow-up actions

1. Resolve `vmm00` repository URL/permission before next mirror sync.
2. Free host port `3000` or remap Grafana port and rerun `corepack pnpm run stack:smoke`.
3. Keep `origin` on moved URL (`systec88/VMMH01`) to avoid future redirect warnings.
