# VIVOTEK Smoke Checklist (Connector-VSS)

Use this checklist to validate VIVOTEK NVR + IPCAM probing in a staging environment.

## 1) Preconditions

- Connector service is up: `http://localhost:3013/healthz`
- Feature flag enabled in runtime env:
  - `FEATURE_VMS_VIVOTEK_CGI=true`
- Required env values are set:
  - `VIVOTEK_NVR_BASE_URL`
  - `VIVOTEK_IPCAM_BASE_URL`
  - `VIVOTEK_USERNAME`
  - `VIVOTEK_PASSWORD`
  - `VIVOTEK_CAMERA_ID` (if `VIVOTEK_IPCAM_BASE_URL` does not already include `/CamConfig/<id>`)

One-command smoke entry:

```bash
corepack pnpm run smoke:vivotek
```

## 2) Direct Endpoint Checks

### NVR API

Run with real values:

```bash
curl -k -u "$VIVOTEK_USERNAME:$VIVOTEK_PASSWORD" "$VIVOTEK_NVR_BASE_URL/api/serverInfo"
curl -k -u "$VIVOTEK_USERNAME:$VIVOTEK_PASSWORD" "$VIVOTEK_NVR_BASE_URL/api/deviceTree"
curl -k -u "$VIVOTEK_USERNAME:$VIVOTEK_PASSWORD" "$VIVOTEK_NVR_BASE_URL/api/dataSourceList"
```

Expected:
- At least one endpoint returns HTTP 200.
- Response body is non-empty.

### IPCAM CGI

If base URL already contains `/CamConfig/<cameraId>`:

```bash
curl -v -u "$VIVOTEK_USERNAME:$VIVOTEK_PASSWORD" "$VIVOTEK_IPCAM_BASE_URL/cgi-bin/viewer/video.jpg" -o snapshot.jpg
```

If base URL is camera root:

```bash
curl -v -u "$VIVOTEK_USERNAME:$VIVOTEK_PASSWORD" "$VIVOTEK_IPCAM_BASE_URL/CamConfig/$VIVOTEK_CAMERA_ID/cgi-bin/viewer/video.jpg" -o snapshot.jpg
```

Expected:
- HTTP 200
- Output file `snapshot.jpg` exists and file size > 0

## 3) Service-Level Checks

```bash
curl http://localhost:3013/healthz
curl http://localhost:3013/metrics
```

Expected:
- `/healthz` responds with service metadata and no crash.
- `/metrics` includes camera/nvr status metrics.

## 4) Failure Scenarios

### Auth failure
- Use wrong password.
- Expected: no service crash; probe marks failure/offline path.

### Timeout/offline
- Block route to NVR/IPCAM (firewall rule or wrong host).
- Expected: no crash; retry/backoff path triggers and probe result is degraded/offline.

### Missing config
- Clear `VIVOTEK_NVR_BASE_URL` or `VIVOTEK_IPCAM_BASE_URL`.
- Expected: fail-soft result; no unhandled exception.

## 5) Rollback

- Set `FEATURE_VMS_VIVOTEK_CGI=false`.
- Restart connector-vss.
- Confirm behavior returns to legacy probe path.

## 6) Validation Record (fill in)

- Firmware model/version:
- NVR endpoint success:
- IPCAM endpoint success:
- Avg probe latency:
- Notable errors:
- Decision (go/no-go):
