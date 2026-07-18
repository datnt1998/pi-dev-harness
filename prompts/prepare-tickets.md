---
description: Validate and clean a ticket file into a gated execution manifest before batch implementation
argument-hint: "<tickets-path>"
---

Use `/skill:ticket-readiness` to gate the ticket file:

$ARGUMENTS

Steps:
1. Read the ticket source, project setup/AGENTS/CI/build manifests, and repository-native validation commands; do not assume npm. In monorepos require an unambiguous working directory per ticket/scope.
2. Resolve `/skill:ticket-readiness` on disk and run its package-relative `../../lib/gate-run.ts` exactly as documented by the skill. Do not assume a project `.pi/lib` copy and do not hand-classify.
3. Apply only allowed mechanical auto-fixes and record each change.
4. Write `.scratch/<batch>/execution-manifest.md` (with the fingerprint header) and `.scratch/<batch>/readiness-report.md`.
5. Ask one deduplicated question batch for NEEDS_DECISION tickets; report blockers without inventing behavior. Independent runnable work may proceed.

Return one terse status line on success; expand decisions, blockers, auto-fixes, and artifact paths only as needed.
