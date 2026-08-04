---
name: repo-hygiene
description: "Keep repository docs and working files honest: classify artifact lifecycles on creation, detect drift against the correct authority, and delete finished plans/reports instead of hoarding them. Use when creating repo docs, at handoff, or when asked to tidy stale specs/plans/reports."
---

# Repo Hygiene

Every artifact has a scoped authority. Code and tests describe current observable
implementation; an approved spec or acceptance contract describes intended behavior
until it is implemented or explicitly superseded; ADRs preserve decision history;
`CONTEXT.md` owns domain vocabulary. When artifacts disagree, identify which authority
owns the disputed claim before changing anything. A stale authoritative-looking file
is worse than a missing one, so this skill keeps non-code context honest without
rewriting requirements to match a buggy implementation.

The lifecycle taxonomy (plan / report / spec / ADR) lives in
`../engineering-workflow/references/artifact-lifecycle.md` — read it once; this skill
owns the *active enforcement and periodic sweep*.

## Two enforcement moments

### 1. Create-time gate (proactive — every agent, every doc)

Before writing any `.md` (or other non-code doc), answer three questions. If you
cannot, do not create the file.

- **Class?** plan (ephemeral) · report/analysis (session-only) · spec (living) · ADR (immutable).
- **Who deletes it, and when?** Name the trigger (e.g. "delete at handoff", "delete when ticket lands"). No owner ⇒ do not create it.
- **Authoritative or disposable?** Disposable/working artifacts go to a gitignored, grep-excluded area (e.g. `.scratch/`, `docs/plans/`, and `docs/specs/` when specs are local-only). Only ADRs, a thin context doc, and living specs earn an authoritative path.

Corollaries: the durable decision from a plan belongs in an ADR, not the plan; a
report is never committed; a living spec changes only when approved intent changes
or it is explicitly superseded—otherwise reconcile implementation to the governing
spec; an ADR changes only via a new superseding ADR.

### 2. Sweep (reactive — when artifacts accumulate)

Run when a long project drifts: many `post-*`/superseded specs, leftover plans,
committed reports, or on explicit request (`/tidy-docs`). The sweep is
**inventory → classify → detect drift → decide → escalate → apply**.

## Sweep procedure

1. **Inventory.** List non-code docs by area: authoritative (`docs/adr/**`, context
   doc, `docs/specs/**` if tracked) vs disposable (`.scratch/**`, `docs/plans/**`,
   local-only specs). Note which paths are gitignored / grep-excluded — deletions
   there are **not git-recoverable**.
2. **Classify** each file into plan / report / spec / ADR / unknown. `unknown` is a
   red flag: an unclassifiable authoritative-looking file is the core hazard.
3. **Detect drift against the correct authority.** Check implementation claims against
   code/tests, intended-behavior claims against the approved spec/acceptance source,
   decisions against ADRs, and terminology against `CONTEXT.md`. A shipped change that
   fails its approved spec is a code finding, not permission to rewrite the spec.
4. **Decide** per file, one of:
   - **keep** — living and accurate; leave it.
   - **reconcile** — update the non-authoritative side to the owning authority, or
     escalate when the authority itself must be superseded.
   - **delete** — finished plan, committed/dead report, or explicitly superseded spec.
     Prefer deleting over hoarding "just in case".
5. **Escalate before destructive action.** Batch all proposed deletions/reconciles
   into **one** keep/reconcile/delete list for approval. Never auto-delete a
   git-tracked doc without confirmation; flag gitignored deletions as
   non-recoverable. Never resurrect a finished plan/report into an authoritative path.
6. **Apply** only the approved actions, then re-verify the always-loaded layer is
   still thin and accurate.

## Team (subagent) pattern

For a large or high-stakes sweep, use `pi-subagents` for isolation and honest
drift detection:

- Fan out **fresh-context reviewers** (or `scout`), one per doc area, each answering
  only: "does this file still match the code/ADRs, and what is its lifecycle class?"
  Fresh context prevents a reviewer from rationalizing a stale doc it just wrote.
- The **parent** owns the merged inventory, the single approval list, and every
  delete/reconcile write (one writer). Children never delete files or decide scope.
- Preserve each reviewer's evidence (file → verdict → reason) in the approval list so
  the user approves against evidence, not assertion.

## Keep the always-loaded layer thin

Agent instructions, ADRs, and the context doc are a **map, not a rulebook**. Do not
push WHAT (behavior) into them — WHAT lives in the code; comments explain WHY. The
thicker this layer, the faster it drifts from the code it describes. A hygiene sweep
also trims this layer back toward a slow-moving map.

## Done criteria

Report one terse line: counts kept / reconciled / deleted, plus any file left
`unknown` (an open loop). Expand only for proposed deletions awaiting approval,
non-recoverable deletions, or unresolved drift.

## Companions

- `../engineering-workflow/references/artifact-lifecycle.md` — the lifecycle taxonomy this skill enforces.
- `/skill:domain-modeling` — where a plan's durable decision becomes an ADR/context entry.
- `/skill:engineering-workflow` — phases (`to-spec`, `handoff`) that create the artifacts this skill keeps honest.
- `/skill:git-rules` — commit the reconcile/delete sweep as its own focused change.
