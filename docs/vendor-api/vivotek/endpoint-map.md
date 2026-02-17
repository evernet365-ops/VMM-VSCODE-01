# VIVOTEK Endpoint Map

Use this file as the normalized endpoint index for connector integration.

## NVR API

- Source file: `docs/vendor-api/vivotek/nvr/VIVOTEK Web API List for OneFW models.pdf`
- Cross-check source: `docs/vendor-api/vivotek/ipcam/VSS_Web_API_1.3.0.1100_IPCAM VSS.zip` (`RestfulAPIDocumentation.html`)
- Confirmed endpoint set from zip:
  - `GET /api/serverInfo` (NVR status baseline)
  - `GET /api/deviceTree` (device inventory reachability)
  - `GET /api/dataSourceList` (upstream source availability)
  - `GET /api/alarm`
  - `GET /api/event`
  - `GET /api/intervalSearch`
  - `GET /api/snapshot`
- Auth mode:
  - Documentation examples use HTTP basic auth (`curl -u admin:password ...`).
  - Connector probe should support configurable auth and TLS verify toggle.
- Notes:
  - Confirm HTTP status and response schema per firmware version.
  - Record timeout and retry policy used in connector-vss.

## IP Camera CGI/API

- Source files:
  - `docs/vendor-api/vivotek/ipcam/VAST_CGI_Document_VSS ND API.zip`
  - `docs/vendor-api/vivotek/ipcam/VSS_Web_API_1.3.0.1100_IPCAM VSS.zip`
  - `docs/vendor-api/vivotek/ipcam/VIVOTEK_WebAPI_VideoStreaming_0.7_20140822 (1).pdf`
- Health probe candidates:
  - `GET /cgi-bin/viewer/video.jpg` (snapshot availability; verified from `CGI Request Document.html`)
  - Camera stream check can use HTTP status/bytesize thresholds from snapshot pull.
- Notes:
  - Add per-model compatibility table before production rollout.
  - Define fallback behavior for timeout/offline/non-JSON responses.

## Connector Probe Defaults (proposed)

- NVR priority order:
  1) `/api/serverInfo`
  2) `/api/deviceTree`
  3) `/api/dataSourceList`
- IPCAM priority order:
  1) `/cgi-bin/viewer/video.jpg`
- Timeout/retry baseline:
  - timeout 3000ms, retries 2-3, exponential backoff
- Failure policy:
  - Any timeout/network/auth error maps to offline/degraded signal, never throw to crash poll loop.
