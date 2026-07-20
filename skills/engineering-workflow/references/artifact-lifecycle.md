# Artifact Lifecycle

Everything in the repository is context. An agent greps every file as equally
authoritative and cannot tell a live file from a dead one. A wrong or stale file
is worse than a missing one. Before creating any document, assign its lifecycle
and name who deletes it.

## Lifecycle classes

- **Plan** — ephemeral, single-use. The durable decision belongs in an ADR or a
  living context doc; the plan file itself is disposable. Delete when done; do
  not keep "just in case".
- **Report / analysis output** — do not commit. Throwaway analysis is
  session-only. Persistent batch/run state (manifests, readiness) may stay local
  across sessions but stays uncommitted and is never auto-deleted mid-run.
- **Spec** — living. It must track the code. If it drifts, fix or delete it;
  never leave it stale.
- **ADR** — immutable. Change via a new superseding ADR, never in place.

## Physical separation

Keep the always-loaded layer (agent instructions, ADRs, context doc) thin and
slow-moving — a map, not a rulebook. The codebase is the single source of truth;
comments explain WHY, not WHAT.

Route disposable and working artifacts into a scratch/plans/specs area that is
gitignored and excluded from the default grep path (e.g. `.scratch/`,
`docs/plans/`, and `docs/specs/` when specs are local-only). This physically
separates what the agent should read (authoritative) from what it should not
(dead or in-progress).

## Rules of thumb

- Assign a lifecycle before you create the file; if you cannot, do not create it.
- Prefer deleting a finished artifact over hoarding it.
- Never resurrect a finished plan/report into an authoritative path.
- When a living spec drifts from code, reconcile or delete in the same change.
