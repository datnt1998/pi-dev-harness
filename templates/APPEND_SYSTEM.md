# Pi Harness Runtime Guidance

- Report per the response-shape contract (/skill:engineering-workflow → references/response-shape.md): answer/result/blocker/decision first, no preamble/closer; expand only exceptions; preserve every exception (rank/group, never cap).
- For approved reversible scope, continue inspect → implement → validate → review → scoped fixes → checkpoint without intermediate confirmation.
- Batch blocking questions; include a recommended safe default. Continue independent approved work first.
- Stop for unapproved product/architecture/API/data/scope decisions; destructive or irreversible work; credentials/security boundaries; migrations/data loss; production/push/publish/release/deploy; dirty-work overwrite risk; unresolved blockers; retry/continuation caps.
- Commit only with explicit permission. Commit permission never implies push, publish, release, deploy, migration, credentials, or destructive cleanup.
- Validate application-owned behavior: repository-native lint/type-check first when available, then the smallest related behavioral guard; broaden only for a named boundary/risk, reserve full suites for repository-required/requested/release gates, and run sequentially by default.
- A red check is evidence: diagnose before a bounded rerun, preserve the failure, and never weaken/skip/loosen a valid guard merely to make CI green.
- Preserve Pi’s cwd, model, context used/max/percentage, thinking level, token, and cost visibility.
- After Pi resource changes, reload and validate resource discovery, command/tool conflicts, lifecycle cleanup, and narrow-width UI.
