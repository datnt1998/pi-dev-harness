import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEvidencedOutcome,
  applyOutcome,
  createRunState,
  isBatchRunState,
  isTerminal,
  nextActionableTicket,
  propagateSkips,
  recordContinuation,
  recoveryGuidance,
  shouldContinue,
  startTicket,
  stopReason,
  summarize,
} from "../lib/ticket-runner-state.ts";

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

function report(outcome: "completed" | "retry" | "failed" | "blocked" = "completed") {
  const validationOutcome = outcome === "completed" ? "passed" : "failed";
  return {
    protocolVersion: 1,
    workUnit: { source: "tickets.md", sourceFingerprint: "fp", ticketId: "T1", purpose: "state gate", attempt: 1 },
    runs: [{ role: "producer", actor: "writer", runId: "run-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "producer", fallback: false } }],
    writerLease: { owner: "writer", phase: "closed", allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", closedAt: "2026-01-01" },
    implementation: { changedPaths: ["lib/x.ts"], fingerprint: "implementation" },
    producerObservations: [{ summary: "observed failure", locators: ["log:1"], replayCommands: ["node --test"] }],
    parentValidation: [{ command: "node --test", outcome: validationOutcome, locator: "log:2", observedFingerprint: "implementation" }],
    reviews: [
      { axis: "standards", run: { role: "standards-reviewer", actor: "standards", runId: "standards-1", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "standards", fallback: false } }, reviewedFingerprint: "implementation", verdict: "no-findings", findings: [] },
      { axis: "spec", run: { role: "spec-reviewer", actor: "spec", runId: "spec-1", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "spec", fallback: false } }, reviewedFingerprint: "implementation", verdict: "no-findings", findings: [] },
    ],
    dispositions: [], fixAndRereview: { round: 0, fixApplied: false },
    completionFidelity: { criteria: { C1: "verified", C2: "verified", C3: "verified", C4: "verified", C5: "verified", C6: "verified", C7: "verified" }, claims: [{ claim: "test", locator: "log:2", verifiedBy: "parent" }] },
    diversity: { achievedIndependence: "provider-distinct", degraded: false }, residualRisks: outcome === "completed" ? [] : ["safe to retry after changing implementation"], requestedOutcome: outcome,
    parentGate: { actor: "parent", role: "parent", action: outcome === "completed" ? "accepted" : "rejected", observedFingerprint: "implementation", evidenceLocator: "log:3" },
  } as any;
}

test("createRunState creates deterministic complete order from partial duplicate request", () => {
  const state = createRunState({
    batchId: "b", source: "s", fingerprint: "f", order: ["T2", "T2", "unknown"],
    tickets: [{ id: "T1", dependencies: [] }, { id: "T2", dependencies: [] }, { id: "T3", dependencies: [] }],
  });
  assert.deepEqual(state.order, ["T2", "T1", "T3"]);
  assert.equal(isBatchRunState(state), true);
});

test("createRunState drops self and unknown dependencies and defaults", () => {
  const state = createRunState({
    batchId: "b",
    source: "s",
    fingerprint: "f",
    order: ["T1"],
    tickets: [{ id: "T1", dependencies: ["T1", "T9"] }],
  });
  assert.deepEqual(state.tickets[0].dependencies, []);
  assert.equal(state.maxAttempts, 3);
  assert.equal(state.active, true);
  assert.equal(state.commit, false);
});

test("persisted state validation rejects malformed entries", () => {
  assert.equal(isBatchRunState(baseState()), true);
  assert.equal(isBatchRunState({ ...baseState(), version: 2 }), false);
  assert.equal(isBatchRunState({ ...baseState(), maxAttempts: -1 }), false);
  assert.equal(isBatchRunState({ ...baseState(), maxContinuations: -1 }), false);
  assert.equal(isBatchRunState({ ...baseState(), order: ["T1", "unknown"] }), false);
  assert.equal(isBatchRunState({ ...baseState(), tickets: [{ id: "T1", dependencies: ["unknown"], status: "queued", attempts: 0 }] }), false);
  assert.equal(isBatchRunState({ ...baseState(), tickets: [{ id: "T1", status: "bogus" }] }), false);
  assert.equal(isBatchRunState(undefined), false);

  const evidenced = baseState(); startTicket(evidenced, "T1");
  assert.equal(applyEvidencedOutcome(evidenced, "T1", report(), "completed").ok, true);
  const corrupt = structuredClone(evidenced) as any;
  corrupt.tickets[0].evidence.acceptedReports[0].report.protocolVersion = 2;
  assert.equal(isBatchRunState(corrupt), false);
  const mismatched = structuredClone(evidenced) as any;
  mismatched.tickets[0].evidence.acceptedReports[0].outcome = "failed";
  assert.equal(isBatchRunState(mismatched), false);
});

test("outcomes apply only to the in-progress ticket", () => {
  const state = baseState();
  assert.equal(applyOutcome(state, "T1", "completed"), undefined);
  startTicket(state, "T1");
  assert.equal(applyOutcome(state, "T2", "completed"), undefined);
  assert.equal(applyOutcome(state, "T1", "completed")?.status, "completed");
  assert.equal(applyOutcome(state, "T1", "failed"), undefined);
});

test("evidenced outcomes reject malformed and incomplete reports without mutation", () => {
  for (const outcome of ["completed", "retry", "failed", "blocked"] as const) {
    const state = baseState(); startTicket(state, "T1");
    const before = structuredClone(state);
    assert.equal(applyEvidencedOutcome(state, "T1", { prose: "done" }, outcome).ok, false);
    assert.deepEqual(state, before);
    const incomplete = report(outcome);
    if (outcome === "completed") incomplete.parentValidation = [];
    if (outcome === "retry") { incomplete.residualRisks = []; incomplete.parentValidation[0].outcome = "passed"; }
    if (outcome === "failed" || outcome === "blocked") incomplete.residualRisks = [];
    assert.equal(applyEvidencedOutcome(state, "T1", incomplete, outcome).ok, false);
    assert.deepEqual(state, before);
  }
});

test("unknown version and mismatched work unit leave state unchanged", () => {
  const state = baseState(); startTicket(state, "T1"); const before = structuredClone(state);
  const unknown = report(); unknown.protocolVersion = 2;
  assert.equal(applyEvidencedOutcome(state, "T1", unknown, "completed").ok, false);
  assert.deepEqual(state, before);
  const wrongTicket = report(); wrongTicket.workUnit.ticketId = "T2";
  assert.equal(applyEvidencedOutcome(state, "T1", wrongTicket, "completed").ok, false);
  assert.deepEqual(state, before);
});

test("retry, failed, and blocked require final-fingerprint parent rejection and failed-stage evidence", () => {
  for (const outcome of ["retry", "failed", "blocked"] as const) {
    for (const mutate of [
      (value: any) => { value.parentGate.action = "accepted"; },
      (value: any) => { value.parentGate.observedFingerprint = "stale"; },
      (value: any) => { value.parentValidation[0].observedFingerprint = "stale"; },
      (value: any) => { value.producerObservations[0].summary = ""; },
      (value: any) => { value.producerObservations[0].locators = []; },
      (value: any) => { value.producerObservations[0].replayCommands = []; },
      ...(outcome === "retry" ? [(value: any) => { value.residualRisks = []; }, (value: any) => { value.implementation.changedPaths = []; }] : []),
      ...((outcome === "failed" || outcome === "blocked") ? [(value: any) => { value.residualRisks = []; }] : []),
    ]) {
      const state = baseState(); startTicket(state, "T1"); const before = structuredClone(state);
      const invalid = report(outcome); mutate(invalid);
      assert.equal(applyEvidencedOutcome(state, "T1", invalid, outcome).ok, false);
      assert.deepEqual(state, before);
    }
  }
});

test("valid retry, failed, and blocked reports transition only after their evidence gate", () => {
  for (const outcome of ["retry", "failed", "blocked"] as const) {
    const state = baseState(); startTicket(state, "T1");
    assert.equal(applyEvidencedOutcome(state, "T1", report(outcome), outcome).ok, true);
    assert.equal(state.tickets[0].status, outcome === "retry" ? "queued" : outcome);
  }
});

test("evidenced completion transitions only its matching active ticket and derives note", () => {
  const state = baseState(); startTicket(state, "T1");
  const accepted = applyEvidencedOutcome(state, "T1", report(), "completed");
  assert.equal(accepted.ok, true);
  assert.equal(state.tickets[0].status, "completed");
  assert.match(state.tickets[0].note!, /Evidence accepted/);
  assert.equal(state.tickets[0].evidence?.acceptedReports.length, 1);
});

test("completion rejects stale fingerprints and unusable review verdicts without mutation", () => {
  for (const mutate of [
    (value: any) => { value.reviews[0].reviewedFingerprint = "stale"; },
    (value: any) => { value.parentValidation[0].observedFingerprint = "stale"; },
    (value: any) => { value.parentGate.observedFingerprint = "stale"; },
    (value: any) => { value.reviews[0].verdict = "unable-to-review"; },
    (value: any) => { value.reviews[0].verdict = "findings"; value.reviews[0].findings = []; },
    (value: any) => { value.reviews[0].verdict = "no-findings"; value.reviews[0].findings = [{ id: "F1", severity: "high", summary: "contradiction", locator: "log:4", replay: "node --test" }]; },
  ]) {
    const state = baseState(); startTicket(state, "T1"); const before = structuredClone(state);
    const invalid = report(); mutate(invalid);
    assert.equal(applyEvidencedOutcome(state, "T1", invalid, "completed").ok, false);
    assert.deepEqual(state, before);
  }
});

test("state-level needs_decision remains fail-closed until T3", () => {
  const state = baseState(); startTicket(state, "T1"); const before = structuredClone(state);
  const decision = report() as any; decision.requestedOutcome = "needs_decision";
  decision.diversity = { achievedIndependence: "provider-distinct", degraded: false };
  const result = applyEvidencedOutcome(state, "T1", decision, "needs_decision");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "needs-decision-requires-t3");
  assert.deepEqual(state, before);
});

test("degraded completion derives warning, actual topology, guidance, and continue acknowledgment", () => {
  const state = baseState(); startTicket(state, "T1");
  const degraded = report();
  degraded.runs[0].provider.provider = "shared";
  degraded.reviews[0].run.provider.provider = "shared";
  degraded.diversity = {
    achievedIndependence: "provider-overlap", degraded: true,
    warning: { targetTopology: "three providers", configuredProviders: ["shared", "spec"], actualProviders: ["shared", "shared", "spec"], missingOrOverlapping: "producer overlaps Standards", qualityConsequence: "correlated blind spots", configurationGuidance: "configure distinct providers" },
    acknowledgment: { actor: "operator", at: "2026-01-01", decision: "continue", reason: "accepted degradation" },
  };
  assert.equal(applyEvidencedOutcome(state, "T1", degraded, "completed").ok, true);
  assert.match(state.tickets[0].note!, /DEGRADED provider-overlap/);
  assert.match(state.tickets[0].note!, /target three providers/);
  assert.match(state.tickets[0].note!, /configured shared, spec/);
  assert.match(state.tickets[0].note!, /producer=shared \(fallback no; thinking unknown\)/);
  assert.match(state.tickets[0].note!, /Standards=shared \(fallback no; thinking unknown\)/);
  assert.match(state.tickets[0].note!, /Spec=spec \(fallback no; thinking unknown\)/);
  assert.match(state.tickets[0].note!, /producer overlaps Standards/);
  assert.match(state.tickets[0].note!, /correlated blind spots/);
  assert.match(state.tickets[0].note!, /configure distinct providers/);
  assert.match(state.tickets[0].note!, /operator continue/);
  assert.match(state.tickets[0].note!, /because accepted degradation/);
});

test("accepted evidence is cloned and retains pending retry evidence after a later terminal report", () => {
  const state = baseState(); startTicket(state, "T1");
  const retry = report("retry");
  assert.equal(applyEvidencedOutcome(state, "T1", retry, "retry").ok, true);
  retry.residualRisks[0] = "mutated outside state";
  assert.notEqual(state.tickets[0].evidence?.pendingEvidence?.residualRisks[0], "mutated outside state");
  startTicket(state, "T1");
  const failed = report("failed"); failed.workUnit.attempt = 2;
  assert.equal(applyEvidencedOutcome(state, "T1", failed, "failed").ok, true);
  assert.equal(state.tickets[0].evidence?.acceptedReports.length, 2);
  assert.equal(state.tickets[0].evidence?.pendingEvidence?.requestedOutcome, "retry");
});

test("retry preserves accepted provenance and pending evidence across reconstruction", () => {
  const state = baseState(); startTicket(state, "T1");
  assert.equal(applyEvidencedOutcome(state, "T1", report("retry"), "retry").ok, true);
  assert.equal(state.tickets[0].status, "queued");
  assert.equal(state.tickets[0].evidence?.acceptedReports.length, 1);
  assert.ok(state.tickets[0].evidence?.pendingEvidence);
  assert.equal(isBatchRunState(structuredClone(state)), true);
});

test("legacy state remains readable with deterministic recovery guidance", () => {
  const state = baseState();
  assert.equal(isBatchRunState(state), true);
  assert.match(recoveryGuidance(state.tickets[0])!, /re-gate, revalidate, and re-review/);
});

test("actionable ticket respects dependency order", () => {
  const state = baseState();
  assert.equal(nextActionableTicket(state)?.id, "T1");
  startTicket(state, "T1");
  assert.equal(nextActionableTicket(state), undefined); // T2 waits on T1
  applyOutcome(state, "T1", "completed");
  assert.equal(nextActionableTicket(state)?.id, "T2");
});

test("retry re-queues until maxAttempts then fails", () => {
  const state = baseState();
  startTicket(state, "T1"); // attempt 1
  applyOutcome(state, "T1", "retry");
  assert.equal(state.tickets[0].status, "queued");
  startTicket(state, "T1"); // attempt 2
  applyOutcome(state, "T1", "retry");
  startTicket(state, "T1"); // attempt 3
  applyOutcome(state, "T1", "retry");
  assert.equal(state.tickets[0].status, "failed");
  assert.equal(state.tickets[0].attempts, 3);
});

test("failed dependency skips descendants transitively", () => {
  const state = baseState();
  startTicket(state, "T1");
  applyOutcome(state, "T1", "failed");
  propagateSkips(state);
  const s = summarize(state);
  assert.equal(state.tickets.find((t) => t.id === "T2")?.status, "skipped");
  assert.equal(state.tickets.find((t) => t.id === "T3")?.status, "skipped");
  assert.equal(s.skipped, 2);
  assert.equal(isTerminal(state), true);
  assert.equal(stopReason(state), "blocked");
});

test("independent tickets keep running when one needs a decision", () => {
  const state = createRunState({
    batchId: "b",
    source: "s",
    fingerprint: "f",
    order: ["T1", "T2"],
    tickets: [
      { id: "T1", dependencies: [] },
      { id: "T2", dependencies: [] },
    ],
    now: 1,
  });
  startTicket(state, "T1");
  applyOutcome(state, "T1", "needs_decision", "which API?");
  // T2 is independent and still actionable
  assert.equal(nextActionableTicket(state)?.id, "T2");
  assert.equal(shouldContinue(state), true);
  startTicket(state, "T2");
  applyOutcome(state, "T2", "completed");
  assert.equal(isTerminal(state), true);
  assert.equal(stopReason(state), "needs_decision");
});

test("completed batch reports completed", () => {
  const state = baseState();
  for (const id of ["T1", "T2", "T3"]) {
    startTicket(state, id);
    applyOutcome(state, id, "completed");
  }
  assert.equal(isTerminal(state), true);
  assert.equal(stopReason(state), "completed");
  assert.equal(summarize(state).completed, 3);
});

test("an in-progress ticket keeps the batch running across turns", () => {
  const state = baseState();
  startTicket(state, "T1");
  // Agent settled mid-ticket without reporting: still resumable, not stopped.
  assert.equal(stopReason(state), "running");
  assert.equal(shouldContinue(state), true);
});

test("continuation guard stops runaway loops", () => {
  const state = baseState();
  state.maxContinuations = 2;
  assert.equal(shouldContinue(state), true);
  recordContinuation(state);
  recordContinuation(state);
  assert.equal(shouldContinue(state), false);
  assert.equal(stopReason(state), "max_continuations");
});
