# UIUX

## Objective

Provide a production-grade operator experience for a multi-site VMM platform with fast anomaly triage and clear operational status.

## Design Principles

1. Situation awareness first: show risk, trend, and action paths in the first viewport.
2. Site isolation visible by default: every screen must display current site context.
3. Workflow-based layout: Detect -> Analyze -> Notify -> Recover.
4. Progressive disclosure: summary first, details on-demand.
5. Action reliability: critical actions stay visible and predictable.

## Information Architecture

- Live Overview
- Event Queue
- Notification Center
- Reports
- Runbook/Operations
- Platform Health (metrics and service state)

## Main Screen Layout

1. Header region
   - Product context
   - Site switcher chips
   - Time range and freshness hints
2. KPI row
   - Offline cameras
   - AI events in 1h
   - Notification success rate
   - Circuit breaker status
3. Workflow row
   - Detect: polling severity and cadence
   - Analyze: AI processing state
   - Notify: channel quality
   - Recover: breaker and load shedding
4. Detail row
   - Recent incidents table
   - Top offline cameras ranking
   - Notification channel quality meter

## Key User Flows

### Flow A: Critical incident triage

1. Operator lands on Live Overview.
2. Reads severity from workflow and KPI cards.
3. Opens incident row from recent incidents.
4. Validates camera/event context.
5. Confirms notification dispatch status.
6. Executes recovery step and monitors breaker transition.

### Flow B: Notification quality check

1. Open Notification Center panel.
2. Inspect per-channel sent/failed ratio.
3. If degradation detected, open runbook drill.
4. Switch channel route policy and verify recovery.

### Flow C: Site handover

1. Select site via site chip.
2. Validate site-scoped data refresh.
3. Compare anomaly level and notify success.
4. Record operation note and proceed.

## Interaction Rules

1. Severity uses consistent semantic mapping:
   - normal: green
   - suspect: amber
   - critical: red
2. Site switch must never blend data across sites.
3. Empty states must explain data window and next action.
4. Every critical metric shows calculation window.

## Responsive Behavior

1. Desktop (>=1180px)
   - Full two-column detail zone
   - Four KPI cards in one row
2. Tablet (840px-1179px)
   - Two KPI cards per row
   - Workflow in two columns
3. Mobile (<840px)
   - Stacked layout
   - Sidebar converted to top section
   - Preserve action priority order

## Accessibility Baseline

1. Maintain contrast for all severity states.
2. Ensure keyboard-focus visibility for links and controls.
3. Preserve semantic headings and table labels.
4. Avoid color-only communication; include text labels.

## Current Implementation Mapping

- UI route: `/app`
- Summary API: `/api/v1/sites/:siteId/dashboard/summary`
- Health endpoint: `/healthz`
- Metrics endpoint: `/metrics`

## Next UX Enhancements

1. Incident detail drawer with timeline and ownership.
2. Role-based view presets (NOC, Site Admin, Ops Manager).
3. Saved filters and query templates.
4. Guided runbook actions from incident context.