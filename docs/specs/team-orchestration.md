# Evidence-Gated Serial Team Orchestration

> **Lifecycle:** living specification. Update or delete this file in the same change that alters the implemented orchestration contract. Code and tests remain the source of truth.
> **Decision:** [ADR-0001](../adr/0001-adopt-evidence-gated-serial-team-orchestration.md).
> **Status:** approved for implementation ticket design; amended by Đạt to allow consciously acknowledged degraded provider diversity with explicit warnings/provenance.

## Goal

Upgrade the harness from a mostly prose-enforced parent-writer batch loop to an evidence-gated serial team loop that improves output quality while reducing use of the strongest model for bounded implementation and fix typing.

The upgrade must:

1. preserve parent authority over reasoning, validation, finding disposition, and final acceptance;
2. make completion and escalation evidence structured, replayable, and attributable to one work unit;
3. preserve separate Standards and Spec review axes with meaningful producer/reviewer independence;
4. allow an eligibility-routed worker-writer pilot under the existing 10-assignment and T1–T5 rollback window;
5. keep one mutation owner at a time and prevent reviewers from writing;
6. keep reusable package policy provider-agnostic while allowing project-local routing.

## Context

The repository already defines strong delegation policy in:

- `skills/engineering-workflow/references/delegation-policy.md`;
- `skills/engineering-workflow/references/code-review.md`;
- `skills/engineering-workflow/references/completion-evidence.md`;
- `skills/batch-implementation/SKILL.md`;
- `skills/ticket-readiness/SKILL.md`.

The current runtime seam is thinner:

- `extensions/ticket-runner.ts` exposes `batch_report` with an outcome plus an optional free-form note;
- `lib/ticket-runner-state.ts` persists lifecycle state but does not represent the full producer, review-axis, parent-replay, claim, or decision evidence contract;
- batch instructions make the parent the sole implementation and fix writer;
- batch review combines spec, validation, and code-quality concerns even though the normative review contract separates Standards and Spec axes.

This specification makes the existing policy executable at the fan-in boundary without building a general-purpose autonomous scheduler.

## Approved architectural shape

```text
parent classifies and freezes the work unit
  → eligible parent-writer OR one bounded worker-writer obtains the lease
  → writer reports raw observations and replay recipes
  → parent observes the resulting disk state and executes the required gate
  → sealed Standards review ┐
                             ├─ parallel when safely read-only
     sealed Spec review     ┘
  → parent verifies and disposes findings
  → at most one bounded cheap fix-writer round when needed
  → focused re-review when required
  → parent records the final evidence gate
  → runtime accepts or rejects the terminal transition
```

The protocol is serial with respect to mutation. Review axes may run concurrently only after the writer lease is closed and the reviewed tree/diff is stable.

## Domain terms

These terms define the protocol and should be used consistently in implementation and tests.

- **Work unit:** one ticket attempt with stable source identity, purpose, and evidence history.
- **Control plane:** parent-owned decisions: scope, architecture, acceptance bar, validation oracle, routing, claim verification, finding disposition, final gate, escalation, and rollback.
- **Execution plane:** bounded inspection, editing, command execution, evidence collection, or accepted-fix application after the control-plane decisions are frozen.
- **Writer lease:** exclusive authority to mutate the active worktree for one bounded phase.
- **Review axis:** one independently prompted judgment surface. Required axes are Standards and Spec.
- **Evidence envelope:** the versioned machine-readable record submitted for a work-unit transition.
- **Decision packet:** the structured, replayable payload required for `NEEDS_DECISION`.
- **Parent gate:** the parent’s verdict after it observes primary evidence; it cannot be delegated to the producer or reviewers.
- **Provider identity:** the normalized provider family used to test independence. Aliases or model names served by the same provider do not count as distinct providers.
- **Independence level:** the runtime-computed relationship among the producer, Standards axis, and Spec axis: `provider-distinct`, `provider-overlap`, `axis-missing`, `combined`, `self-review`, or `unknown`.
- **Degraded continuation:** an explicit user/operator-authorized continuation when configured or actual provider diversity does not meet the target. It is warning-bearing provenance, never independent review.

## Project-local setup and warning contract

The signed rollout topology is:

| Role/axis | Temporary provider | Setup requirement |
|---|---|---|
| Producer/worker | `llmgate` | Resolve the actual producer route to `llmgate`; record fallback rather than trusting the requested route. |
| Standards review | `xai` | Configure a fresh sealed reviewer whose actual provider resolves to `xai`. |
| Spec/evidence review | `qwencloud` | Allow `qwencloud/qwen3.8-max-preview` in project-local model scope and select it explicitly for the fresh sealed Spec/evidence review call. |

Setup documentation and preflight output must explain how to configure three distinct providers without embedding this project’s concrete model names in reusable runtime policy. The current qwencloud probe resolved provider `qwencloud` and model `qwen3.8-max-preview`; the requested `:high` reasoning qualifier was not independently observable. Until effective thinking is verifiable, reporting must say so and must not invent a high-thinking claim.

Before execution, preflight displays either the satisfied topology or a warning containing: target topology; configured and actual provider identities; missing/overlapping axes; fallback/effective-model uncertainty; quality consequence; exact configuration area to change; and the explicit continue/stop action. Execution status and terminal reporting repeat the actual topology and any degradation/acknowledgment.

## Requirements

### R1. Versioned evidence protocol

The runtime must define a versioned evidence envelope for batch work-unit transitions. Version 1 must be represented explicitly and validated before state mutation.

The envelope must carry, directly or by stable locator:

- work-unit source identity, ticket ID, purpose, and attempt;
- requested role, actual model/provider identity, context mode, fallback status, and acceptance mode for every delegated run;
- writer identity and writer-lease phase;
- changed paths and a fingerprint of the reviewed implementation state;
- producer observations and replay commands, without producer-owned gate verdicts;
- parent-observed validation commands, outcomes, and evidence locators;
- required review axes, reviewer provenance, axis findings/verdicts, and reviewed-state fingerprint;
- parent disposition of every load-bearing finding: accepted, rejected with evidence, deferred with explicit residual risk, or escalated;
- fix-round and focused re-review state;
- C1–C7 completion-fidelity summary and load-bearing claim verification;
- fallback or degraded-mode facts, achieved independence level, warning contents, and any user/operator acknowledgment;
- residual risks;
- the requested lifecycle outcome.

The schema may be physically split across persisted work-unit state and a report payload. The observable contract above must remain intact.

### R2. Outcome-specific structural gates

The runtime must validate evidence before applying a terminal or escalation outcome.

#### `completed`

A `completed` transition must be rejected unless:

1. the parent observed the final changed paths and reviewed-state fingerprint;
2. required validation commands and outcomes are recorded;
3. every required review axis is present, or a previously authorized exception is represented explicitly;
4. the review evidence applies to the same implementation state accepted by the parent, except for documented generated-state normalization;
5. load-bearing findings have parent dispositions;
6. any accepted fix was validated and re-reviewed as required;
7. C1–C7 and claim-verification evidence is present at the required verification tier;
8. fallback, context, route, and independence provenance is recorded;
9. residual risks are explicit, including an empty explicit set when none remain;
10. the final gate is recorded as a parent action, not copied from a worker or reviewer;
11. any provider-diversity shortfall is labeled degraded, carries the required warning and explicit user/operator acknowledgment, and is not represented as independent or clean pilot evidence.

#### `needs_decision`

A `needs_decision` transition must be rejected unless it contains the full decision packet specified by R10.

#### `failed` and `blocked`

Failure outcomes must identify the failed stage, available primary evidence, attempted replay or validation, and whether retry is safe. They must not masquerade as owner decisions when the missing input is a project choice.

#### `retry`

Retry must preserve the attempt history, identify the falsified or incomplete bar, and state what will change on the next attempt. A retry cannot erase fallback, mutation, or prior-review evidence.

### R3. Parent control-plane authority

Only the parent may:

- declare the implementation accepted or completed;
- issue C1–C7 verdicts;
- declare a load-bearing claim verified;
- dispose reviewer findings;
- authorize a fix brief;
- present provider-diversity degradation for user/operator acknowledgment and record the resulting authorization;
- choose retry, escalation, rollback, or final residual risk.

Workers and reviewers may report raw observations, command output locators, candidate findings, confidence, and replay instructions. Their result schemas and prompts must not ask them to certify the gate to which they are subject.

### R4. One-writer safety

At most one writer lease may be active for a worktree.

- A writer lease must identify its owner, work unit, allowed scope, start, and closure/handoff.
- Review cannot begin until the implementation writer lease is closed and the reviewed state is stable.
- Reviewers must be sealed read-only by available tool/capability controls, not merely by role wording. If capability sealing is unavailable, review must use isolation or serialization that makes mutation observable and disqualifying.
- A fix writer may obtain the lease only after the parent disposes findings and emits a bounded fix brief.
- Parallel writers in the active worktree are prohibited.

### R5. Writer eligibility

Worker writing is eligibility-routed, not universal. A worker writer may be selected only when all of the following hold:

- architecture and important product decisions are frozen;
- the scope and allowed paths are explicit and reversible;
- the parent can state a falsifiable completion bar before launch;
- validation or replay is available at a cost appropriate to the change;
- the worker has the required tools and sufficient context without inheriting irrelevant context;
- writer-lease safety can be enforced;
- the task does not require the worker to interpret unresolved owner decisions;
- the assignment belongs to the approved pilot or a later route promoted under T1–T5.

The parent remains the writer when:

- important reasoning or scope discovery is unresolved;
- the change is so small and known that delegation would cost more than writing it;
- safe worker routing, evidence capture, or writer isolation is unavailable;
- a prior attempt escalated a semantic conflict requiring parent judgment.

Eligibility must be represented in the work-unit record with the rule or reason that selected the lane.

### R6. Worker-writer pilot and rollback

The initial worker-writer rollout must use the existing 10-assignment observational window and T1–T5 quality gates defined by the current delegation policy/performance investigation.

For each pilot assignment, the record must make it possible to distinguish:

- requested versus actual route and fallback;
- producer provider/model family;
- parent validation cost and result;
- review-axis provider/model family and independence level;
- accepted finding count and severity by axis;
- number and owner of fix rounds;
- whether the parent had to perform implementation work after delegation;
- wall-clock latency and strong-route usage when available;
- terminal outcome and rollback trigger, if any.

A fallback-contaminated assignment may be operationally completed but must not count as clean evidence for route promotion. Rollback remains role-specific rather than disabling the full orchestration architecture when one route fails.

### R7. Separate review axes

Every completed implementation must account for two logical axes:

- **Standards:** maintainability, security, test quality, repository conventions, simplicity, and code-quality risks.
- **Spec:** approved scope, behavior, acceptance criteria, validation evidence, exclusions, and unsupported completion claims.

During the initial protocol and worker-writer pilot:

- the axes must use separate review calls;
- they should run in parallel when both are sealed read-only and inspect the same stable state;
- each axis must return its own structured verdict and findings;
- a combined-review optimization is not permitted as pilot evidence.

A future low-risk combined-review exception requires a separate approved change backed by baseline evidence. It must remain labeled `combined` and must never be represented as independent axes.

### R8. Provider and producer independence

The runtime must record normalized requested and actual provider identities, compute the achieved independence level, and compare it with the target topology.

For high-risk, no-test-bar, and package-policy work, the target remains:

- Standards and Spec reviewers use distinct providers from each other;
- the producer is distinct from each required reviewer provider;
- fresh context is required for both review axes;
- reviewers remain separate and sealed even when provider diversity is degraded.

This target implies three provider identities when a delegated producer and both high-risk review axes are required. The temporary project-local route is:

- producer/worker: `llmgate`;
- Standards review: `xai`;
- Spec/evidence review: `qwencloud`.

The concrete route/model aliases stay in gitignored project-local configuration and setup guidance; reusable package policy expresses only roles, provider identities, targets, and achieved levels.

If setup or actual execution does not satisfy the target—including unavailable routes, silent fallback, provider overlap, or an unverified effective model/thinking level—the runtime must not silently downgrade and must not label the result independent. Instead it must:

1. show a user-visible warning before the affected execution/review stage;
2. state the required topology and the configured/resolved provider identities for producer, Standards, and Spec;
3. identify exactly what is missing or overlapping, including fallback/effective-model uncertainty;
4. explain that correlated blind spots are more likely and the result cannot count as clean independence or worker-pilot promotion evidence;
5. give setup guidance for configuring and allowing distinct provider routes;
6. require an explicit user/operator continue-or-stop acknowledgment;
7. persist the warning, achieved independence level, actual routes/fallbacks, acknowledgment actor/time, and reason;
8. repeat the degradation prominently in execution status and terminal reporting.

A consciously continued degraded run may reach a parent terminal outcome if every non-diversity evidence gate passes. It remains labeled `degraded`, its axes remain separate, and it is excluded from clean provider-independence and pilot-promotion evidence. Missing axes, combined review, reviewer mutation, stale fingerprints, missing parent validation, or other evidence-integrity failures are not covered by this exception and remain fail-closed.

For lower-risk work after the initial pilot, policy may permit weaker measured independence, but the achieved level and any acknowledgment must still be recorded. No combined-review exception is introduced by this specification.

### R9. Review finding disposition and fix round

Reviewers remain read-only. The parent verifies load-bearing findings against primary evidence and records one of:

- `accepted`;
- `rejected`, with disconfirming evidence;
- `deferred`, with explicit residual risk and authority;
- `escalated`, with a decision packet when owner input is required.

If fixes are needed:

1. the parent creates a bounded fix brief from accepted findings;
2. one cheap fix worker may acquire the writer lease and apply that brief;
3. the parent observes the new disk state and reruns focused validation;
4. focused re-review is required when the diff is substantial, semantic, or affects a prior load-bearing finding.

There is at most one ordinary fix-worker round. Repeated findings, reviewer conflict, semantic ambiguity, evidence ambiguity, or another required substantial fix must escalate rather than enter an unbounded loop. The parent may directly handle only a remaining issue that requires important reasoning, and that strong-route implementation cost must be attributed explicitly.

### R10. Replayable `NEEDS_DECISION` packet

A decision packet must contain:

- affected work-unit and ticket IDs;
- affected files, even when the issue is cross-cutting;
- locator or glob identifying the relevant region;
- searched scope and exclusions;
- the repeated pattern, concrete decision locus, or missing invariant;
- occurrence count when cheap and reliable, otherwise an explicit `not_counted` reason;
- representative examples or snippets by stable locator;
- the exact blocking question;
- the recommended safe default;
- consequences and material tradeoffs of plausible alternatives;
- the command, search, or procedure that replays or attempts to disconfirm the evidence;
- the stage that is blocked and whether unrelated work can continue safely.

A pattern may describe either a repeated code/configuration shape or a repeated decision category. The packet must label which kind it is; when both apply, it must include both.

The runtime should support deduplicating equivalent decision packets without discarding their affected work units or evidence locators.

### R11. Fingerprints and stale evidence

The protocol must distinguish ticket-source identity from implementation-state identity.

- Ticket/readiness source fingerprints continue to prevent stale batch inputs.
- Producer, parent validation, reviews, fixes, and final acceptance must identify the implementation state they observed.
- A material mutation after review makes that review stale unless a focused policy-defined check proves the mutation cannot affect its axis.
- Completion must fail closed when the final accepted state cannot be tied to the required validation and review evidence.

The exact fingerprint algorithm is an implementation detail, but it must be deterministic for the relevant state and testable without provider access.

### R12. Compatibility and state evolution

- Existing persisted batch state must either migrate deterministically to protocol version 1 or fail with a clear, non-destructive recovery instruction.
- The runtime must not silently treat a legacy free-form completion note as version-1 evidence.
- Interrupted and resumable runs must preserve writer-lease status, attempts, evidence provenance, and pending decisions.
- Unknown future protocol versions must fail closed without corrupting state.
- Human-readable summaries may be rendered from structured evidence, but prose must not replace required fields.

### R13. Generic package, local routing

Reusable package code and documentation must express roles, risk classes, capabilities, provider identities, and independence constraints generically.

Project-local `.pi/` configuration remains gitignored and owns concrete route assignments. The package may validate that the resolved route satisfies the declared contract, but it must not encode the current project’s provider/model names.

### R14. Initial sequencing constraint

Implementation must be staged so that evidence quality is measurable before route optimization:

1. versioned evidence/decision envelope and parent-only outcome gate;
2. separate sealed Standards and Spec axes with provenance;
3. structured `NEEDS_DECISION` packet;
4. parent disposition plus one bounded cheap fix-worker round;
5. eligibility-routed worker-writer pilot;
6. only after pilot evidence, any proposal for combined review or broader dynamic routing.

Tickets may later divide these into tracer bullets, but no ticket is created by this specification phase.

## Acceptance Criteria

### Protocol and state

1. A version-1 evidence envelope can represent a complete work unit from source identity through final parent gate without relying on a free-form note for required facts.
2. Invalid, missing, or unknown protocol versions fail closed before the persisted terminal state changes.
3. Existing state is migrated or rejected with deterministic, non-destructive recovery guidance.
4. Interrupted/resumed work preserves attempt, writer-lease, provenance, review, and decision evidence.

### Outcome gates

5. A test demonstrates that prose claiming success cannot produce `completed` when required parent validation, axis evidence, finding disposition, C1–C7/claim evidence, fingerprints, or residual-risk fields are absent.
6. A test demonstrates that a worker- or reviewer-authored “pass” cannot substitute for the parent gate.
7. A test demonstrates that review or validation evidence tied to a stale implementation fingerprint cannot authorize completion.
8. A valid fully evidenced work unit can complete and renders a useful human-readable summary.

### Writer and fix safety

9. Runtime or integration tests demonstrate that two active writers cannot hold the same worktree lease.
10. Review cannot start against an open writer lease, and reviewer mutation or unsealed capability is detected or prevented according to the selected isolation mechanism.
11. Worker-writer selection records a satisfied eligibility reason; ineligible or unclassifiable work remains parent-owned or escalates.
12. The normal path permits no more than one bounded fix-worker round; a second substantial fix need produces escalation evidence instead of another automatic loop.

### Review quality and independence

13. Standards and Spec are separate calls during the initial rollout and retain separate structured findings and verdicts.
14. Both axes review the same stable implementation fingerprint or explicitly valid focused successor state.
15. High-risk, no-test-bar, and package-policy runs compute and report the actual producer/Standards/Spec provider topology; the three-provider target is labeled `provider-distinct` only when all three actual providers differ.
16. An unmet diversity target produces the required setup/execution warning and cannot continue until a user/operator explicitly acknowledges the named quality consequence; the warning and acknowledgment persist into terminal reporting.
17. Silent provider/model fallback is recorded, triggers degradation when it changes or obscures the target, and cannot satisfy independence or count as clean pilot evidence accidentally.
18. A degraded run is labeled `degraded`/its achieved non-independent level everywhere and is excluded from clean independence and pilot-promotion evidence.
19. A combined review, missing axis, self-review, stale review, or reviewer mutation cannot be authorized through the provider-diversity degradation path and cannot be mislabeled as two independent axes.

### Decisions and evidence

20. `needs_decision` is rejected unless files, locator/glob, searched scope, pattern or missing invariant, count or `not_counted` reason, exact question, safe default, consequences, and replay/disconfirm procedure are present.
21. Code-shape and decision-category patterns are explicitly distinguishable and can both be represented.
22. Equivalent decision packets can be deduplicated while preserving affected tickets and evidence locators.
23. Every load-bearing review finding has a parent disposition and replayable evidence.

### Pilot and cost attribution

24. Ten clean eligible worker-writer assignments can be evaluated under the existing T1–T5 window without fallback- or diversity-degraded assignments being counted as promotion evidence.
25. Per-work-unit evidence can attribute producer, review-axis, parent-validation, fix-round, fallback, achieved independence, acknowledgment, latency, and strong-route usage sufficiently to test whether quality rose and strong-route work fell.
26. A role-specific rollback can disable or demote one route without disabling structured evidence, separate review axes, or the rest of the orchestration protocol.

### Portability and regression

27. Reusable package files contain no project-local provider/model names; concrete routing remains in gitignored `.pi/` configuration and setup examples.
28. Existing ticket readiness, source-freshness, serial batch continuation, stop, resume, and terminal-state behavior remains covered by regression tests.
29. Documentation and skill contracts no longer contradict the runtime on parent authority, two-axis review, independence/degradation labeling, worker gate ownership, writer leasing, fix-loop limits, or `NEEDS_DECISION` contents.
30. Focused package tests, type checks, and portability checks pass using deterministic fixtures without live model/provider calls.

## Validation Plan

Implementation validation must eventually include:

- unit tests for version parsing, outcome-specific schema validation, decision packets, fingerprints, finding disposition, and migration;
- state-machine tests for writer lease, interruption/resume, retry, fix-round cap, stale reviews, and terminal transitions;
- orchestration contract tests for separate review axes, route provenance, provider independence, fallback contamination, and parent-only gates;
- prompt/skill drift tests that assert the runtime and normative documentation agree;
- deterministic fixtures for successful completion, hollow completion rejection, stale evidence, unavailable provider independence, decision deduplication, and role-specific rollback;
- existing repository test, typecheck, and portability commands discovered at implementation time;
- observational analysis of the approved 10 clean worker-writer assignments against T1–T5 before route promotion.

Live provider calls are not required for deterministic package acceptance. The pilot supplies operational evidence separately.

## Risks and Edge Cases

- **Three-provider availability:** the high-risk target requires a producer plus two provider-distinct review axes. The temporary local topology uses `llmgate` → producer, `xai` → Standards, and `qwencloud` → Spec/evidence. If any route is unavailable or falls back, the runtime must warn, record the actual weaker topology, require conscious continuation, and exclude the run from clean independence/pilot evidence; it must never silently downgrade.
- **Protocol ceremony:** an oversized envelope could recreate cost in briefing and fan-in. Required fields should be minimal, structured, and locator-based rather than duplicating logs.
- **Generated state:** formatters, lockfiles, snapshots, and validation artifacts can alter disk state after review. The fingerprint policy must classify material versus reproducible generated mutations explicitly.
- **Reviewer sealing:** role labels do not remove tools. The implementation must choose a real capability restriction, isolation, or mutation-detection mechanism.
- **Migration recovery:** old interrupted batches may lack evidence needed for safe completion. Recovery may require revalidation/review rather than synthetic migration.
- **Attribution limits:** token/cost data may be unavailable for some providers. Missing metrics must be explicit and must not be inferred from requested routes.
- **Over-delegation:** very small known edits can cost more to brief than to perform. Eligibility retains a parent-writer lane.
- **Review conflict:** independent axes may disagree. The parent must verify primary evidence and escalate unresolved semantic decisions instead of majority voting.

## Deliberate Exclusions

- No package implementation, tickets, release, tag, or project-local routing edit in this phase.
- No general-purpose DAG scheduler, autonomous manager hierarchy, or dynamic route optimizer.
- No parallel writers in one active worktree.
- No worker- or reviewer-owned final acceptance, C1–C7 verdict, or claim-verification verdict.
- No reviewer mutation authority in the normal path.
- No combined-review optimization during the initial protocol and worker-writer pilot.
- No provider/model names embedded in reusable package policy. The temporary `llmgate`/`xai`/`qwencloud` mapping is project-local setup/configuration and is named here only as the signed rollout topology.
- No automated semantic truth oracle; the runtime enforces evidence shape and provenance while the parent judges primary evidence.
- No broad telemetry dashboard beyond data required for the protocol and T1–T5 evaluation.
- No AAR-specific roles, filenames, or one-off behavior.
- No user-facing response-shape redesign and no bundling with candidate `5402936`; an internal evidence envelope does not authorize that separate release concern.
- No creation of `CONTEXT.md`: the terms in this specification are orchestration protocol language, not a separate product domain requiring a new ubiquitous-language artifact.

## Open Questions

None blocks specification.

The temporary project-local topology is approved as `llmgate` producer, `xai` Standards review, and `qwencloud` Spec/evidence review. Provider diversity shortfalls no longer structurally block execution when an operator explicitly acknowledges the complete warning, but degraded runs cannot be represented as independent or count toward clean pilot promotion evidence.
