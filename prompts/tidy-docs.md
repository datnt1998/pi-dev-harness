---
description: Sweep repo docs/working files for lifecycle drift and propose a keep/reconcile/delete list under "the codebase is truth"
argument-hint: "[area or focus]"
---

Use `/skill:repo-hygiene` to run a documentation/artifact-lifecycle sweep.

Focus: $ARGUMENTS

Run the sweep: inventory → classify (plan/report/spec/ADR) → detect drift against the code and ADRs → decide keep/reconcile/delete. For a large repo, fan out fresh-context reviewers per doc area and let the parent merge into one list.

Then stop and present a single **keep / reconcile / delete** list with per-file evidence (file → class → verdict → reason). Do not delete or edit anything yet:

- Never auto-delete a git-tracked doc without approval; flag any gitignored deletion as non-recoverable.
- Reconcile a drifted living spec to match the code; supersede an ADR only with a new ADR.
- Keep the always-loaded layer (agent instructions, ADRs, context doc) thin.

Apply only the approved actions, then report terse counts (kept / reconciled / deleted) and any file left `unknown`.
