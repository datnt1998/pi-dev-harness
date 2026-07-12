---
description: Validate and clean a ticket file into a gated execution manifest before batch implementation
argument-hint: "<tickets-path>"
---

Use `/skill:ticket-readiness` to gate the ticket file:

$ARGUMENTS

Steps:
1. Read the ticket source and `package.json` scripts.
2. Run `node --experimental-strip-types .pi/lib/gate-run.ts <tickets-path>` (persisted runner calling `analyzeBatch`) to classify tickets into READY / AUTO_FIXED / NEEDS_DECISION / BLOCKED with dependency order and a source fingerprint. Do not hand-classify.
3. Apply only allowed mechanical auto-fixes and record each change.
4. Write `.scratch/<batch>/execution-manifest.md` (with the fingerprint header) and `.scratch/<batch>/readiness-report.md`.
5. Ask batched questions for NEEDS_DECISION tickets and report BLOCKED causes. Do not invent product behavior.

Return the status summary, runnable order, artifact paths, and whether `/implement-all` may proceed.
