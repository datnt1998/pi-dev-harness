---
name: release-check
description: "Run a risk-based independent gate before releases, dependency changes, data migrations, destructive operations, or security-sensitive changes. Use when work may affect production, credentials, privacy, rollback, compatibility, or supply-chain trust; skip routine local-only UI/text changes."
---

# Release Check

Select only applicable risk dimensions; do not force a heavyweight checklist onto routine changes.

## Dimensions

- Dependency/source/version/license and package trust.
- Destructive or irreversible behavior; rollback and backup.
- Secrets, credentials, privacy, network/trust boundaries.
- Data/schema migration compatibility and rollback.
- Release tests/build, notes/version/tag, deployment trigger, smoke evidence.

## Procedure

1. Establish the exact fixed point and intended release/change.
2. Read current repository evidence; never trust memory for deploy mechanics.
3. Inspect only applicable dimensions.
4. Run or verify the smallest decisive checks.
5. Separate blockers, deferred risks, and unverified evidence.
6. Use `../engineering-workflow/references/completion-evidence.md`.

Production push/deploy/publish always requires explicit approval even when every check passes.

## Report

Pass: one terse line. Otherwise list blockers first, then deferred/unverified risks and exact next action. No technical transcript.

## Known limitations

Risk assessment is based on changed files and declared dependencies; undocumented side effects or cross-service impacts outside the repository are invisible to the gate.


## Known limitations

The gate is advisory and evidence-based on the local repo state; it cannot verify external systems, credentials, or runtime production behavior beyond what the diff and docs show.
