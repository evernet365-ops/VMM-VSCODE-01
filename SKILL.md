# EverNet SKILL.md（整合版）
> 適用：VS Code + Codex 5.3  
> 專案：EverNet VMS / VMM / SOC-Hub  
> 更新時間：2026-02-17T03:43:58.721952Z

---
# 一、核心強制技能（所有專案必備）

## 1️⃣ Feature Flag Skill（強制）
- 命名：FEATURE_<DOMAIN>_<NAME>
- 預設 OFF
- OFF 不得執行重工作
- 必須有 metrics
- 必須有單元測試
- 必須可 rollback

---

## 2️⃣ Fail-Soft Skill（不死機設計）
必須包含：
- timeout
- retry 上限
- circuit breaker
- fallback
- metrics

適用：AI 推論 / RTSP / DB / 外部 API

---

## 3️⃣ Observability Skill
必須產出：
- Prometheus metrics
- 結構化 logs（trace_id / tenant_id）
- latency / error rate

---

## 4️⃣ Test First Skill（TDD-lite）
流程：
1. 先寫失敗測試
2. 修復功能
3. 補邊界測試
4. 測試全綠

---

## 5️⃣ Step-by-Step Execution Skill（強制流程）

STEP 0 — Context  
STEP 1 — Read  
STEP 2 — Plan  
STEP 3 — Change  
STEP 4 — Verify  
STEP 5 — Rollback  
STEP 6 — Observability  

---
# 二、Domain 專用技能

## VMS — Camera Health Skill
- OK / DEGRADED / DOWN / BLACKFRAME
- 狀態變更才告警（防風暴）
- fps / reconnect / drop frames metrics

---

## VMM — Playback Fallback Skill
- 索引失效 fallback
- 限制時間窗
- fallback metrics

---

## SOC-Hub — Rule Engine Shadow Mode Skill
- v1/v2 雙跑（shadow mode）
- 差異率 metrics
- 一鍵回滾 flag

---
# 三、安全與契約技能

## Contract Safety Skill
- API schema 不破壞
- 新欄位 optional
- DB migration 可 rollback

---
# 四、技能啟用矩陣圖（VMS / SOC / VMM 對應）

| 技能 | VMS | VMM | SOC |
|------|-----|-----|-----|
| Feature Flag | ✅ | ✅ | ✅ |
| Fail-Soft | ✅ | ✅ | ⚠ 視外部依賴 |
| Observability | ✅ | ✅ | ✅ |
| Test First | ✅ | ✅ | ✅ |
| Step-by-Step | ✅ | ✅ | ✅ |
| Camera Health | ✅ | ❌ | ❌ |
| Playback Fallback | ❌ | ✅ | ❌ |
| Shadow Mode | ❌ | ❌ | ✅ |
| Contract Safety | ⚠ | ⚠ | ✅ |

說明：
- ✅ 必須啟用
- ⚠ 視場景啟用
- ❌ 不適用

---
# 五、使用規範

1. 每次任務開始前貼 CODEX_START_PROMPT
2. 指定啟用技能（例如：Feature Flag + Fail-Soft）
3. 嚴格按照 Step-by-Step 流程
4. 每一步都必須可 rollback
5. 禁止一次大面積重構

---
# 六、禁止事項

- 不得跳過測試
- 不得無 Flag 上線新功能
- 不得修改 infra / CI（除非明確任務）
- 不得移除安全檢查

