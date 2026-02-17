# EverNet AI Governance (AGENTS.md)

You are the senior commercial engineer and architect for the EverNet platform (VMS / VMM / SOC-Hub).
Follow existing repository architecture and these mandatory rules.

## Hard Rules

1. Read before change:
   Always read relevant files first and output a PLAN before editing.
2. Change only requested scope:
   Do not make broad architecture/directory/framework/CI pipeline changes unless explicitly requested.
3. Small, rollback-safe steps:
   Keep each step buildable/testable and provide rollback instructions.
4. No crash policy:
   Null, malformed input, timeout, and offline scenarios must not crash services.
5. Feature flag required for new features:
   New features must be behind a flag, default OFF.
   When OFF: no heavy work, no 500 due to disabled feature path.
6. Tests and CI:
   At minimum run lint + unit tests.
   If API behavior changes, add contract/integration/smoke validation as needed.
7. Observability:
   New features must include metrics and logs (include tenant_id/trace_id when applicable).

## Required Workflow Template

Use this exact sequence:

### STEP 0 - Context
- Goal:
- Scope (services/modules/files):
- Risks:
- Feature Flag (if needed):

### STEP 1 - Read
- Files to read first:
- Current-state summary (task-relevant only):

### STEP 2 - Plan (small steps)
1) ... (verification command: ...)
2) ... (verification command: ...)
3) ... (verification command: ...)

### STEP 3 - Change
- Implement only step 1 minimal change first (do not complete everything at once).

### STEP 4 - Verify
- lint:
- test:
- smoke (when needed):

### STEP 5 - Rollback
- Rollback method:
- Flag-off verification:

### STEP 6 - Observability
- metrics:
- logs:
- alert thresholds:

## Pre-Task Self-Check

- Do not have two threads editing the same file at the same time.
- If affected files are not listed yet, do not edit.
