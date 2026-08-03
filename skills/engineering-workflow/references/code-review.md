# Two-Axis Code Review

Use this reference when reviewing a branch, PR, WIP diff, or completed implementation. Every reviewer delegation follows the normative launch, acceptance, claim, and evidence rules in `delegation-policy.md`.

## Fixed Point

Resolve the review surface in this order:

1. user-supplied commit/branch/tag/scope;
2. merge-base with the configured upstream or repository-documented default branch;
3. staged plus unstaged worktree diff (including relevant untracked files);
4. files explicitly identified by the user when Git evidence is unavailable.

Never assume the default branch is `main`. Use three-dot diff for branch comparison:

```bash
git diff <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

Report which surface was reviewed. If none can be established, report the evidence gap instead of claiming a complete review.

## Axis 1 — Standards

Review against:

- `AGENTS.md`
- `CONTRIBUTING.md`
- `README.md`
- project coding standards
- existing code style
- smell baseline below

Smell baseline:

- Mysterious Name
- Duplicated Code
- Feature Envy
- Data Clumps
- Primitive Obsession
- Repeated Switches
- Shotgun Surgery
- Divergent Change
- Speculative Generality
- Message Chains
- Middle Man
- Refused Bequest

Treat smells as judgment calls, not hard failures, unless repo standards make them explicit.

## Axis 2 — Spec

Review against:

- issue
- spec file
- PRD
- user request
- acceptance criteria

Find:

- missing requirements
- partial implementation
- wrong behavior
- scope creep
- untested acceptance criteria

## Stable-State Two-Axis Pattern

Start review only after the writer lease is closed and the parent records one stable implementation fingerprint. Launch two **separate fresh-context, observation-only review calls** under `delegation-policy.md`, both against that exact fingerprint:

- Standards axis: maintainability, security, test quality, repository conventions, simplicity, and code-quality risks.
- Spec axis: approved scope, behavior, acceptance criteria, validation evidence, exclusions, and unsupported completion claims.

A role label, no-edit instruction, or read-only acceptance metadata does not seal a reviewer. Each record must prove either a capability-sealed reader (no mutation tools/output path and non-mutating commands) or serialized/isolation evidence with parent-observed pre/post implementation fingerprints. Any changed pre/post fingerprint disqualifies that review. The axes may run in parallel only after both capability seals are proven; otherwise serialize them. A missing axis, one combined call, self-review, stale fingerprint, unsealed review, or reviewer mutation fails closed; provider-diversity degradation never excuses those failures.

Before launching an affected review stage, compare the target topology with configured/resolved provenance. Record actual resolved provider/model identity, fallback state, and effective-model/effective-thinking confidence for the producer and both reviewer calls. Requested routes never establish independence. Three actual distinct provider families, no fallback, and verified effective route facts are `provider-distinct`. Provider overlap, fallback, or unverified/unknown effective model or thinking requires a complete warning naming the target, configured and actual topology, missing/overlap/uncertainty, quality consequence, configuration guidance, and explicit operator continue/stop action. Launch or continue the affected stage only after an explicit recorded **continue** acknowledgment; persist and repeat the warning in terminal evidence, label the result degraded, and exclude it from clean pilot evidence. Do not label it independent.

Reviewers inspect the actual diff and source files, cite file/line evidence, and never certify completion or their own gate. Their actionable findings use the policy's claims table and replay/check convention. The parent verifies and records one disposition for every load-bearing finding (`accepted`, `rejected` with disconfirming evidence, `deferred` with residual risk, or `escalated`), then applies only accepted fixes. Keep reports and severity judgments separate; do not collapse or rerank findings across axes.

As part of the Spec axis, flag artifact-lifecycle drift: a living spec or context doc that no longer matches the changed code, a plan/report left in an authoritative path, or a decision that should have moved into an ADR (`/skill:repo-hygiene`). Treat a stale authoritative-looking doc as a real finding, not cosmetic.

The parent then classifies findings as blockers, fixes worth doing now, optional/deferred improvements, or feedback to ignore. For implementation-authorized work, apply accepted fixes through one writer and re-run focused review when the fix is substantial. Stop for unapproved product, architecture, API, data, or scope decisions.

If sealed fresh reviewer calls are unavailable or their budget is exhausted, record the capability/evidence gap and do not complete high-risk/package-policy work through a self-review substitute. Structured parent self-review may identify issues but cannot supply the required sealed, fresh, separate axis evidence or an independence claim.

## Final Report

Preserve Standards and Spec findings separately. On pass, report one terse line. On findings, list only actionable items ordered by severity, evidence gaps, accepted/deferred fixes, and whether re-review is required. Map acceptance criteria through `completion-evidence.md`; never infer pass from missing evidence.
