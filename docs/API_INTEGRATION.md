# EverNet API Integration Guide

更新日期：2026-02-17

## 服務與 Base URL

| 服務 | Base URL (預設本機) | 主要用途 |
| --- | --- | --- |
| ai-orchestrator | `http://localhost:3011` | AI 事件入口、站台事件查詢 |
| reporting-engine | `http://localhost:3014` | 各類報表/排名、回放查詢 |
| web-dashboard | `http://localhost:3016` | 控制台 UI 與摘要 API |
| connector-vss | `http://localhost:3013` | 站台輪詢狀態（供健康度用） |
| notification-gateway | `http://localhost:3010` | 內部通知中繼 |
| 其他運維 | 各服務 `/healthz`, `/metrics` | 健康檢查與 Prometheus 指標 |

> 服務與連接埠來源：`.env.example`。若在雲端或 K8s，請替換成對應 Ingress / 服務網域。

## 共通規範

- **Access Class**：OpenAPI 以 `x-access-class` 標註 `External | Internal | Ops`。對外整合僅使用 `External`。
- **健康檢查**：每個服務都有 `/healthz`；監控使用 `/metrics`（Prometheus 格式）。
- **錯誤處理**：未特別定義全域錯誤格式；建議依 HTTP 狀態碼處理（4xx 用戶端錯、5xx 服務端錯）。
- **安全性**：當前 OpenAPI 無認證宣告；上線前請置換成閘道/Token 保護。

## AI Orchestrator（`http://localhost:3011`）

| Method | Path | 描述 | Access |
| --- | --- | --- | --- |
| POST | `/internal/events` | 接收 AI 事件（worker -> orchestrator） | Internal |
| GET | `/api/v1/sites/{siteId}/ai-events` | 查詢站台 AI 事件，`limit`(1-200) | External |
| GET | `/api/v1/sites/{siteId}/poll-state` | 取得站台輪詢狀態 | External |

核心資料模型：`AiEvent`（`siteId`, `cameraId`, `eventType`, `severity: normal|suspect|critical`, `score`, `tsEvent`, `dedupKey`, `metadata`）。

## Reporting Engine（`http://localhost:3014`）

| Method | Path | 描述 | Access |
| --- | --- | --- | --- |
| GET | `/api/v1/sites/{siteId}/reports/anomalies` | 站台異常清單，`window` 可用 `15m/1h/4h/8h/24h` | External |
| GET | `/api/v1/sites/{siteId}/reports/top-offline` | 24h 內離線 Top 20（可調 window） | External |
| GET | `/api/v1/sites/{siteId}/reports/top-missing-recording` | 24h 內錄影缺失 Top 20 | External |
| GET | `/api/v1/sites/{siteId}/reports/accumulated-offline` | 離線累積秒數排名 | External |
| GET | `/api/v1/sites/{siteId}/playback` | 回放查詢；索引失效時可走 fallback 檔案掃描（需 `FEATURE_VMM_PLAYBACK_FALLBACK_SCAN=true`） | External |
| GET | `/api/v1/sites/{siteId}/reports/management/overview` | 管理總覽 KPI（AI 事件、critical、離線、通知成功率） | External |
| GET | `/api/v1/sites/{siteId}/reports/management/channel-performance` | 通知渠道績效（sent/failed 排序） | External |
| GET | `/api/v1/sites/{siteId}/reports/management/risk-ranking` | 攝影機風險排名（依 severity 加權） | External |

回放查詢參數：`cameraId`（必要）、`start`、`end`（ISO）、`page`（預設 0）、`pageSize`（預設 10，最大 50）。  
回傳欄位：`source: index|fallback`, `items[{ts,file,durationSec}]`, `nextPage?`, `total?`。

管理報表參數：`window` 可用 `15m/1h/4h/8h/24h/7d/30d`。  
管理報表旗標：`FEATURE_VMM_MANAGEMENT_REPORTS=true` 才會查詢資料；OFF 時回傳 `featureEnabled=false`。

## Web Dashboard（`http://localhost:3016`）

| Method | Path | 描述 | Access |
| --- | --- | --- | --- |
| GET | `/api/v1/sites/{siteId}/dashboard/summary` | 控制台摘要（離線數、AI 事件數、通知成功率等） | External |
| GET | `/app` | 前端 UI（需瀏覽器） | External |

## Connector VSS（`http://localhost:3013`）

| Method | Path | 描述 | Access |
| --- | --- | --- | --- |
| GET | `/healthz` | 輪詢/斷路器健康資訊 | Ops |
| GET | `/metrics` | Prometheus 指標（含 camera health metrics when enabled） | Ops |

> 若啟用 `FEATURE_VMS_HEALTH_MONITOR`，會產出 camera 健康狀態與 fps/drop frame/reconnect 等指標。

## Notification Gateway（`http://localhost:3010`）

| Method | Path | 描述 | Access |
| --- | --- | --- | --- |
| POST | `/internal/notify` | 內部通知入口 | Internal |
| GET | `/healthz` / `/metrics` | 運維 | Ops |

## 觀測性與運維端點

- 每個服務：`/healthz`、`/metrics`
- Fallback / 健康度相關 metrics（需對應旗標）：
  - `vmm_playback_fallback_total`, `vmm_playback_scan_duration_ms`, `vmm_playback_slow_query_total`
  - `vmm_management_report_requests_total`, `vmm_management_report_slow_query_total`
  - `vmm_camera_reconnects`, `vmm_camera_fps`, `vmm_camera_drop_frames`, `vmm_camera_last_frame_ts_ms`

## 範例請求

```bash
# 取某站台離線排名
curl "http://localhost:3014/api/v1/sites/site-a/reports/top-offline?window=24h"

# 查詢 AI 事件（前 100 筆）
curl "http://localhost:3011/api/v1/sites/site-a/ai-events?limit=100"

# 啟用回放 fallback（需先設環境變數）
FEATURE_VMM_PLAYBACK_FALLBACK_SCAN=true \
curl "http://localhost:3014/api/v1/sites/site-a/playback?cameraId=cam-1&page=0&pageSize=10"
```

## 導入建議

1. **網路與安全**：將 `External` 路徑置於 API Gateway 並加上認證（JWT / mTLS）；`Internal` 只允許內網。
2. **版本控制**：OpenAPI 位於 `openapi/*.yaml`；外部整合可直接引用這些檔案生成客戶端。
3. **監控**：將 `/metrics` 納入 Prometheus；對回放與健康指標設告警（如慢查詢、fallback 次數激增）。
4. **旗標**：新功能（播放 fallback、攝影機健康）均預設 OFF，請在環境變數顯式開啟後再調用相關指標/行為。

## 文件與契約檢查命令

- 產出 API HTML/PDF 手冊：`corepack pnpm run api-docs:build`
- 契約檢查（OpenAPI vs 服務路由）：`corepack pnpm run contract:test`
- 全量驗證（含上述）：`node scripts/verify.mjs`
