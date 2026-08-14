# Harness Discipline Foundations

Status: draft
Owner: harness maintainer

## Problem

The harness grew by feature accretion: eight extensions, nineteen skills, twenty-nine
prompts, and nineteen pure `lib/` modules. Each piece is individually tested, but the
cross-cutting disciplines that keep a growing harness honest are not yet mechanical:

1. **Opaque ids are bare strings.** Ticket ids, batch ids, lease ids, decision keys,
   pilot-row ticket references, and run-track event ids are plain `string`s across
   `ticket-runner-state`, `run-track-v1`, and the pilot ledger. Nothing prevents
   comparing a ticket id against a lease id, or threading a batch id where a ticket id
   belongs; the compiler cannot see the mistake.
2. **Config loading is per-site, silently lenient.** Five settings files —
   `autocompact.json`, `harness-tui.json`, `provider-usage.json`, `session-gc.json`
   (read by their four extensions) and `quota-gate.json` (read by
   `lib/provider-usage-fetch.ts`) — are each parsed with their own try/catch: malformed
   JSON or an unknown field degrades to defaults with no signal, so a typo in a settings
   file silently changes behavior.
3. **Persisted state invariants live only in a silent boolean.** The batch state —
   persisted as append-only custom entries in the session log — is validated by
   `isBatchRunState`, which returns a bare `false` for any violation: nothing names
   which rule broke, and the validator mixes structural checks with relationship checks
   in one long predicate. There is no single place that states, in named rules, what the
   state must always satisfy.
4. **Doc contracts are voluntary.** Extension and skill READMEs carry ad-hoc structure;
   nothing enforces that a shipped capability documents its settings surface and known
   limitations, so the next maintainer discovers them by reading source.
5. **Decisions without a future state.** `docs/adr/` holds only accepted records;
   rejected and proposed ideas die in `.scratch/` or in conversations, so a later
   maintainer re-litigates settled questions with no record of why they were closed.

These are foundations, not features: each is small, independent, and pays back on every
later change.

## Requirements

### R1 — Branded opaque identifiers

- **R1.1 — Brand primitive.** `lib/brand.ts` exports a zero-dependency nominal typing
  primitive: `type Branded<Tag extends string> = string & { readonly __tag: Tag }`, plus
  `brand<Tag>()` constructor and `unbrand()` eraser helpers. No runtime cost beyond the
  cast; the tag never exists at runtime.
- **R1.2 — Apply at persistence boundaries.** Branded types replace bare strings for the
  ids that cross state-file or protocol boundaries:
  - `TicketId`, `BatchId` in `lib/ticket-runner-state.ts` and `lib/ticket-runner-input.ts`;
  - `LeaseId` in the writer-lease evidence in `lib/team-orchestration-protocol.ts`;
  - `TicketId` reused for the `ticketId` references in `lib/team-orchestration-pilot.ts`
    pilot rows;
  - event ids in `lib/run-track-v1.ts`.
  `WorkerLaneControl` and lane values gain nothing: a lane is a closed union literal
  (`"worker" | "parent"`), not an id family. Internal local variables stay plain
  `string`; branding applies where two different id families could be confused.
- **R1.3 — Parse-time branding.** State parsing (`isBatchRunState` and peers) brands on
  read and `unbrand` only at serialization/display boundaries. A string from outside the
  system never enters a branded slot without passing a parse that validates its shape.
- **R1.4 — No runtime validation added.** Branding is a compile-time discipline only; it
  introduces no new runtime checks, and existing runtime shape checks stay exactly as
  they are.

### R2 — Centralized fail-loud config loading

- **R2.1 — One loader.** `lib/config-load.ts` exports `loadJsonSettings<T>(opts)` with:
  the absolute file path, a `label` for messages, and a `validate(raw): T` callback.
  Absent file returns the documented default (this is the only silent case). Malformed
  JSON throws with the path and parse position. A present file whose content fails
  validation throws with the path, the offending field, and what was expected.
- **R2.2 — Sites migrate.** The four extension settings readers (`autocompact`
  — including its global-plus-project layered read — `harness-tui`, `provider-usage`,
  `session-gc`) and the `quota-gate.json` reader in `lib/provider-usage-fetch.ts` move
  through this loader, each supplying a validator that names its known fields. Unknown
  top-level fields fail validation (a typo must not masquerade as a missing setting).
- **R2.3 — Error surfacing.** An extension whose config fails load reports the loader's
  message once at activation (Pi has no crash-safe channel mid-load; a clear console/log
  line plus a disabled-but-named extension is the behavior), then stays off rather than
  running on guessed values.
- **R2.4 — Non-settings JSON untouched.** Reads that are not harness settings —
  `package.json`, foreign `status.json` files, workspace `tsconfig` maps — keep their
  tolerant reads; they are facts about other systems, not our config.

### R3 — State invariants as an executable module

- **R3.1 — Invariant module.** `lib/invariants.ts` exports named assertion functions,
  each taking a state object and returning `void` or throwing an `InvariantError` naming
  the violated rule. Pure functions, no I/O.
- **R3.2 — Ticket state invariants.** `assertBatchRunState(state)` states in named
  rules what `isBatchRunState` already enforces silently: ticket ids unique; dependency
  edges name existing tickets and no self-edges; at most one `in_progress` ticket
  (exactly one while a writer lease is open); accepted reports match their ticket id and
  never exceed its attempt count; decision index entries name existing tickets; the
  last-closed lease matches the history tip. The invariant module **re-expresses** these
  as named errors rather than adding parallel logic; any genuinely new rule ships only
  with a violating fixture proving `isBatchRunState` does not already reject it.
- **R3.3 — Worker-visible-from-persisted.** `assertWorkerInputDerivable(state, ticket)`:
  everything the batch runner hands a worker — the ticket source location named by
  `state.source`, the `fingerprint` binding, dependency statuses, prior evidence, and
  the attempt count — is derivable from the persisted state plus the source path the
  state names; no caller-side memory contributes. The assertion verifies the derivation
  inputs are present in the state, not their content quality.
- **R3.4 — Wired at the extension's persistence seam.** Persistence is the extension's
  `persist()` appending the state as a session custom entry, so assertions run there
  before the append (fail the append, surface the named error) and in `reconstruct()`
  after parsing. The load path keeps the existing append-only recovery policy —
  "never roll back past a corrupt newest snapshot" — intact: when the newest snapshot
  fails the invariants, the current partial-candidate rebuild remains the behavior and
  the named error is logged, not substituted with a hard refusal. Tests that build
  fixture states keep working.
- **R3.5 — One rule per line.** Each assertion is one check with a message naming the
  rule in imperative form (e.g. "exactly one ticket may be in_progress"); the test suite
  has one failing case per rule.

### R4 — Doc contracts enforced by script

- **R4.1 — Contract surface.** Every `extensions/*.ts` and every `skills/*/SKILL.md`
  must document, in its README section (README.md extensions list for extensions, the
  skill file itself for skills): the settings/configuration surface it reads (or an
  explicit "no configuration"), and a "Known limitations" statement (explicit "none
  known" allowed).
- **R4.2 — Enforcing script.** `scripts/verify-doc-contracts.mjs` (node, no deps)
  checks both surfaces and exits non-zero with a per-file report of what is missing. It
  is added to `npm test` as a separate test file so the existing runner picks it up.
- **R4.3 — Fix the gap as part of the ticket.** The README extension entries and skill
  files currently missing either surface gain them in the same change; the script must
  pass on the tree it ships with.

### R5 — Decision records with a future and a past

- **R5.1 — Statuses.** ADR frontmatter `status` accepts `proposed`, `accepted`,
  `rejected` (new alongside the current accepted-only tree). A `rejected` record states
  the rejected option and the reason in one short section; a `proposed` record is a
  draft open to amendment.
- **R5.2 — Format gate.** The doc-contract script (R4) or a sibling check asserts every
  `docs/adr/*.md` has valid frontmatter status and a title; numbering stays sequential
  and never reused.
- **R5.3 — Promotion rule.** A decision leaves `proposed` only by moving to `accepted`
  or `rejected` with an amendment entry; edits after acceptance follow the existing
  signed-amendment practice. Rejected records are frozen: never edited, only referenced.
- **R5.4 — `.scratch/` relationship unchanged.** `.scratch/` remains the working
  scratch area; the new statuses give durable homes only to decisions that outlive their
  scratch session.

### R6 — Output snapshots for deterministic commands

- **R6.1 — Scope.** `/review-map` and `/gc dry-run` are the two deterministic,
  user-visible command surfaces. Each gains a fixture-based test that runs the pure core
  (or the extension's render function) over a committed fixture input and compares the
  emitted text against a committed expected output, byte for byte.
- **R6.2 — Fixtures are synthetic.** Inputs are small hand-built trees (a handful of
  files for review-graph; a fake file list for gc-core), never snapshots of real
  sessions or repos. Expected outputs are reviewed when recorded; a diff in expected
  output is the regression signal, not noise to re-record.
- **R6.3 — Existing tests stay.** These are additions to the current per-core test
  files, not replacements; the shape/behavior tests keep their place.

## Non-goals

- No framework layer, plugin composition system, or runtime registry; Pi's extension
  model remains the only integration mechanism.
- No coverage percentage gate, no CI pipeline, no release automation.
- No sandbox semantics; `safe-ops` keeps its guardrail scope.
- No i18n, no bilingual docs, no documentation site.
- No changes to skill content, prompt content, or workflow semantics beyond the doc
  surfaces named in R4.

## Risks

- **R1 churn.** Branding persistence ids touches the two most state-heavy modules;
  serialization output must remain byte-identical (brands erase at runtime). The
  existing persisted-state fixtures are the regression net — they must parse unchanged.
- **R2 activation errors.** A config file that used to silently degrade now disables an
  extension with a message. This is the intent, but a user upgrading with a slightly
  malformed file will see new failures; the loader message must say exactly which field
  to fix.
- **R3 over-assertion.** An invariant too strict breaks legitimate resume scenarios
  (interrupted mid-write states). Each rule must have a real violating fixture before it
  ships, the write-side assertions run on in-memory state the code itself just produced,
  and the load side never replaces the append-only rebuild fallback with a hard refusal.
- **R6 snapshot brittleness.** Output formatting changes will churn expected files; the
  rule is to review the diff and re-record deliberately, keeping the expected files small
  so review is cheap.

## Order of work

Independent lanes: R1 and R2 (no overlap), R4 and R5 (docs surface), and R6 (its two
command surfaces touch neither ids nor settings). R3 depends on R1 (ticket id branding
lands first).
