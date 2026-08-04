/**
 * T4 — opt-in Run Track owner adapter for BatchRunState completion claim.
 *
 * Named owner + claim (fixed):
 * - Owner: ticket-runner batch owner `BatchRunState` / `applyEvidencedOutcome`
 *   in `lib/ticket-runner-state.ts`.
 * - Evidence-transition claim: the single `in_progress -> completed` transition
 *   when `report.requestedOutcome === "completed"`.
 *
 * Run Track is advisory only. The owner module is unmodified by construction.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  applyEvidencedOutcomeWithRunTrack,
  consultRunTrackForOwnerCompletion,
} from "../lib/run-track-owner-adapter.ts";
import {
  RUN_TRACK_NAMESPACE,
  RUN_TRACK_POLICY_VERSION,
  RUN_TRACK_VERSION,
  planEvidenceTransition,
  projectRunTrackBranch,
  runTrackEvaluationDigest,
} from "../lib/run-track-v1.ts";
import {
  acquireBatchWriterLease,
  applyEvidencedOutcome,
  applyOutcome,
  closeBatchWriterLease,
  createRunState,
  startTicket,
  type BatchRunState,
} from "../lib/ticket-runner-state.ts";

const FP_A = "a".repeat(64);
const TS = "2026-08-04T12:00:00.000Z";
const COMPLETION_ACTION = "ticket.completed";
const REQUIRED_KEYS = ["completion-evidence"] as const;

// ---------------------------------------------------------------------------
// Owner fixtures (same construction style as tests/ticket-runner-state.test.ts)
// ---------------------------------------------------------------------------

function baseState(commit = false) {
  return createRunState({
    batchId: "b1",
    source: "tickets.md",
    fingerprint: "fp",
    order: ["T1", "T2", "T3"],
    tickets: [
      { id: "T1", dependencies: [] },
      { id: "T2", dependencies: ["T1"] },
      { id: "T3", dependencies: ["T2"] },
    ],
    commit,
    now: 1,
  });
}

function reportFor(
  ticketId: string,
  attempt: number,
  outcome: "completed" | "retry" | "failed" | "blocked" | "needs_decision" = "completed",
) {
  const validationOutcome = outcome === "completed" ? "passed" : "failed";
  return {
    protocolVersion: 1,
    workUnit: { source: "tickets.md", sourceFingerprint: "fp", ticketId, purpose: "state gate", attempt },
    runs: [{
      role: "producer",
      actor: "writer",
      runId: "run-1",
      contextMode: "fresh",
      acceptanceMode: "checked",
      provider: { provider: "producer", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" },
    }],
    eligibility: {
      lane: "parent",
      reasonCode: "tiny-known-parent",
      rule: "tiny known diffs stay on the parent writer lane",
      architectureFrozen: true,
      scopeExplicit: true,
      reversible: true,
      falsifiableBar: "node --test",
      validationAvailable: true,
      freshContext: true,
      checkedAcceptance: true,
      pilotMember: false,
      allowedPaths: ["lib/x.ts"],
      importantReasoning: "none",
      tinyKnownDiff: true,
      leaseSafetyAvailable: true,
    },
    writerLease: {
      leaseId: "lease-1",
      ticketId,
      attempt,
      worktreeKey: "active",
      owner: "writer",
      ownerRole: "parent",
      phase: "closed",
      allowedPaths: ["lib/x.ts"],
      openedAt: "2026-01-01",
      closedAt: "2026-01-01",
      handoffFingerprint: "implementation",
    },
    implementation: { changedPaths: ["lib/x.ts"], fingerprint: "implementation" },
    producerObservations: [{ summary: "observed failure", locators: ["log:1"], replayCommands: ["node --test"] }],
    parentValidation: [{
      command: "node --test",
      outcome: validationOutcome,
      locator: "log:2",
      observedFingerprint: "implementation",
    }],
    reviews: [
      {
        axis: "standards",
        run: {
          role: "standards-reviewer",
          actor: "standards",
          runId: "standards-1",
          contextMode: "fresh",
          acceptanceMode: "reviewed",
          provider: { provider: "standards", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" },
        },
        reviewedFingerprint: "implementation",
        sealing: { mode: "capability", readOnlyCapabilities: ["read", "search"], evidenceLocator: "seal:standards" },
        verdict: "no-findings",
        findings: [],
      },
      {
        axis: "spec",
        run: {
          role: "spec-reviewer",
          actor: "spec",
          runId: "spec-1",
          contextMode: "fresh",
          acceptanceMode: "reviewed",
          provider: { provider: "spec", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" },
        },
        reviewedFingerprint: "implementation",
        sealing: {
          mode: "serialized",
          preMutationFingerprint: "implementation",
          postMutationFingerprint: "implementation",
          evidenceLocator: "seal:spec",
        },
        verdict: "no-findings",
        findings: [],
      },
    ],
    dispositions: [],
    fixAndRereview: { round: 0, fixApplied: false },
    completionFidelity: {
      criteria: { C1: "verified", C2: "verified", C3: "verified", C4: "verified", C5: "verified", C6: "verified", C7: "verified" },
      claims: [{ claim: "test", locator: "log:2", verifiedBy: "parent" }],
    },
    diversity: { achievedIndependence: "provider-distinct", degraded: false, cleanPilotEvidence: true },
    residualRisks: outcome === "completed" ? [] : ["safe to retry after changing implementation"],
    requestedOutcome: outcome,
    ...(outcome === "needs_decision"
      ? {
          decisionPacket: {
            affectedWorkUnitIds: [ticketId],
            affectedTicketIds: [ticketId],
            affectedFiles: ["lib/x.ts"],
            locatorOrGlob: "lib/x.ts:1",
            searchedScope: "lib",
            exclusions: ["node_modules"],
            pattern: "missing invariant",
            patternKind: "decision-category",
            occurrences: 1,
            representativeLocators: ["lib/x.ts:1"],
            question: "Which behavior should apply?",
            safeDefault: "Leave the current behavior unchanged.",
            consequences: "Callers retain existing semantics.",
            replayCommand: "rg invariant lib",
            disconfirmProcedure: "Inspect the representative locator.",
            blockedStage: "implementation",
            unrelatedWorkSafe: true,
          },
        }
      : {}),
    parentGate: {
      actor: "parent",
      role: "parent",
      action: outcome === "completed" ? "accepted" : "escalated",
      observedFingerprint: "implementation",
      evidenceLocator: "log:3",
    },
  } as const;
}

function report(outcome: "completed" | "retry" | "failed" | "blocked" | "needs_decision" = "completed") {
  return reportFor("T1", 1, outcome);
}

function withRecordedLease(state: BatchRunState, leaseId = "lease-1", fingerprint = "implementation") {
  assert.equal(acquireBatchWriterLease(state, {
    leaseId,
    worktreeKey: "active",
    owner: "writer",
    ownerRole: "parent",
    phase: "implementation",
    ticketId: "T1",
    attempt: 1,
    allowedPaths: ["lib/x.ts"],
    openedAt: "2026-01-01",
  }).ok, true);
  assert.equal(closeBatchWriterLease(state, {
    leaseId,
    owner: "writer",
    closedAt: "2026-01-01",
    handoffFingerprint: fingerprint,
  }).ok, true);
}

function readyInProgressState(): BatchRunState {
  const state = baseState();
  startTicket(state, "T1");
  withRecordedLease(state);
  return state;
}

// ---------------------------------------------------------------------------
// Run Track branch fixtures (repository-owned; not prototype imports)
// ---------------------------------------------------------------------------

function started(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "task.started",
    id: "evt-start-1",
    ts: TS,
    trackId: "track-1",
    sessionId: "session-1",
    taskRef: "ticket/T1",
    lineage: null,
    ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "evidence.recorded",
    id: "evt-ev-1",
    ts: TS,
    trackId: "track-1",
    evidenceId: "ev-1",
    key: REQUIRED_KEYS[0],
    trust: "self-attested",
    resolution: "resolved",
    fingerprint: FP_A,
    ...overrides,
  };
}

function occurred(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const factsDigest =
    typeof overrides.factsDigest === "string"
      ? overrides.factsDigest
      : runTrackEvaluationDigest({ placeholder: true });
  return {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "guardrail.occurred",
    id: "evt-occ-1",
    ts: TS,
    trackId: "track-1",
    action: COMPLETION_ACTION,
    decision: "pause",
    reason: "self-attested-only evidence",
    policyVersion: RUN_TRACK_POLICY_VERSION,
    factsDigest,
    ...overrides,
  };
}

function acknowledged(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const factsDigest =
    typeof overrides.factsDigest === "string"
      ? overrides.factsDigest
      : runTrackEvaluationDigest({ placeholder: true });
  return {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "guardrail.acknowledged",
    id: "evt-ack-1",
    ts: TS,
    trackId: "track-1",
    occurrenceId: "evt-occ-1",
    action: COMPLETION_ACTION,
    policyVersion: RUN_TRACK_POLICY_VERSION,
    factsDigest,
    origin: "operator-interactive",
    ...overrides,
  };
}

function runTrackOption(entries: readonly unknown[]) {
  return {
    runTrack: {
      entries,
      action: COMPLETION_ACTION,
      requiredKeys: [...REQUIRED_KEYS],
    },
  };
}

function cloneState(state: BatchRunState): BatchRunState {
  return structuredClone(state);
}

/** Owner stamps updatedAt via Date.now(); normalize so dual-path compares are stable. */
function stableState(state: BatchRunState): BatchRunState {
  const copy = structuredClone(state);
  copy.updatedAt = 0;
  return copy;
}

function stableResult(result: unknown): unknown {
  const copy = structuredClone(result) as Record<string, unknown>;
  if (copy && typeof copy === "object" && copy.ok === true && copy.ticket && typeof copy.ticket === "object") {
    // ticket is a live reference into BatchRunState; content equality is enough.
    return copy;
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Disabled/absent = unchanged
// ---------------------------------------------------------------------------

test("disabled/absent runTrack matches direct owner apply (success path)", () => {
  const directState = readyInProgressState();
  const adapterState = cloneState(directState);
  const completed = report("completed");

  const direct = applyEvidencedOutcome(directState, "T1", structuredClone(completed), "completed");
  const viaAbsent = applyEvidencedOutcomeWithRunTrack(
    adapterState,
    "T1",
    structuredClone(completed),
    { expectedOutcome: "completed" },
  );
  assert.deepEqual(stableResult(viaAbsent), stableResult(direct));
  assert.deepEqual(stableState(adapterState), stableState(directState));
  assert.equal(viaAbsent.ok, true);
  assert.equal("runTrack" in viaAbsent, false);

  const noOptionsState = readyInProgressState();
  const baselineState = cloneState(noOptionsState);
  const viaNoOptions = applyEvidencedOutcomeWithRunTrack(noOptionsState, "T1", structuredClone(completed));
  const baseline = applyEvidencedOutcome(baselineState, "T1", structuredClone(completed));
  assert.deepEqual(stableResult(viaNoOptions), stableResult(baseline));
  assert.deepEqual(stableState(noOptionsState), stableState(baselineState));
});

test("disabled/absent runTrack matches direct owner rejection (bad report)", () => {
  const directState = readyInProgressState();
  const adapterState = cloneState(directState);
  const bad = { prose: "done" };

  const direct = applyEvidencedOutcome(directState, "T1", bad, "completed");
  const viaAdapter = applyEvidencedOutcomeWithRunTrack(adapterState, "T1", bad, {
    expectedOutcome: "completed",
  });
  assert.equal(direct.ok, false);
  assert.deepEqual(viaAdapter, direct);
  assert.deepEqual(adapterState, directState);
  assert.equal(directState.tickets[0].status, "in_progress");
  assert.equal(adapterState.tickets[0].status, "in_progress");
});

// ---------------------------------------------------------------------------
// Run Track block / pause / degraded allow
// ---------------------------------------------------------------------------

test("Run Track block is non-waivable: missing evidence refuses without owner mutation", () => {
  const state = readyInProgressState();
  const before = cloneState(state);
  // task started only — required completion-evidence key absent
  const entries = [started()];
  const completed = report("completed");

  const result = applyEvidencedOutcomeWithRunTrack(state, "T1", completed, {
    expectedOutcome: "completed",
    ...runTrackOption(entries),
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected refusal");
  assert.equal(result.error.code, "invalid-transition");
  assert.match(result.error.message, /Run Track block/);
  assert.ok(result.runTrack);
  assert.equal(result.runTrack.decision, "block");
  assert.match(result.runTrack.reason, /missing evidence/);
  assert.ok(result.runTrack.occurrence);
  assert.equal(result.runTrack.occurrence?.decision, "block");
  assert.equal(result.runTrack.receipt.decision, "block");
  assert.equal(result.runTrack.receipt.ns, RUN_TRACK_NAMESPACE);
  // Owner not called: no status/note/evidence mutation.
  assert.deepEqual(state, before);
  assert.equal(state.tickets[0].status, "in_progress");
  assert.equal(state.tickets[0].evidence, undefined);
});

test("self-attested-only evidence pauses; owner completion held; occurrence surfaced; no transition-observed", () => {
  const state = readyInProgressState();
  const before = cloneState(state);
  const entries = [started(), evidence({ trust: "self-attested" })];
  const completed = report("completed");

  const result = applyEvidencedOutcomeWithRunTrack(state, "T1", completed, {
    expectedOutcome: "completed",
    ...runTrackOption(entries),
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected pause refusal");
  assert.equal(result.runTrack?.decision, "pause");
  assert.match(result.runTrack?.reason ?? "", /self-attested-only/);
  assert.equal(result.runTrack?.degraded, false);
  assert.ok(result.runTrack?.occurrence);
  assert.equal(result.runTrack?.occurrence?.kind, "guardrail.occurred");
  assert.equal(result.runTrack?.occurrence?.decision, "pause");
  assert.equal(result.runTrack?.occurrence?.action, COMPLETION_ACTION);
  // Adapter does not journal task.transition-observed; occurrence is a proposal only.
  const projection = projectRunTrackBranch(entries);
  assert.equal(projection.transitions.length, 0);
  assert.equal(result.runTrack?.receipt.transitionCount, 0);
  assert.deepEqual(state, before);
  assert.equal(state.tickets[0].status, "in_progress");
});

test("bound acknowledgment yields degraded allow; owner completes; degraded surfaced; owner note unchanged by Run Track", () => {
  const selfOnly = [started(), evidence({ trust: "self-attested" })];
  const baseProjection = projectRunTrackBranch(selfOnly);
  assert.equal(baseProjection.healthy, true);
  const pausePlan = planEvidenceTransition(baseProjection, {
    action: COMPLETION_ACTION,
    requiredKeys: [...REQUIRED_KEYS],
  });
  assert.equal(pausePlan.decision, "pause");
  const factsDigest = baseProjection.factsDigest!;

  const entries = [
    started(),
    evidence({ trust: "self-attested" }),
    occurred({
      id: "occ-1",
      action: COMPLETION_ACTION,
      decision: "pause",
      reason: pausePlan.reason,
      factsDigest,
    }),
    acknowledged({
      id: "ack-1",
      occurrenceId: "occ-1",
      action: COMPLETION_ACTION,
      factsDigest,
      origin: "operator-interactive",
    }),
  ];

  // Direct owner baseline (no Run Track) for note/state comparison after success.
  const baselineState = readyInProgressState();
  const baseline = applyEvidencedOutcome(baselineState, "T1", report("completed"), "completed");
  assert.equal(baseline.ok, true);

  const state = readyInProgressState();
  const result = applyEvidencedOutcomeWithRunTrack(state, "T1", report("completed"), {
    expectedOutcome: "completed",
    ...runTrackOption(entries),
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected allow");
  assert.ok(result.runTrack);
  assert.equal(result.runTrack.decision, "allow");
  assert.equal(result.runTrack.degraded, true);
  assert.equal(result.runTrack.occurrence, null);
  assert.equal(result.runTrack.receipt.degraded, true);
  assert.equal(state.tickets[0].status, "completed");
  // Owner note comes only from owner reportNote — Run Track must not alter it.
  assert.equal(state.tickets[0].note, baselineState.tickets[0].note);
  assert.match(state.tickets[0].note ?? "", /Evidence accepted: completed/);
  assert.doesNotMatch(state.tickets[0].note ?? "", /Run Track|self-attested|rt-eval/);
  // Owner accepted-report provenance matches direct path (no Run Track fields injected).
  assert.deepEqual(state.tickets[0].evidence, baselineState.tickets[0].evidence);
});

// ---------------------------------------------------------------------------
// Run Track does not rescue the owner gate
// ---------------------------------------------------------------------------

test("Run Track allow does not rescue an invalid owner completed report", () => {
  const state = readyInProgressState();
  const before = cloneState(state);
  // Elevated evidence → Run Track allow
  const entries = [started(), evidence({ trust: "operator-observed" })];
  // Owner-domain failure (stale parent-gate fingerprint) — same style as ticket-runner-state tests.
  // Parse may fail-closed as invalid-report or the owner gate may return completed-evidence-incomplete;
  // either way Run Track must not rewrite or rescue the refusal.
  const invalid = report("completed") as any;
  invalid.parentGate.observedFingerprint = "stale";

  const direct = applyEvidencedOutcome(cloneState(before), "T1", structuredClone(invalid), "completed");
  assert.equal(direct.ok, false);
  if (direct.ok) throw new Error("expected owner rejection");

  const result = applyEvidencedOutcomeWithRunTrack(state, "T1", structuredClone(invalid), {
    expectedOutcome: "completed",
    ...runTrackOption(entries),
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected owner rejection through adapter");
  // Owner failure preserved (not rewritten as a Run Track block/pause message).
  assert.equal(result.error.code, direct.error.code);
  assert.equal(result.error.message, direct.error.message);
  assert.notEqual(result.error.code, "invalid-transition");
  assert.doesNotMatch(result.error.message, /^Run Track /);
  // Run Track consulted and allowed — but never verifies/replaces domain evidence.
  assert.equal(result.runTrack?.decision, "allow");
  assert.equal(result.runTrack?.degraded, false);
  assert.equal(state.tickets[0].status, "in_progress");
  assert.deepEqual(state, before);
});

// ---------------------------------------------------------------------------
// Only the completed claim is gated
// ---------------------------------------------------------------------------

test("non-completed outcomes with runTrack present delegate unchanged (retry/failed/needs_decision)", () => {
  for (const outcome of ["retry", "failed", "blocked", "needs_decision"] as const) {
    const directState = readyInProgressState();
    const adapterState = cloneState(directState);
    const payload = report(outcome);
    // Even with empty/missing Run Track evidence, non-completed must not consult.
    const entries = [started()];

    const direct = applyEvidencedOutcome(directState, "T1", structuredClone(payload), outcome);
    const via = applyEvidencedOutcomeWithRunTrack(adapterState, "T1", structuredClone(payload), {
      expectedOutcome: outcome,
      ...runTrackOption(entries),
    });

    assert.deepEqual(stableResult(via), stableResult(direct), `outcome ${outcome} must match direct owner`);
    assert.deepEqual(stableState(adapterState), stableState(directState), `state for ${outcome} must match direct owner`);
    assert.equal("runTrack" in via, false, `Run Track must not be consulted for ${outcome}`);
  }
});

test("enabled path with a non-object report delegates without consulting or throwing", () => {
  // A null/array/primitive reportValue has no `requestedOutcome === "completed"`,
  // so the enabled adapter must bypass Run Track and pass it straight to the owner
  // (which rejects it as an invalid report) without ever throwing.
  const runTrackOption = { entries: [started()], action: "claim.complete", requiredKeys: ["tests"] };
  for (const bad of [null, [1, 2, 3], 42, "done"] as const) {
    const directState = readyInProgressState();
    const adapterState = cloneState(directState);
    const direct = applyEvidencedOutcome(directState, "T1", bad, "completed");
    const via = applyEvidencedOutcomeWithRunTrack(adapterState, "T1", bad, {
      expectedOutcome: "completed",
      runTrack: runTrackOption,
    });
    assert.equal("runTrack" in via, false, "non-object report must not consult Run Track");
    assert.deepEqual(stableResult(via), stableResult(direct));
    assert.deepEqual(stableState(adapterState), stableState(directState));
  }
});

test("unrelated owner transitions remain callable beside the adapter", () => {
  const state = baseState();
  startTicket(state, "T1");
  // Basic state-machine seam still works without going through the adapter.
  assert.equal(applyOutcome(state, "T1", "retry", "manual retry")?.status, "queued");
  const again = baseState();
  startTicket(again, "T1");
  withRecordedLease(again);
  assert.equal(applyEvidencedOutcome(again, "T1", report("retry"), "retry").ok, true);
  assert.equal(again.tickets[0].status, "queued");
});

// ---------------------------------------------------------------------------
// Pure consult helper + no circular authority / no duplicate completion state
// ---------------------------------------------------------------------------

test("consultRunTrackForOwnerCompletion is pure and returns only decision metadata", () => {
  const entries = [started(), evidence({ trust: "operator-observed" })];
  const first = consultRunTrackForOwnerCompletion({
    runTrackEntries: entries,
    action: COMPLETION_ACTION,
    requiredKeys: [...REQUIRED_KEYS],
  });
  const second = consultRunTrackForOwnerCompletion({
    runTrackEntries: entries,
    action: COMPLETION_ACTION,
    requiredKeys: [...REQUIRED_KEYS],
  });
  assert.deepEqual(first, second);
  assert.equal(first.decision, "allow");
  assert.equal(first.degraded, false);
  assert.equal(first.occurrence, null);
  assert.equal(first.receipt.ns, RUN_TRACK_NAMESPACE);
  assert.equal(first.receipt.decision, "allow");
  // Inputs untouched.
  assert.equal((entries[0] as { kind: string }).kind, "task.started");
});

test("adapter module holds no persistent state store and does not re-implement completion or all-session restore", async () => {
  const adapterPath = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "run-track-owner-adapter.ts");
  const source = readFileSync(adapterPath, "utf8");

  // No session-wide restore APIs.
  assert.equal(source.includes("getEntries"), false);
  assert.equal(source.includes("buildContextEntries"), false);
  // No local mutable store / singleton (ignore word-boundary hits inside comments/prose).
  assert.equal(/\blet\s+[A-Za-z_$]/.test(source), false);
  assert.equal(/\bvar\s+[A-Za-z_$]/.test(source), false);
  assert.equal(source.includes("new Map"), false);
  assert.equal(source.includes("new Set"), false);
  assert.equal(source.includes("globalThis"), false);
  assert.equal(source.includes("Map<"), false);
  assert.equal(/\b(stateStore|persistentState)\b/.test(source), false);
  // Does not re-implement owner completion gate or journal transition writes.
  assert.equal(source.includes("completionFailure"), false);
  assert.equal(source.includes("task.transition-observed"), false);
  assert.equal(source.includes("parseTeamOrchestrationEnvelope"), false);
  assert.equal(source.includes("appendEntry"), false);
  assert.equal(source.includes("sessionManager"), false);
  // Delegates to owner + pure Run Track core only.
  assert.match(source, /applyEvidencedOutcome/);
  assert.match(source, /projectRunTrackBranch/);
  assert.match(source, /planEvidenceTransition/);
  assert.match(source, /createRunTrackReceipt/);

  // Export surface: pure functions + types only (no state singleton export).
  const adapter = await import("../lib/run-track-owner-adapter.ts");
  const exportNames = Object.keys(adapter).sort();
  assert.deepEqual(exportNames, [
    "applyEvidencedOutcomeWithRunTrack",
    "consultRunTrackForOwnerCompletion",
  ]);
  assert.equal(typeof adapter.applyEvidencedOutcomeWithRunTrack, "function");
  assert.equal(typeof adapter.consultRunTrackForOwnerCompletion, "function");
});

test("operator-observed evidence allows non-degraded completion through adapter", () => {
  const state = readyInProgressState();
  const entries = [started(), evidence({ trust: "operator-observed" })];
  const result = applyEvidencedOutcomeWithRunTrack(state, "T1", report("completed"), {
    expectedOutcome: "completed",
    ...runTrackOption(entries),
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected success");
  assert.equal(result.runTrack?.decision, "allow");
  assert.equal(result.runTrack?.degraded, false);
  assert.equal(state.tickets[0].status, "completed");
});
