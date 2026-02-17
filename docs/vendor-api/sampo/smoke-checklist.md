# SAMPO Smoke Checklist (Connector-VSS)

Use this checklist to validate SAMPO NVR + IPCAM probing in a staging environment.

## 1) Preconditions

- Connector service is up: `http://localhost:3013/healthz`
- Feature flag enabled in runtime env:
  - `FEATURE_VMS_SAMPO_CGI=true`
- Required env values are set:
  - `SAMPO_NVR_BASE_URL`
  - `SAMPO_CAMERA_BASE_URL`
  - `SAMPO_USERNAME`
  - `SAMPO_PASSWORD`

One-command smoke entry:

```bash
corepack pnpm run smoke:sampo
corepack pnpm run smoke:sampo:private
```

PowerShell entry:

```powershell
corepack pnpm run smoke:sampo:ps1:local
corepack pnpm run smoke:sampo:ps1:example
corepack pnpm run smoke:sampo:private:ps1:local
```

## 2) Direct Endpoint Checks

### NVR CGI/API (Dahua-compatible baseline)

```bash
curl -k -u "$SAMPO_USERNAME:$SAMPO_PASSWORD" "$SAMPO_NVR_BASE_URL/cgi-bin/magicBox.cgi?action=getSystemInfo"
curl -k -u "$SAMPO_USERNAME:$SAMPO_PASSWORD" "$SAMPO_NVR_BASE_URL/cgi-bin/eventManager.cgi?action=getEventIndexes"
curl -k -u "$SAMPO_USERNAME:$SAMPO_PASSWORD" "$SAMPO_NVR_BASE_URL/api/serverInfo"
```

Expected:
- At least one endpoint returns HTTP 200.
- Response body is non-empty.

### IPCAM CGI/API

```bash
curl -v -u "$SAMPO_USERNAME:$SAMPO_PASSWORD" "$SAMPO_CAMERA_BASE_URL/cgi-bin/magicBox.cgi?action=getSystemInfo"
curl -v -u "$SAMPO_USERNAME:$SAMPO_PASSWORD" "$SAMPO_CAMERA_BASE_URL/cgi-bin/viewer/video.jpg" -o snapshot.jpg
curl -v -u "$SAMPO_USERNAME:$SAMPO_PASSWORD" "$SAMPO_CAMERA_BASE_URL/api/serverInfo"
```

Expected:
- At least one endpoint returns HTTP 200.
- If `video.jpg` is returned, output file size > 0.

## 3) Service-Level Checks

```bash
curl http://localhost:3013/healthz
curl http://localhost:3013/metrics
```

Expected:
- `/healthz` responds with service metadata and no crash.
- `/metrics` includes provider probe metrics for `provider="sampo"`.

## 4) Failure Scenarios

### Auth failure
- Use wrong password.
- Expected: no service crash; provider probe records failure.

### Timeout/offline
- Block route to NVR/IPCAM or set wrong host.
- Expected: no crash; retry/backoff path triggers and result is degraded/offline.

### Missing config
- Clear `SAMPO_NVR_BASE_URL` and `SAMPO_CAMERA_BASE_URL`.
- Expected: fail-soft result; no unhandled exception.

## 5) Rollback

- Set `FEATURE_VMS_SAMPO_CGI=false`.
- Restart connector-vss.
- Confirm behavior returns to non-SAMPO path.

## 6) Validation Record (fill in)

- Firmware model/version:
- NVR endpoint success:
- IPCAM endpoint success:
- Avg probe latency:
- Notable errors:
- Decision (go/no-go):
