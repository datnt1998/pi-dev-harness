---
status: accepted
---

# Adopt an internal Run Track evidence projection

## Decision

The package will add an **internal-only Run Track v1 projection** for observing evidence-transition claims inside the active Pi session branch. It is not a task, ticket, batch, release, or pilot lifecycle authority. Existing domain owners retain their transition and completion authority; Run Track may only allow, pause, or block the narrow claim that evidence is sufficient for a requested transition.

The durable source is a namespaced, versioned journal of Pi custom session entries. State is reconstructed only from `ctx.sessionManager.getBranch()` on `session_start` and `session_tree`; `getEntries()` is prohibited because it includes abandoned siblings. Tool-result `details` carry only a compact receipt and never restore state.

Run Track v1 has exactly five journal event kinds: `task.started`, `evidence.recorded`, `guardrail.occurred`, `guardrail.acknowledged`, and `task.transition-observed`. Events are strict metadata-only records with unknown fields rejected, an 8 KiB canonical serialized cap, and versioned canonical-JSON SHA-256 evaluation digests (`rt-eval-v1:<sha256>`). Any malformed event on the active branch fails the transition claim closed.

A transition is evaluated before journaling. Missing or unresolved evidence is hard and non-waivable. Self-attested-only evidence pauses. A valid operator acknowledgment must be interactive/operator-originated, precede the retry, name the exact occurrence/action/policy/facts digest, and becomes stale when facts change; an allowed retry remains explicitly degraded. Headless, JSON, print, model-tool, and unattended RPC paths cannot create this acknowledgment or mint operator-observed trust. Hard guards do not block unrelated Pi tools or mutate another subsystem’s lifecycle state.

Fork/clone lineage is runtime-derived from inherited active-track state and the new session identity; callers cannot submit parent lineage. No third-party guardrail package, live grader, model call, `pi.events`, subagent, generic scheduler, or external lifecycle integration is part of v1.

## Why

A temporary tracer bullet demonstrated that Pi custom entries and branch replay can provide deterministic, sibling-isolated evidence history without introducing a second workflow state machine. The design retains useful soft/hard guardrails while keeping authority boundaries explicit and avoiding a third-party lifecycle model that does not match the harness.

## Validated tracer-bullet evidence

Parent validation of `/tmp/run-track-v1-prototype-2026-08-04/` passed **39/39 pure tests** and **3/3 isolated real Pi RPC scenarios**. Evidence covered deterministic replay, persisted resume, actual tree sibling isolation, clone/fork lineage, headless pause, fact-bound degraded acknowledgment, stale acknowledgment, no transition on pause/block, malformed active-branch fail-close, compact receipts, and repository noninterference. The prototype remains temporary reference evidence, not package code.

Implementation and review were requested on `anthropic/claude-opus-4-8:high`; session records show provider `anthropic`, model `claude-opus-4-8`, and thinking `high`. Fallback was not directly observable. One bounded fix worker timed out after reaching passing focused behavior, so its terminal acceptance was rejected; the parent inspected and finalized the temporary files, reran the full 39+3 gate, and obtained a fresh sealed read-only PASS review. The review used the same provider/model family, so it was context-independent but not provider-diverse.

## Package acceptance boundary

Prototype success authorizes implementation tickets, not production acceptance. Package implementation must reproduce the approved behavior through repository-owned code and deterministic package tests, prove extension/UI/RPC trust boundaries without fixture-only authority leaking into shipped runtime, preserve existing authorities and regressions, and pass package-native validation. Prototype files, logs, sessions, fixture commands/provider, and `/tmp` imports are never package dependencies or acceptance evidence by themselves.

## Consequences

- Run Track is an observability/projection seam, not a universal evidence schema or a second lifecycle state machine.
- Domain adapters must opt in explicitly and remain responsible for their own transitions.
- Acknowledgment records a consciously accepted degraded claim; it never upgrades evidence quality or waives missing/malformed evidence.
- Repository implementation must remain provider-agnostic and dependency-free beyond existing package peers.
- Promotion to code, release, pilot use, or third-party integration requires separate authorization and its own validation.
