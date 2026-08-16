# Two-Axis Code Review

Use this reference when reviewing a branch, PR, WIP diff, or completed implementation. Every reviewer delegation follows the normative launch, acceptance, claim, and evidence rules in `delegation-policy.md`.

## Fixed Point

Resolve the review surface in this order:

1. user-supplied commit/branch/tag/scope;
2. merge-base with the configured upstream or repository-documented default branch;
3. staged plus unstaged worktree diff (including relevant untracked files);
4. files explicitly identified by the user when Git evidence is unavailable.

Never assume the default branch is `main`. Resolve an explicit fixed point and fail fast before delegation:

```bash
git rev-parse <fixed-point>
if git diff --quiet <fixed-point>...HEAD; then
  echo "empty diff" >&2
  exit 1
fi
git diff <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

An invalid ref or empty requested diff stops the review before reviewers launch. Report which surface was reviewed. If none can be established, report the evidence gap instead of claiming a complete review.

**Right-size the surface.** The natural review unit is the diff of one validated boundary — typically a single ticket's commit. An accumulated multi-boundary surface (a whole slice or batch reviewed at once) forces each reviewer to re-derive every earlier boundary's context before attacking anything: tool use and context grow with the accumulated surface, not the marginal change, and findings lose binding to the boundary that introduced them. On long-horizon work, review each boundary as it closes and finish with one thin final pass over the assembled whole — integration seams and parent-measured gate results, not a re-derivation of already-reviewed boundaries. A reviewer battery that keeps growing to match an accumulated surface is a staffing smell: shrink the surface, not the rigor.

## Axis A — Falsification

Attack the guards. For each behavior the diff's tests or validation claim to pin, name a meaning-changing mutation and state whether any guard dies:

- a mutation claim carries the pattern's before/after occurrence counts where applicable;
- DIED carries the observed red; SURVIVED is stated plainly, never softened;
- a red produced by a syntax error is not the needed red — the mutation must stay meaning-changing and executable as changed;
- "this provably cannot go red" is a permitted result when the structural reason is named (e.g., the branch is unreachable, the value is structurally fixed);
- fabricating a red or silently weakening a claim is a false claim, not a lesser finding;
- a temporary probe is reverted by restoring the exact saved bytes captured before the probe
  — never by ref-relative git commands (`checkout -- <path>`, `restore`, `reset`, `stash`).
  Those restore to a committed state, and when the reviewed work is not itself committed they
  erase it along with the probe. They are permissible only when the fixed point under review
  is a commit that contains the reviewed work.

"Mutation" means any meaning-changing alteration whose detection is claimed, not only a code mutation run through a test suite. For doc-only or otherwise non-executable surfaces, the falsification method degrades to deriving and stating a concrete counter-example the surface's own claim should have caught, and stating plainly whether the surface catches it.

The same degradation applies per behavior on interface-heavy surfaces: where a claimed behavior (rendering, interaction, visual state) is pinned by no runnable guard, the axis does not hunt for a mutation that nothing can catch and does not stand up servers or browsers to manufacture one — it records the guard gap itself as the finding and moves to the next enumerated question. Interface preview evidence belongs to the parent's validation gate under `completion-evidence.md`, not to a falsification loop.

What makes a surviving-or-dying proof binding rather than decorative is governed by `evidence-binding.md`; this axis attacks whatever that reference says a proof must bind to. When the diff touches a test double standing in for an argument-sensitive or refusing operation, the axis enumerates each double/port semantic divergence and states what turns red when the divergence is removed (`tests-and-mocking.md`, semantic fidelity).

### Falsification economics

Mutation review is the most tool-heavy review style: every mutation is a read-edit-run-revert loop, and each loop re-reads the reviewer's entire growing context. Costs compound per loop, so the battery's size and each loop's output hygiene dominate the bill. Rules for whoever staffs this axis:

- **Parent mutates first, child gets the residue.** The delegating agent runs the cheap decisive mutations itself before staffing the axis; the child's brief enumerates only the specific guards the parent could not falsify — an open-ended "attack everything" mandate turns one review into a research project.
- **Each question ships with its focused check.** The brief names, per mutation question, the single test file (or narrowest command) that would go red, and requires filtered output — pass/fail lines and failure names only, never a full raw test log into context.
- **Final restoration check follows `testing-strategy.md`.** After the last revert, rerun the focused guards used by the mutation battery and verify the final fingerprint. Add a package/workspace check only when the affected surface requires it; run a whole-suite/package gate only when repository policy, an explicit request, or a release gate requires it. Per-mutation loops always use focused runs.
- **Fingerprint twice, not per cycle.** Seal verification happens at start and at final exit; re-hashing after every revert multiplies loops without adding evidence — the final hash already proves cumulative restoration.
- **Report the table, not the journey — and not a live feed.** The deliverable is the mutation record and dispositions, delivered once at the end. Findings are batched into that report, not streamed to the delegating agent one at a time as they surface: each mid-run escalation is a synchronous round-trip that stalls the review, and unvetted findings streamed before the reviewer's own pre-submit attack pass export noise the parent must then dispose. Mid-run contact is for a genuine stall — a seal problem, a broken fixed point, an exhausted budget — never per-finding narration.
- **Budget the child.** The delegating agent bounds the run (tool or turn budget) sized to the enumerated battery, so a stuck loop fails fast instead of burning quietly.

## Axis B — Adversarial authority

Read each governing clause and derive the input or scenario that would violate it **before opening the implementation**, then check whether the implementation refuses or handles it. Reading the code first anchors the reviewer into confirming it instead of attacking it.

Governing clauses come from:

- the spec file, PRD, issue, or user request;
- acceptance criteria;
- repository standards docs: `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, project coding standards, existing code style.

Find, from the derived violating inputs and scenarios: missing requirements, partial implementation, wrong behavior, scope creep, and untested acceptance criteria.

An authority citation carries the literal quoted text, never a bare line number.

As part of this axis, flag artifact-lifecycle drift: a living spec or context doc that no longer matches the changed code, a plan/report left in an authoritative path, or a decision that should have moved into an ADR (`/skill:repo-hygiene`). Treat a stale authoritative-looking doc as a real finding, not cosmetic.

## Verdict and Framing Rules

PASS requires attempted falsification. "Verified correct" without a named mutation or a named violating input is a restatement of the diff, not a review result. A reviewer that ran no mutations and derived no violating inputs may report observations but may not clear the work.

Briefs phrase checks as open adversarial questions — "confirm or refute: is this rule guarded at all?" — never as a checklist of obligations to confirm; checklist framing invites confirmation instead of attack. Before concluding a reviewer model is weak, check whether it was asked a checklist question rather than an adversarial one.

## Shared Observation Lenses

The smell baseline, review posture, AI-assisted-code risk lens, and pre-submit checklist below apply across both axes as observation lenses. Either axis may report such observations. Observations never substitute for attack evidence in a verdict — a lens finding is not a mutation and is not a derived violating input.

Smell baseline (what it is → usual direction):

- **Mysterious Name** — a name hides its purpose → rename; if no honest name exists, inspect the design.
- **Duplicated Code** — the same logic shape appears in multiple changed sites → extract the shared shape.
- **Feature Envy** — behavior reaches into another module's data more than its own → move it toward the data.
- **Data Clumps** — the same fields/parameters travel together → introduce one domain type.
- **Primitive Obsession** — a primitive stands in for a domain concept → give the concept a type.
- **Repeated Switches** — the same type cascade recurs → centralize the dispatch or use polymorphism.
- **Shotgun Surgery** — one logical change scatters across many files → gather what changes together.
- **Divergent Change** — one module changes for unrelated reasons → split responsibilities.
- **Speculative Generality** — abstractions/hooks serve no approved need → remove or inline them.
- **Message Chains** — callers navigate a long object chain → hide the walk behind the first module.
- **Middle Man** — a module mostly delegates → call the real target or deepen the module.
- **Refused Bequest** — an implementation ignores most inherited behavior → prefer composition.

Repository standards override this baseline. Treat smells as judgment calls, not hard failures, and skip issues already enforced by tooling.

### Review Posture

Assume the diff may be AI-authored. Polished structure, confident comments, and passing happy-path tests are not evidence of correctness — verify against the diff, surrounding code, project rules, and runnable checks. No rubber-stamping or praise padding. Be hostile to defects and scope creep while keeping the report professional and evidence-based.

### AI-Assisted-Code Risk Lens

Both axes apply this lens:

- generic helpers or abstractions with no domain anchor;
- parallel reimplementation of existing utilities, adapters, or patterns;
- defensive catch-and-swallow error handling;
- `any` widening or lint suppression;
- phantom tests that execute code without proving behavior;
- unrelated files, broad rewrites, or drift from the stated task.

### Pre-Submit Checklist

Verify before returning findings:

- concurrency/races and shared mutable state;
- every thrown error handled or explicitly propagated;
- caller assumptions match callee guarantees (nullability, shape, timing);
- no silent breaking changes to exported interfaces or schemas;
- external input validated at system boundaries;
- sensitive operations check identity AND permission;
- no unbounded loops over queries / missing indexes on filter columns;
- no PII, secrets, or stack traces leaking outward;
- when a plan/spec is provided, its file paths, symbols, and behavioral claims are re-verified by grep against the actual codebase.

Reviewer briefs built from `delegation-policy.md` include this posture and these lenses for both reviewer axes.

## Simplicity Pass (optional)

An optional read-only reviewer angle: behavior-preserving simplification proposals only — reduce nesting via early returns, remove redundant abstraction and obvious comments, favor clarity over compactness. Never over-simplify away helpful structure. This angle is findings-only; the parent remains the sole writer applying accepted fixes.

## Stable-State Two-Axis Pattern

Start review only after the writer lease is closed and the parent records one stable implementation fingerprint. Launch two **separate fresh-context, observation-only review calls** under `delegation-policy.md`, both against that exact fingerprint:

- Axis A — Falsification: attack the guards claimed by the diff's tests and validation.
- Axis B — Adversarial authority: derive violating inputs/scenarios from the governing clauses and check the implementation against them.

A role label, no-edit instruction, or read-only acceptance metadata does not seal a reviewer. Each record must prove either a capability-sealed reader (no mutation tools/output path and non-mutating commands) or serialized/isolation evidence with parent-observed pre/post implementation fingerprints. Any changed pre/post fingerprint disqualifies that review. The axes may run in parallel only after both capability seals are proven; otherwise serialize them. A missing axis, one combined call, self-review, stale fingerprint, unsealed review, or reviewer mutation fails closed; provider-diversity degradation never excuses those failures.

Before launching an affected review stage, compare the target topology with configured/resolved provenance. Record actual resolved provider/model identity, fallback state, and effective-model/effective-thinking confidence for the producer and both reviewer calls. Requested routes never establish independence. Three actual distinct provider families, no fallback, and verified effective route facts are `provider-distinct`. Provider overlap, fallback, or unverified/unknown effective model or thinking requires a complete warning naming the target, configured and actual topology, missing/overlap/uncertainty, quality consequence, configuration guidance, and explicit operator continue/stop action. Launch or continue the affected stage only after an explicit recorded **continue** acknowledgment; persist and repeat the warning in terminal evidence, label the result degraded, and exclude it from clean pilot evidence. Do not label it independent.

Reviewers inspect the actual diff and source files, cite file/line evidence, and never certify completion or their own gate. Matches inside tool-state directories (subagent artifacts, session logs) are discarded, not followed. Their actionable findings use the policy's claims table and replay/check convention. The parent verifies and records one disposition for every load-bearing finding (`accepted`, `rejected` with disconfirming evidence, `deferred` with residual risk, or `escalated`), then applies only accepted fixes. Keep reports and severity judgments separate; do not collapse or rerank findings across axes.

The parent owns gate execution. Run the project's gates and suites once at the stable fingerprint and plant the measured results in both reviewer briefs as evidence; reviewers spot-check named rows through focused, filtered commands and never re-run the whole battery — a reviewer re-deriving every gate duplicates already-paid work inside a growing context, and the resulting numbers still need parent verification because reviewers never certify gates.

The parent owns navigation the same way. Where a review-map generator is available, the parent generates the map for the reviewed range at brief time — after the boundary commit — and reads its summary line before deciding whether to plant it. Planting pays only when the map shows a wide dependent surface: many dependents the reviewer would otherwise re-derive by search. For a narrow change — few changed files, few dependents, or review work that lives outside the map's scope (mutation probes, external-dependency source verification) — the planted block is overhead, not navigation, and is omitted. A planted map carries changed files with export deltas, direct dependents, and guard files. A reviewer holding a map reads the named files and spends its search budget on judgment; re-deriving the map with repo-wide searches duplicates paid work. The map is advisory navigation, never evidence: findings cite the real files and lines, a map row is never a citation, and where the map declares itself blind (unresolved specifiers, capped depth) the reviewer's own targeted search is the correct fallback for exactly that spot. After a fix round, a fresh map over the fix-round range scopes the re-review to what actually changed.

Before staffing review, the parent runs a small number of quick mutations itself. A surviving mutant goes into the reviewer brief as a direct question, not a hint. Mutation records are verified by sampling re-run of load-bearing rows: the parent personally re-runs the rows a verdict or fix round would rest on. A record is never accepted by format or parser alone.

The parent then classifies findings as blockers, fixes worth doing now, optional/deferred improvements, or feedback to ignore. For implementation-authorized work, apply accepted fixes through one writer and re-run focused review when the fix is substantial. Stop for unapproved product, architecture, API, data, or scope decisions.

If sealed fresh reviewer calls are unavailable or their budget is exhausted, record the capability/evidence gap and do not complete high-risk/package-policy work through a self-review substitute. Structured parent self-review may identify issues but cannot supply the required sealed, fresh, separate axis evidence or an independence claim.

## Final Report

Before submitting findings, run an ATTACK-style pass against the review's own conclusions: try to kill each finding with a cheap check before reporting it. That one instruction is the whole required move — do not load the full reasoning-discipline skill for it; load that skill only when a finding is genuinely contested and the extended protocol earns its context cost. Preserve Axis A and Axis B findings separately. On pass, report one terse line. On findings, list only actionable items ordered by severity, evidence gaps, accepted/deferred fixes, and whether re-review is required. Map acceptance criteria through `completion-evidence.md`; never infer pass from missing evidence.
