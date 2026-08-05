# Spec: Wayfinder slice discipline and ticket depth

> **Lifecycle:** update or delete this spec in the same change that alters the shipped discipline content below. The codebase (skill/reference prose) is the single source of truth; this spec records intent and acceptance for the change batch.
>
> **Motivating failure (field report):** on a large wayfinder effort, one session batch-produced many long ADRs and then generated shallow execution tickets. Root causes: the wayfinder exit funnels *all* decisions into one `/to-spec` → `/to-tickets` session (context overload); nothing forbids batch-writing ADRs at session end (spec content leaks into ADRs, making them long); the readiness gate checks field presence, not depth, so paraphrase-grade tickets pass.

## Goal

When a wayfinder map closes, decisions merge onto the execution pipeline in bounded slices, ADRs stay short because they are written inline one-at-a-time, and shallow tickets are named as such by prose tells and gated to `NEEDS_DECISION` instead of `READY`.

## Non-goals

- No changes to `lib/gate-run.ts` or any runtime source: depth is judged by prose tells at the review/gate layer, never by mechanical word counts (easy to game, punishes terse-but-deep tickets).
- No numeric caps (max ADRs per session, max tickets per spec, max requirements per slice) — quality tells, not arithmetic.
- No new skills, files beyond the five edited ones, README/test changes, or new pipeline stages.
- No changes to the wayfinder ticket types, map format, fog rules, or claiming protocol.

## Requirements

- **R1 — Merge in slices (wayfinder exit).** `skills/wayfinder/SKILL.md` "Done — merging onto the main flow" is rewritten: the exit is never one aggregate `/to-spec` over all Decisions so far. The closing session groups decisions into coherent delivery slices (by bounded context, subsystem, or dependency cluster), orders the slices by dependency, and produces the spec for the **first** slice only. Each subsequent slice gets its own `/to-spec` → `/to-tickets` run in a **fresh session** (its own context budget), fed by that slice's decisions plus the map's Destination. One ticket-generation session covers one spec. The "effort turned out small" single-`/implement` shortcut survives for maps whose decisions fit one slice.
- **R2 — Inline one-at-a-time ADRs.** `skills/domain-modeling/SKILL.md` ("Offer ADRs sparingly") and `skills/domain-modeling/ADR-FORMAT.md` gain: an ADR is written at the moment its decision is locked, one decision per ADR, applying the three-part test each time. Batch-writing ADRs at session end is named as a failure tell: finding oneself writing several ADRs in a row means decisions were not recorded when made — stop and record each against its own decision context. An ADR that outgrows a short paragraph is a tell that spec/design content is leaking in: move the detail to the spec (or the wayfinder ticket's Answer), keep the ADR as decision + reason + pointer.
- **R3 — Ticket depth tells.** `skills/engineering-workflow/references/spec-and-tickets.md` (To Tickets section) gains a "Shallow-ticket tells" list: acceptance criteria that restate the title or goal; scope naming no concrete seam (no re-grepped file/symbol anchor per the existing Claim Verification rules); validation commands generic to the repo rather than specific to the change; a run of tickets with near-uniform size and phrasing (mass-generation tell). Encountering a tell mid-generation means the session's slice is too large or grounding is missing: stop, narrow to one slice, or re-ground before writing more tickets. Cross-reference R1's one-session-one-spec rule.
- **R4 — Depth check in the readiness gate.** `skills/ticket-readiness/SKILL.md` Procedure gains a manual depth-check step after the deterministic gate: a ticket exhibiting the R3 tells is downgraded to `NEEDS_DECISION` with the tell named, even when `gate-run.ts` reports it structurally READY. The deterministic gate remains authoritative for structure; the depth check is prose-level and never edits `lib/`. Cross-reference `spec-and-tickets.md` as the tells' single authority — list is not restated.

## Acceptance Criteria

1. Only the four named files change; no `lib/`, `tests/`, README, or new-file changes.
2. Single-authority holds: the tells list lives once in `spec-and-tickets.md`; `ticket-readiness` and `wayfinder` cross-reference it. ADR discipline lives in `domain-modeling` surfaces; `wayfinder` keeps pointing at `/skill:domain-modeling` without restating.
3. No numeric caps introduced anywhere in the changed prose.
4. `npm test` and `npm run pack:check` pass unchanged (354/354; no count changes).
5. Banned tokens absent from changed prose (persona/model/vendor terms per house rules).

## Risks / Edge Cases

- Over-eager `NEEDS_DECISION` downgrades could stall legitimate terse tickets: R4 requires naming the specific tell, and a terse ticket with real anchors exhibits none.
- Slice grouping is judgment: R1 gives grouping axes (bounded context, subsystem, dependency cluster) but deliberately no algorithm.

## Validation Plan

`npm test`, `npm run pack:check`; two-axis sealed review (standards + spec).
