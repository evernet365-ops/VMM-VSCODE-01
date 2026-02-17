# Vendor API Assets

This folder stores original vendor API references used by EverNet integration work.

## Layout

- `docs/vendor-api/vivotek/nvr/`: VIVOTEK NVR Web API manuals
- `docs/vendor-api/vivotek/ipcam/`: VIVOTEK IP camera CGI/API manuals
- `docs/vendor-api/vivotek/raw/`: extra raw source files
- `docs/vendor-api/vivotek/samples/`: curl/postman request samples
- `docs/vendor-api/vivotek/notes/`: integration notes and compatibility records
- `docs/vendor-api/sampo/`: SAMPO integration checklists and notes
- `docs/vendor-api/dahua/raw/`: DAHUA source manuals

## Operational Notes

- Keep original file names to reduce source mismatch risk.
- Prefer adding parsed endpoint summaries into `endpoint-map.md` files.
- Use `smoke-checklist.md` per vendor before enabling flags in production.
- Do not commit credentials or internal production URLs in notes/samples.

## Smoke Commands

- VIVOTEK (Node): `corepack pnpm run smoke:vivotek`
- SAMPO (Node): `corepack pnpm run smoke:sampo`
- SAMPO (PowerShell local): `corepack pnpm run smoke:sampo:ps1:local`
- SAMPO (PowerShell example): `corepack pnpm run smoke:sampo:ps1:example`
