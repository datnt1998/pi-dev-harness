---
status: accepted
---

# Adopt evidence-gated serial team orchestration

The harness will use a thin, versioned runtime evidence/decision protocol around a serial one-writer workflow. The parent retains control-plane authority for scope, validation, finding disposition, and final acceptance; eligible bounded implementation and one bounded fix round may be delegated to cheaper writers; Standards and Spec review remain sealed, separate axes with distinct-provider review as the high-risk target. This was chosen over prose-only coordination because the existing policy is stronger than runtime enforcement, and over a generic dynamic orchestration engine because a narrow protocol can improve evidence fidelity and cost attribution without premature scheduler complexity.

## Signed amendment — provider diversity degradation

Đạt amended the initial hard fail-closed rule for unavailable provider diversity. Missing or lost provider diversity must instead produce an explicit setup/execution warning and recorded degraded provenance; an informed user/operator may consciously continue. The system must never silently weaken the topology or label a degraded run independent. Warnings and terminal reports identify the required topology, actual axis/provider identities, what is missing, the quality consequence, the acknowledgment, and how to configure distinct providers. Other evidence-integrity failures remain fail-closed.

## Consequences

- Runtime completion and `NEEDS_DECISION` transitions must be backed by structured, replayable evidence rather than free-form confidence claims.
- Workers and reviewers report observations and findings; they never certify their own gate or final completion.
- High-risk, no-test-bar, and package-policy work targets provider-independent producer, Standards, and Spec axes. A diversity shortfall is `degraded`, not independent; continuation requires explicit user/operator acknowledgment and cannot count as clean independence or pilot-promotion evidence.
- The temporary project-local topology is `llmgate` producer, `xai` Standards review, and `qwencloud` Spec/evidence review. This mapping is configuration, not reusable package policy.
- The package expresses capabilities, achieved-independence levels, warnings, and acknowledgment requirements generically. Provider/model assignments remain project-local configuration.
