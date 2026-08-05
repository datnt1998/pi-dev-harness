# Artifact Lifecycle

Everything in the repository is context. An agent greps every file as equally
authoritative and cannot tell a live file from a dead one. A wrong or stale file
is worse than a missing one. Before creating any document, assign its lifecycle
and name who deletes it.

## Lifecycle classes and authority

- **Plan** — ephemeral, single-use. The durable decision belongs in an ADR or a
  living context doc; the plan file itself is disposable. Delete when done; do
  not keep "just in case".
- **Report / analysis output** — do not commit. Throwaway analysis is
  session-only. Persistent batch/run state (manifests, readiness) may stay local
  across sessions but stays uncommitted and is never auto-deleted mid-run.
- **Spec** — living authority for intended behavior and acceptance until the work
  is implemented or the spec is explicitly superseded. If code disagrees with an
  approved spec, treat that as an implementation finding; do not rewrite the spec
  to legitimize incomplete or buggy code.
- **ADR** — immutable authority for decision history. Change via a new superseding
  ADR, never in place.
- **Code and tests** — authority for current observable implementation.
- **`CONTEXT.md`** — authority for domain vocabulary, not requirements or implementation.

## Physical separation

Keep the always-loaded layer (agent instructions, ADRs, context doc) thin and
slow-moving — a map, not a rulebook. The codebase is the single source of truth;
comments explain WHY, not WHAT.

Route disposable and working artifacts through the canonical path contract in
`scratch-organization.md`. Cross-session working state uses one registered
`.scratch/<effort>/` directory; session-only output stays in chat, a subagent runtime
artifact directory, or that effort's `tmp/`. Do not scatter plans/reports across the
repository or create parallel `docs/plans/` conventions ad hoc. This physically
separates what the agent should read (authoritative) from what it should not
(dead or in-progress). Exception: an explicitly requested cross-session plan may
be tracked when a contract test requires it; the plan must name its deletion
trigger, and the plan plus its contract test are deleted with the final slice.

## Rules of thumb

- Assign a lifecycle, consumer, canonical path, owner, and deletion trigger before you create the file; if any is missing, do not create it.
- Search for and update the existing effort/canonical artifact before creating another file.
- Prefer deleting a finished artifact over hoarding it.
- Never resurrect a finished plan/report into an authoritative path.
- When a living spec and code diverge, identify whether implementation or intent is wrong. Reconcile the non-authoritative side, or supersede the governing authority explicitly.

This file is the *taxonomy*. For the active create-time gate, the periodic
drift sweep (inventory → classify → detect drift → keep/reconcile/delete), the
approval/escalation rules, and the subagent team pattern, use
`/skill:repo-hygiene` (or the `/tidy-docs` prompt).
