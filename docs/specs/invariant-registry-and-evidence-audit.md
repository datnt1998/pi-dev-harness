# Invariant Registry & Evidence Audit

Status: proposed
Owner: harness maintainer

## Problem

The first discipline batch (R1–R6) established the primitives: branded ids, fail-loud
config, named state invariants, doc contracts, ADR statuses, and output snapshots. The
next layer of risk is not that individual modules are wrong, but that **cross-module
contracts are unenforced at runtime**:

1. **Invariant errors lack attribution.** `lib/invariants.ts` throws `InvariantViolation`
   with a rule name ("exactly one ticket may be in_progress") but no module name. When
   two modules share a persistence seam or when a future extension registers its own
   invariants, the error message does not say *which module's* invariant failed —
   debugging requires reading the stack trace to find the caller.
2. **No invariant lifecycle control.** All eight current rules run unconditionally.
   There is no way to disable a specific invariant set during development or debugging
   without editing source. As the number of modules grows, unconditional enforcement
   becomes a friction point for exploratory work.
3. **Evidence packets reference run-track events by locator string, but nothing
   verifies the referenced event exists.** `FindingDispositionEvidence.evidenceLocator`,
   `ReviewEvidence.evidenceLocator`, and `FixAndRereviewEvidence.fixBrief?.evidenceLocator`
   are free-form strings intended to point at a `run_track_record_evidence` tool call's
   result. Nothing checks that the locator actually resolves to an event in the session
   log. A packet could carry a fabricated or stale locator and the system would accept
   it because shape validation (`parseTeamOrchestrationEnvelope`) only checks non-empty
   string, not referential integrity.
4. **Invariants cannot be tested in isolation from global state.** The current
   `assertBatchRunState` function is a standalone export. Tests import and call it
   directly. Adding more invariant sets means either growing one function or scattering
   calls across modules with no unified test harness. Each new set needs its own ad-hoc
   wiring.

These are audit-grade disciplines: they do not add features, they make existing
features *verifiable*.

## Requirements

### R1 — Invariant registry with module attribution

- **R1.1 — Registry constructor.** `lib/invariant-registry.ts` exports an
  `InvariantRegistry` class constructed via `new InvariantRegistry(opts?)`. Constructor
  accepts optional `{ enabledModules?: Set<string> }`. No singleton; production code
  creates one instance and passes it through. Tests create fresh instances per case.
- **R1.2 — Registration.** `registry.register(moduleName: string, installer:
  (fail: InvariantFailure) => void)` adds a named invariant set. `InvariantFailure` is
  `(message: string) => never`. Installers are synchronous functions that close over
  their check logic; they do not register event listeners or perform I/O.
- **R1.3 — Attributed errors.** `registry.assert(moduleName, condition, ruleMessage)`
  is the primary check primitive. When `condition` is false, it throws
  `InvariantError(moduleName, ruleMessage)` whose `.message` reads
  `"invariant violated by \"<module>\": <rule>"`. The error carries a readonly
  `moduleName` property for programmatic filtering.
- **R1.4 — Module selection.** When `enabledModules` is provided at construction,
  `register()` silently skips modules not in the set. Omitted means all enabled. This
  allows debug-time selective disabling without source edits.
- **R1.5 — Migration.** Existing `assertBatchRunState` and `assertWorkerInputDerivable`
  in `lib/invariants.ts` are re-expressed as a `"ticket-runner-state"` registration
  using the registry's `assert` primitive. The old named exports remain as thin wrappers
  calling through the default registry instance for backward compatibility. Callers
  migrate to importing from the registry at their own pace.

### R2 — Evidence locator referential integrity

- **R2.1 — Referential integrity assertion.** A new invariant registration
  `"evidence-referential-integrity"` exports
  `assertEvidenceLocatorsResolve(envelope, eventLog)`. For every `evidenceLocator`
  string on the envelope's evidence fields (`dispositions[].evidenceLocator`,
  `reviews[].evidenceLocator`, `fixAndRereview.fixBrief?.evidenceLocator`,
  `parentImplementationAfterDelegation?.evidenceLocator`), there must exist an
  `evidence.recorded` event in the provided event log whose `evidenceId` matches the
  locator string. Missing match throws `InvariantError("evidence-referential-integrity",
  "evidence locator '<locator>' does not resolve to any recorded evidence event")`.
- **R2.2 — Locator semantics.** Matching is by exact string equality on
  `EvidenceRecordedEvent.evidenceId`. The locator is an opaque identifier produced by
  the `run_track_record_evidence` tool; this check ensures the identifier was not
  fabricated or lost between recording and envelope assembly.
- **R2.3 — Wired at the opt-in owner-adapter seam.** The assertion runs inside
  `applyEvidencedOutcomeWithRunTrack` (`lib/run-track-owner-adapter.ts`) after the
  Run Track consult decision permits and after `parseTeamOrchestrationEnvelope`
  accepts shape, using the adapter's provided `runTrack.entries` as the event log.
  The pure `applyEvidencedOutcome` path — which has no event log access — skips the
  check; callers without a Run Track context keep shape validation alone. This matches
  the existing adapter contract: Run Track consults are opt-in and never alter owner
  authority. On fail, the adapter returns a refusal with the attributed error message;
  owner state is not mutated. Document the opt-in behavior in the adapter's JSDoc.
- **R2.4 — Synthetic fixtures.** Tests construct: (a) a valid envelope + matching event
  log (pass); (b) an envelope with one locator pointing to a nonexistent evidenceId
  (fail with named locator in message); (c) an envelope with zero evidence locators
  (pass — vacuously valid); (d) an envelope where locator matches an event of the wrong
  kind (fail — only `evidence.recorded` events count).

### R3 — Test discipline

- **R3.1 — One failing fixture per rule.** Every invariant rule registered under R1–R2
  has exactly one test case that constructs a violating input and asserts the specific
  attributed error message including the module name. The test names the rule it
  exercises.
- **R3.2 — Pass cases are structural.** Pass tests verify that valid inputs do not
  throw. One pass per registration is sufficient when fail coverage is exhaustive.
- **R3.3 — Error message stability.** Tests assert the full error message string
  including the module prefix. Renaming a rule or module is a deliberate breaking
  change that updates all affected tests in the same commit.
- **R3.4 — Registry isolation.** Tests create fresh `InvariantRegistry` instances;
  no test depends on or mutates shared global state. Production singleton wiring lives
  in one file (`lib/default-invariant-registry.ts`) that is not imported by tests.

## Non-goals

- **No freeze at persist boundary.** Persist is synchronous (`structuredClone` +
  `appendEntry` in the same call frame); there is no async gap where post-clone
  mutation can corrupt persisted state. Freeze would defend against a failure mode
  that has never manifested and adds cost to every persist cycle. Revisit if a
  concrete mutation-after-persist bug surfaces.
- **No state transition timing records.** Timing data without a consumer is dead
  weight. Transition timing will be added when a tool, script, or prompt exists that
  queries it. The data shape can be designed at that time based on actual query needs.
- **No plugin composition system, dynamic loading, or runtime discovery.** The registry
  is a plain class; modules register synchronously at construction time.
- **No coverage percentage gate or CI pipeline integration** beyond `npm test`.
- **No automatic invariant generation** from types or schemas. Rules are hand-written.
- **No cross-session or cross-process enforcement.** Checks run within a single Pi
  session's lifetime.
- **No replacement of `isBatchRunState` shape validation.** The registry re-expresses
  relationship checks as named errors; structural parsing stays where it is.
- **No deep-freeze or immutable data structure library.** Out of scope.

## Risks

- **R2 evidence model coupling.** The referential integrity check ties envelope
  validation to run-track event log availability. If the event log is unavailable at
  validation time (the pure `applyEvidencedOutcome` path, or cross-session envelope
  replay), the check cannot run. Mitigation: the check lives at the opt-in adapter
  seam (`applyEvidencedOutcomeWithRunTrack`); callers without a Run Track context skip
  it and rely on shape validation alone. Document this explicitly in the adapter's
  JSDoc.
- **R1 migration surface.** Eight existing assertions must be re-expressed through the
  registry without changing behavior. Mitigation: each migration is verified by the
  existing test suite passing unchanged; the old exports remain as wrappers during
  transition.
- **Error message format lock-in.** R3.3 locks error message strings into tests.
  Renaming costs effort. Mitigation: messages are reviewed at registration time;
  renaming is rare and intentional.

## Order of work

R1 (registry) first — R2 depends on the registry for attributed errors.
R3 (test discipline) applies throughout; each requirement ships with its tests.

```
R1 ──→ R2 (evidence referential integrity)
 └──→ R3 (test discipline, continuous)
```
