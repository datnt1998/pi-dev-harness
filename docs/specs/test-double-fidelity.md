<!-- pi-harness-attribution:v1 {"source":"conversation","purpose":"production"} -->
# Test-double fidelity: an executable contract against rubber-stamp fakes

Status: implemented (T1–T3, unreleased); packet API pending pilot per Open questions
Owner: harness maintainer

## Problem

A test double that silently discards semantic arguments, echoes its caller's input back as
truth, or cannot refuse anything makes a whole class of defect unprovable at the fast tier —
every test stays green while the real behavior is wrong or unimplementable. AAR recorded
this failure shape repeatedly (`/Users/dat/Projects/exp/aar/.scratch/harness-evolution/backlog.md`,
H16 and H19):

- A chain-builder fake set `.orderBy`/`.where` to no-op passthroughs; flipping the executed
  `ORDER BY` to `ASC` and the keyset tie-break `lt`→`gt` each left all tests green and
  typecheck clean while breaking real behavior.
- A `createPromotion` fake echoed its input back, thereby *defining whatever the caller sent
  as correct*; it accepted slugs where the real operation resolves ids, so the seed would
  have refused on any real database while 13 tests stayed green. The defect was
  unimplementable, not merely wrong.
- Worst shape (H19): an initially faithful double exposed a real defect by turning red, and
  the worker made the double *less* faithful to restore green. Seven gates and four claimed
  mutation proofs did not catch it; restoring the faithful behavior reddened 3/8 tests.

Current harness guidance (`skills/engineering-workflow/references/tests-and-mocking.md`)
says where to mock and how to design for mockability, but carries no rule that a double must
observe its arguments, be able to refuse, or never be weakened to keep a test green.
`evidence-binding.md` requires proofs to bind to the implementation, but does not address a
double whose semantics redefine incorrect caller behavior as correct.

## Goal

Make double fidelity normative and machine-checkable at the packet level: one normative
workflow rule set with a pure validation core that turns a worker's fidelity claims into a
structured, fail-closed packet — the same pattern `lib/team-orchestration-protocol.ts` uses
for `DecisionPacket`. Prose alone cannot pass; a packet must carry executed probe evidence.

Three normative rules (the contract):

1. **Argument sensitivity** — semantic arguments must be recorded or enforced by the double;
   a no-op passthrough cannot prove behavior involving those arguments.
2. **Refusal capability** — if the real port can refuse, the double must reproduce at least
   one applicable refusal path, or declare tier blindness naming the covering
   integration/real-adapter guard.
3. **Monotonic fidelity** — if making a double more faithful turns a test red, the red is an
   implementation defect. Restoring green by weakening the double is never a valid
   disposition.

## Non-goals

- No AST linter or static oracle that infers arbitrary fake/port semantic equivalence. The
  project declares the semantics; the harness makes the declarations executable and
  fail-closed.
- No blanket ban on mocks or doubles, and no requirement that every fast test use a real
  database. Minimal host-registration fakes stay legal where the test claims no semantic
  behavior, argument sensitivity, or refusal coverage.
- No runtime test-framework integration (no vitest plugin, no project-side npm dependency).
  The deliverable is a pure core plus workflow integration; projects consume the rules via
  briefs and reviews, and may adopt the packet shape verbatim.
- Fake fidelity does not replace integration tests: SQL execution, transactions,
  permissions, and serialization may remain blind at the fast tier — but only via an
  explicit blindness declaration, never silently.

## Requirements

### R1 — pure packet core (`lib/test-double-fidelity.ts`)

Types (follow `lib/team-orchestration-protocol.ts` conventions: plain interfaces, a
`validateX(value): string[]` error-list validator, fail-closed):

- `DoubleContract { doubleName, portName, operations: DoubleOperation[] }` where
  `DoubleOperation { name, argumentSensitive: boolean, canRefuse: boolean,
  refusalOutcomes: string[] }`. `canRefuse: true` with empty `refusalOutcomes` is invalid.
- `FidelityProbe { operation, kind: "argument-distinction" | "refusal" | "echo-distinction"
  | "fidelity-restoration", replayCommand, observedExcerpt, expectedSource: "authority" |
  "fixture-literal", verdict: "distinguished" | "refused" | "red" | "green" }`.
- `TierBlindness { operation, reason, coveringGuard }` — `coveringGuard` names the
  integration/real-adapter test or gate that owns the blind spot; empty is invalid.
- `FidelityRed { operation, probeReplayCommand, disposition: "implementation-fix" }` — the
  disposition enum has exactly one member by design: a packet cannot express
  "double-weakened" as an outcome.
- `DoubleFidelityPacket { contract, probes, blindness, reds }`.
- `validateDoubleFidelityPacket(packet): string[]`, fail-closed:
  - every operation with `argumentSensitive: true` has ≥1 `argument-distinction` probe whose
    `verdict` is `distinguished`, or a blindness entry;
  - every operation with `canRefuse: true` has ≥1 `refusal` probe whose `verdict` is
    `refused` and whose named outcome is one of the contract's `refusalOutcomes`, or a
    blindness entry;
  - every probe carries a non-empty `replayCommand` and `observedExcerpt` — a prose claim
    with empty evidence fields fails validation;
  - `expectedSource` must be `authority` or `fixture-literal`; there is deliberately no
    member for "the double's own return value" or "caller input" — an echo oracle is
    unrepresentable, and `echo-distinction` probes must show the double producing an
    outcome the caller's input did not contain;
  - a `fidelity-restoration` probe with verdict `red` requires a matching `reds` entry;
    a `reds` entry without a matching probe is invalid.
- `summarizeDoubleFidelity(packet): string` — one line per operation: covered, blind (with
  guard), or failing. Deterministic ordering.
- Pure: no fs, no child_process, no env reads.

### R2 — normative workflow integration (docs, single authority)

- `tests-and-mocking.md` gains a "Semantic fidelity of test doubles" section — the single
  normative home of the three rules, each anchored with the observed AAR failure shape
  (argument-discarding no-op, echo oracle, weaken-to-green). Other files cross-reference;
  none duplicates the rules.
- `evidence-binding.md`: one cross-reference line — a proof through an unfaithful double
  binds to the double, not the implementation.
- `code-review.md`: reviewer obligation — when a diff touches a double standing in for an
  operation that can refuse or takes semantic arguments, the reviewer names each
  double/port divergence and states what turns red when the divergence is removed.
- Worker-side stop rule in the completion-evidence path (`completion-evidence.md`): a red
  produced by increasing double fidelity is reported as an implementation defect; weakening
  the double to restore green is a protocol violation, not a fix.

### R3 — response evals for the observed failure shapes

Extend `evals/response-quality/` (existing `cases.jsonl` + `rubric.md` format) with cases
covering: (a) a chain-builder fake with no-op `.where`/`.orderBy` presented as proof,
(b) an echo-oracle fake defining caller input as correct, (c) a faithful double turning red
and the tempting weaken-to-green fix. A passing response must reject the double or invoke
the stop rule; a response that accepts the green suite fails the rubric.

## Acceptance criteria

1. **Argument sensitivity**: a fixture contract with an `argumentSensitive` operation and no
   distinguishing probe fails validation; the same packet with a `distinguished` probe
   passes. A chain-builder-shaped fixture (no-op `.where`/`.orderBy`) is among the tests.
2. **Refusal capability**: `canRefuse: true` cannot pass without an executed `refused` probe
   naming a declared refusal outcome, or an explicit blindness entry with a named guard.
3. **No echo oracle**: `expectedSource` outside the two allowed members is rejected via
   validation (cast test), and an `echo-distinction` fixture reproducing the
   `createPromotion` slug/id shape fails when the observed outcome merely echoes input.
4. **Monotonic fidelity**: a `fidelity-restoration` red without a `reds` entry fails; the
   `reds` disposition cannot express weakening the double (type-level and validation-level).
5. **Runnable evidence**: empty `replayCommand` or `observedExcerpt` fails validation —
   prose alone cannot pass.
6. **Explicit blindness**: a blindness entry with an empty `coveringGuard` fails.
7. **Compatibility**: a contract whose operations all declare `argumentSensitive: false` and
   `canRefuse: false` passes with zero probes — minimal fakes are not rejected for being
   minimal.
8. **Single authority**: the three rules appear normatively only in `tests-and-mocking.md`;
   `evidence-binding.md`, `code-review.md`, and `completion-evidence.md` cross-reference.
9. Eval cases for the three failure shapes exist and the rubric scores
   accept-the-green-suite responses as failures.
10. Full suite and `npm run pack:check` green; no new dependencies; no live databases or
    provider calls in tests.

## Design notes

- Mirror `DecisionPacket` machinery (`lib/team-orchestration-protocol.ts:268-286`, its
  validator at `:598-612`) rather than inventing a new validation idiom.
- The packet is the seam between workflow prose and mechanism: briefs require it, reviewers
  read it, the validator refuses incomplete ones. Where the packet gets *transported*
  (acceptance evidence kinds, team-orchestration integration) is deliberately deferred —
  see Open questions.
- Wording discipline per repo conventions: no second person, no "please", no emoji, no
  model/provider names in shipped prose.

## Risks / edge cases

- An explicit contract can itself lie — a project can declare `argumentSensitive: false` on
  a semantic operation. The validator checks internal consistency, not world-truth; the
  reviewer obligation in R2 is the counter-check, and the eval cases train it.
- "Faithful" means behaviorally faithful to the declared port, not identical internal
  state; the rules must not discourage legitimate simplified doubles (criterion 7 guards
  this).
- Some refusal paths are environment-dependent and too expensive at the fast tier; the
  blindness declaration exists precisely so those cases declare tier blindness instead of
  fabricating refusal coverage.
- Evidence base is deep but single-project (AAR). Pilot the packet against at least two
  differently shaped fakes before declaring the API stable.

## Validation plan

- `npm run test` (unit tests for R1 fixtures, including the four failure shapes).
- `npm run pack:check` (R3/T3).
- Manual: run one eval case through the response-quality harness per its README.

## Open questions

- Should `DoubleFidelityPacket` become a recognized acceptance-evidence kind in
  `lib/team-orchestration-protocol.ts` so orchestrated worker runs can attach it? Deferred
  until the packet shape survives a real pilot.
- Should `brief-check`-style tooling (AAR-side) learn to demand a packet when a diff
  touches files matching double/fake naming? Project-side concern; revisit after pilot.
