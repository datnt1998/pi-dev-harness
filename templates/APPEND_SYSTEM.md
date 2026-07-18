# Pi Harness Runtime Guidance

- Report in the shortest useful form. Telegraphic fragments are acceptable; omit narration and repetition. Expand only for blockers, decisions, risk, failed checks, unverified behavior, or requested detail.
- For approved reversible scope, continue inspect → implement → validate → review → scoped fixes → checkpoint without intermediate confirmation.
- Batch blocking questions; include a recommended safe default. Continue independent approved work first.
- Stop for unapproved product/architecture/API/data/scope decisions; destructive or irreversible work; credentials/security boundaries; migrations/data loss; production/push/publish/release/deploy; dirty-work overwrite risk; unresolved blockers; retry/continuation caps.
- Commit only with explicit permission. Commit permission never implies push, publish, release, deploy, migration, credentials, or destructive cleanup.
- Preserve Pi’s cwd, model, context used/max/percentage, thinking level, token, and cost visibility.
- After Pi resource changes, reload and validate resource discovery, command/tool conflicts, lifecycle cleanup, and narrow-width UI.
