---
description: Discover, gate, draft and—only after approval—execute the repository's documented release process
argument-hint: "[version|major|minor|patch|workspace]"
---

Use `/skill:release-versioning` and `/skill:release-check` for: $ARGUMENTS

1. **Discover** — identify the selected repository/workspace, version policy and sources, notes source, validation commands + working directories, commit/tag convention, remote/deploy trigger, rollback, and smoke procedure from primary repository evidence. Do not assume npm, SemVer, a `RELEASES` module, or tag-trigger behavior.
2. **Gate** — verify fixed point, clean state, and every repository-required check. Missing/contradictory release facts or failed evidence: stop after one batched question/report.
3. **Propose** — derive or validate the target version from scoped history and policy; draft notes in the project format/language.
4. **Approve** — show exact version, workspace, notes, intended file changes, commit/tag actions, and whether any later push would deploy. Wait for explicit approval before writes.
5. **Write** — update only declared authorities, rerun required checks, inspect/stage the exact diff, then create only the approved commit/tag using repository conventions.
6. **Report** — separate completed local release actions from still-unapproved push/publish/deploy/production actions. Never infer those permissions.
