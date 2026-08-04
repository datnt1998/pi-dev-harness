import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireBatchWriterLease,
  applyEvidencedOutcome,
  applyOutcome,
  assertBatchReviewAllowed,
  closeBatchWriterLease,
  createRunState,
  deactivate,
  isBatchRunState,
  isTerminal,
  nextActionableTicket,
  propagateSkips,
  reconcileBatchWriterLease,
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

function reportFor(ticketId: string, attempt: number, outcome: "completed" | "retry" | "failed" | "blocked" | "needs_decision" = "completed") {
  const validationOutcome = outcome === "completed" ? "passed" : "failed";
  return {
    protocolVersion: 1,
    workUnit: { source: "tickets.md", sourceFingerprint: "fp", ticketId, purpose: "state gate", attempt },
    runs: [{ role: "producer", actor: "writer", runId: "run-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "producer", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }],
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
    writerLease: { leaseId: "lease-1", ticketId, attempt, worktreeKey: "active", owner: "writer", ownerRole: "parent", phase: "closed", allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", closedAt: "2026-01-01", handoffFingerprint: "implementation" },
    implementation: { changedPaths: ["lib/x.ts"], fingerprint: "implementation" },
    producerObservations: [{ summary: "observed failure", locators: ["log:1"], replayCommands: ["node --test"] }],
    parentValidation: [{ command: "node --test", outcome: validationOutcome, locator: "log:2", observedFingerprint: "implementation" }],
    reviews: [
      { axis: "standards", run: { role: "standards-reviewer", actor: "standards", runId: "standards-1", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "standards", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }, reviewedFingerprint: "implementation", sealing: { mode: "capability", readOnlyCapabilities: ["read", "search"], evidenceLocator: "seal:standards" }, verdict: "no-findings", findings: [] },
      { axis: "spec", run: { role: "spec-reviewer", actor: "spec", runId: "spec-1", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "spec", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }, reviewedFingerprint: "implementation", sealing: { mode: "serialized", preMutationFingerprint: "implementation", postMutationFingerprint: "implementation", evidenceLocator: "seal:spec" }, verdict: "no-findings", findings: [] },
    ],
    dispositions: [], fixAndRereview: { round: 0, fixApplied: false },
    completionFidelity: { criteria: { C1: "verified", C2: "verified", C3: "verified", C4: "verified", C5: "verified", C6: "verified", C7: "verified" }, claims: [{ claim: "test", locator: "log:2", verifiedBy: "parent" }] },
    diversity: { achievedIndependence: "provider-distinct", degraded: false, cleanPilotEvidence: true }, residualRisks: outcome === "completed" ? [] : ["safe to retry after changing implementation"], requestedOutcome: outcome,
    ...(outcome === "needs_decision" ? { decisionPacket: { affectedWorkUnitIds: [ticketId], affectedTicketIds: [ticketId], affectedFiles: ["lib/x.ts"], locatorOrGlob: "lib/x.ts:1", searchedScope: "lib", exclusions: ["node_modules"], pattern: "missing invariant", patternKind: "decision-category", occurrences: 1, representativeLocators: ["lib/x.ts:1"], question: "Which behavior should apply?", safeDefault: "Leave the current behavior unchanged.", consequences: "Callers retain existing semantics.", replayCommand: "rg invariant lib", disconfirmProcedure: "Inspect the representative locator.", blockedStage: "implementation", unrelatedWorkSafe: true } } : {}),
    parentGate: { actor: "parent", role: "parent", action: outcome === "completed" ? "accepted" : "escalated", observedFingerprint: "implementation", evidenceLocator: "log:3" },
  } as any;
}

function report(outcome: "completed" | "retry" | "failed" | "blocked" | "needs_decision" = "completed") {
  return reportFor("T1", 1, outcome);
}

function withRecordedLease(state: ReturnType<typeof baseState>, leaseId = "lease-1", fingerprint = "implementation") {
  assert.equal(acquireBatchWriterLease(state, {
    leaseId, worktreeKey: "active", owner: "writer", ownerRole: "parent", phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01",
  }).ok, true);
  assert.equal(closeBatchWriterLease(state, {
    leaseId, owner: "writer", closedAt: "2026-01-01", handoffFingerprint: fingerprint,
  }).ok, true);
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

  const evidenced = baseState(); startTicket(evidenced, "T1"); withRecordedLease(evidenced);
  assert.equal(applyEvidencedOutcome(evidenced, "T1", report(), "completed").ok, true);
  const corrupt = structuredClone(evidenced) as any;
  corrupt.tickets[0].evidence.acceptedReports[0].report.protocolVersion = 2;
  assert.equal(isBatchRunState(corrupt), false);
  const mismatched = structuredClone(evidenced) as any;
  mismatched.tickets[0].evidence.acceptedReports[0].outcome = "failed";
  assert.equal(isBatchRunState(mismatched), false);

  const indexed = baseState(); startTicket(indexed, "T1");
  assert.equal(applyEvidencedOutcome(indexed, "T1", report("needs_decision"), "needs_decision").ok, true);
  const hollowIndex = structuredClone(indexed) as any;
  hollowIndex.decisionIndex = [null];
  assert.doesNotThrow(() => isBatchRunState(hollowIndex));
  assert.equal(isBatchRunState(hollowIndex), false);
  const corruptIndex = structuredClone(indexed) as any;
  corruptIndex.decisionIndex[0].packet = { question: "hollow" };
  assert.doesNotThrow(() => isBatchRunState(corruptIndex));
  assert.equal(isBatchRunState(corruptIndex), false);
  const duplicateIndex = structuredClone(indexed) as any;
  duplicateIndex.decisionIndex.push(structuredClone(duplicateIndex.decisionIndex[0]));
  assert.equal(isBatchRunState(duplicateIndex), false);
  const incoherentIndex = structuredClone(indexed) as any;
  incoherentIndex.decisionIndex[0].packet.affectedTicketIds = ["unknown"];
  assert.equal(isBatchRunState(incoherentIndex), false);
  const stalePending = structuredClone(indexed) as any;
  stalePending.tickets[0].evidence.pendingDecision.consequences = "stale denormalization";
  assert.equal(isBatchRunState(stalePending), false);
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

test("contradictory pilot terminal outcome is rejected before state mutation", () => {
  const state = baseState(); startTicket(state, "T1");
  const before = structuredClone(state);
  const contradictory = report("retry");
  contradictory.eligibility = {
    ...contradictory.eligibility,
    lane: "worker", reasonCode: "frozen-bounded-worker", pilotMember: true, tinyKnownDiff: false,
  };
  contradictory.pilotMetrics = {
    primary: true, realWork: true, testBar: "test-bar", attribution: "verified", usageAttribution: "verified",
    falseClaims: [], parentRework: [], parentValidationDiagnostic: "validation:1",
    productionScarcePremiumCalls: 1, arbitrationScarcePremiumCalls: 0, meteredSpend: 1,
    flatFeeOutputTokens: 0, flatFeePrice: 0, latencyMs: 10, baselineLocator: "baseline:1",
    baselineMatched: true, baselineProductionScarcePremiumCallsPerTicket: 2, baselineLatencyMs: 20,
    routeSnapshotLocator: "route:1", terminalOutcome: "completed",
  };
  assert.equal(applyEvidencedOutcome(state, "T1", contradictory, "retry").ok, false);
  assert.deepEqual(state, before);
});

test("valid retry, failed, and blocked reports transition only after their evidence gate", () => {
  for (const outcome of ["retry", "failed", "blocked"] as const) {
    const state = baseState(); startTicket(state, "T1");
    assert.equal(applyEvidencedOutcome(state, "T1", report(outcome), outcome).ok, true);
    assert.equal(state.tickets[0].status, outcome === "retry" ? "queued" : outcome);
  }
});

test("evidenced completion transitions only its matching active ticket and derives note", () => {
  const state = baseState(); startTicket(state, "T1"); withRecordedLease(state);
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

test("needs_decision rejects missing or non-replayable packets without mutation", () => {
  for (const mutate of [
    (value: any) => { delete value.decisionPacket; },
    (value: any) => { value.decisionPacket.replayCommand = ""; },
    (value: any) => { value.decisionPacket.affectedFiles = []; },
  ]) {
    const state = baseState(); startTicket(state, "T1"); const before = structuredClone(state);
    const decision = report("needs_decision"); mutate(decision);
    assert.equal(applyEvidencedOutcome(state, "T1", decision, "needs_decision").ok, false);
    assert.deepEqual(state, before);
  }
});

test("equivalent decisions merge evidence, persist, block dependents, and retain unrelated work", () => {
  const state = createRunState({ batchId: "b", source: "tickets.md", fingerprint: "fp", order: ["T1", "T2", "T3"], tickets: [{ id: "T1", dependencies: [] }, { id: "T2", dependencies: ["T1"] }, { id: "T3", dependencies: [] }], now: 1 });
  startTicket(state, "T1"); assert.equal(applyEvidencedOutcome(state, "T1", report("needs_decision"), "needs_decision").ok, true);
  assert.equal(state.tickets.find((ticket) => ticket.id === "T2")?.status, "skipped");
  assert.equal(nextActionableTicket(state)?.id, "T3");
  startTicket(state, "T3"); const second = reportFor("T3", 1, "needs_decision");
  second.decisionPacket.affectedFiles = ["tests/x.ts"]; second.decisionPacket.representativeLocators = ["tests/x.ts:2"]; second.decisionPacket.replayCommand = "rg invariant tests"; second.decisionPacket.disconfirmProcedure = "Inspect test locator.";
  assert.equal(applyEvidencedOutcome(state, "T3", second, "needs_decision").ok, true);
  assert.equal(state.decisionIndex?.length, 1);
  const merged = state.decisionIndex![0].packet;
  assert.deepEqual(merged.affectedTicketIds, ["T1", "T3"]);
  assert.deepEqual(merged.affectedFiles, ["lib/x.ts", "tests/x.ts"]);
  assert.match(merged.replayCommand, /rg invariant lib; then rg invariant tests/);
  assert.equal(isBatchRunState(structuredClone(state)), true);
  assert.match(state.tickets.find((ticket) => ticket.id === "T1")?.note!, /Which behavior should apply\?/);
  assert.match(state.tickets.find((ticket) => ticket.id === "T1")?.note!, /Safe default:/);
  assert.match(state.tickets.find((ticket) => ticket.id === "T1")?.note!, /Consequences:/);
  assert.match(state.tickets.find((ticket) => ticket.id === "T1")?.note!, /Replay: rg invariant lib/);
});

test("needs_decision rejects unknown affected work units before mutation", () => {
  const state = baseState(); startTicket(state, "T1"); const before = structuredClone(state);
  const decision = report("needs_decision");
  decision.decisionPacket.affectedWorkUnitIds.push("unknown");
  decision.decisionPacket.affectedTicketIds.push("unknown");
  const result = applyEvidencedOutcome(state, "T1", decision, "needs_decision");
  assert.equal(result.ok, false);
  assert.deepEqual(state, before);
});

test("a packet may pre-list known affected tickets and still round-trip before their own escalation", () => {
  const state = createRunState({ batchId: "b", source: "tickets.md", fingerprint: "fp", order: ["T1", "T2"], tickets: [{ id: "T1", dependencies: [] }, { id: "T2", dependencies: [] }], now: 1 });
  startTicket(state, "T1");
  const decision = report("needs_decision");
  decision.decisionPacket.affectedWorkUnitIds = ["T1", "T2"];
  decision.decisionPacket.affectedTicketIds = ["T1", "T2"];
  assert.equal(applyEvidencedOutcome(state, "T1", decision, "needs_decision").ok, true);
  assert.equal(state.tickets[1].status, "queued");
  assert.equal(isBatchRunState(structuredClone(state)), true);
  assert.deepEqual(state.decisionIndex?.[0].packet.affectedTicketIds, ["T1", "T2"]);
});

test("equivalent decision merge reconstructs earlier pending state without rewriting provenance", () => {
  const state = createRunState({ batchId: "b", source: "tickets.md", fingerprint: "fp", order: ["T1", "T2", "T3"], tickets: [{ id: "T1", dependencies: [] }, { id: "T2", dependencies: [] }, { id: "T3", dependencies: [] }], now: 1 });
  startTicket(state, "T1"); assert.equal(applyEvidencedOutcome(state, "T1", report("needs_decision"), "needs_decision").ok, true);
  const firstReport = structuredClone(state.tickets[0].evidence!.acceptedReports[0].report);
  startTicket(state, "T2"); const second = reportFor("T2", 1, "needs_decision");
  second.decisionPacket.affectedFiles = ["tests/x.ts"]; second.decisionPacket.representativeLocators = ["tests/x.ts:2"]; second.decisionPacket.consequences = "Tests retain existing semantics."; second.decisionPacket.occurrences = 2;
  assert.equal(applyEvidencedOutcome(state, "T2", second, "needs_decision").ok, true);
  const canonical = state.decisionIndex![0].packet;
  assert.deepEqual(canonical.affectedTicketIds, ["T1", "T2"]);
  assert.deepEqual(state.tickets[0].evidence?.pendingDecision, canonical);
  assert.deepEqual(state.tickets[1].evidence?.pendingDecision, canonical);
  assert.match(state.tickets[0].note!, /Callers retain existing semantics/);
  assert.match(state.tickets[0].note!, /Tests retain existing semantics/);
  assert.deepEqual(state.tickets[0].evidence?.acceptedReports[0].report, firstReport);
  assert.equal(canonical.occurrences, 2); // max avoids double-counting overlapping searches

  startTicket(state, "T3"); const uncounted = reportFor("T3", 1, "needs_decision");
  delete uncounted.decisionPacket.occurrences; uncounted.decisionPacket.notCountedReason = "Generated files prevent a reliable count."; uncounted.decisionPacket.unrelatedWorkSafe = false;
  assert.equal(applyEvidencedOutcome(state, "T3", uncounted, "needs_decision").ok, true);
  assert.equal(state.decisionIndex![0].packet.occurrences, 2);
  assert.equal(state.decisionIndex![0].packet.notCountedReason, undefined);
  assert.equal(state.decisionIndex![0].packet.unrelatedWorkSafe, false);
  assert.equal(isBatchRunState(structuredClone(state)), true);
});

test("changed owner question at the same structural locus does not merge", () => {
  const state = createRunState({ batchId: "b", source: "tickets.md", fingerprint: "fp", order: ["T1", "T2"], tickets: [{ id: "T1", dependencies: [] }, { id: "T2", dependencies: [] }], now: 1 });
  startTicket(state, "T1"); assert.equal(applyEvidencedOutcome(state, "T1", report("needs_decision"), "needs_decision").ok, true);
  startTicket(state, "T2"); const different = reportFor("T2", 1, "needs_decision"); different.decisionPacket.question = "Which compatibility contract should apply?";
  assert.equal(applyEvidencedOutcome(state, "T2", different, "needs_decision").ok, true);
  assert.equal(state.decisionIndex?.length, 2);
});

test("packet-bearing non-decision reports reject atomically without index pollution", () => {
  const state = baseState(); startTicket(state, "T1"); const before = structuredClone(state);
  const invalid = report();
  invalid.decisionPacket = structuredClone(report("needs_decision").decisionPacket);
  assert.equal(applyEvidencedOutcome(state, "T1", invalid, "completed").ok, false);
  assert.deepEqual(state, before);
});

test("unsafe decisions stop unrelated scheduling while safe decisions permit it", () => {
  for (const unrelatedWorkSafe of [false, true]) {
    const state = createRunState({ batchId: "b", source: "tickets.md", fingerprint: "fp", order: ["T1", "T2"], tickets: [{ id: "T1", dependencies: [] }, { id: "T2", dependencies: [] }], now: 1 });
    startTicket(state, "T1"); const decision = report("needs_decision"); decision.decisionPacket.unrelatedWorkSafe = unrelatedWorkSafe;
    assert.equal(applyEvidencedOutcome(state, "T1", decision, "needs_decision").ok, true);
    assert.equal(nextActionableTicket(state)?.id, unrelatedWorkSafe ? "T2" : undefined);
    assert.equal(shouldContinue(state), unrelatedWorkSafe);
    assert.equal(stopReason(state), unrelatedWorkSafe ? "running" : "needs_decision");
  }
});

test("degraded completion derives warning, actual topology, guidance, and continue acknowledgment", () => {
  const state = baseState(); startTicket(state, "T1"); withRecordedLease(state);
  const degraded = report();
  degraded.runs[0].provider.provider = "shared";
  degraded.reviews[0].run.provider.provider = "shared";
  degraded.diversity = {
    achievedIndependence: "provider-overlap", degraded: true, cleanPilotEvidence: false,
    warning: { targetTopology: "three providers", configuredProviders: ["shared", "shared", "spec"], actualProviders: ["shared", "shared", "spec"], missingOrOverlapping: "producer overlaps Standards", qualityConsequence: "correlated blind spots", configurationGuidance: "configure distinct providers" },
    acknowledgment: { actor: "operator", at: "2026-01-01", decision: "continue", reason: "accepted degradation" },
  };
  assert.equal(applyEvidencedOutcome(state, "T1", degraded, "completed").ok, true);
  assert.match(state.tickets[0].note!, /DEGRADED provider-overlap/);
  assert.match(state.tickets[0].note!, /target three providers/);
  assert.match(state.tickets[0].note!, /configured shared, shared, spec/);
  assert.match(state.tickets[0].note!, /producer=shared \(fallback no; thinking verified\)/);
  assert.match(state.tickets[0].note!, /Standards=shared \(fallback no; thinking verified\)/);
  assert.match(state.tickets[0].note!, /Spec=spec \(fallback no; thinking verified\)/);
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
  const failed = reportFor("T1", 2, "failed");
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

test("batch writer leases are exclusive, block review while open, and survive resume checks", () => {
  const state = baseState();
  startTicket(state, "T1");
  const first = acquireBatchWriterLease(state, {
    leaseId: "lease-1", worktreeKey: "active", owner: "writer", ownerRole: "parent", phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01",
  });
  assert.equal(first.ok, true);
  assert.equal(assertBatchReviewAllowed(state).ok, false);
  const second = acquireBatchWriterLease(state, {
    leaseId: "lease-2", worktreeKey: "active", owner: "other", ownerRole: "worker", phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01",
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.error.code, "overlap");
  assert.equal(isBatchRunState(structuredClone(state)), true);
  assert.equal(reconcileBatchWriterLease(state).ok, true);

  const closed = closeBatchWriterLease(state, { leaseId: "lease-1", owner: "writer", closedAt: "2026-01-01", handoffFingerprint: "implementation" });
  assert.equal(closed.ok, true);
  assert.equal(assertBatchReviewAllowed(state).ok, true);
  assert.equal(state.activeWriterLease, undefined);
  assert.equal(state.lastClosedWriterLease?.handoffFingerprint, "implementation");

  // Orphaned lease after the ticket leaves in_progress fails closed on reconcile.
  startTicket(state, "T1");
  assert.equal(acquireBatchWriterLease(state, {
    leaseId: "lease-3", worktreeKey: "active", owner: "writer", ownerRole: "parent", phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-02",
  }).ok, true);
  state.tickets[0].status = "completed";
  const orphan = reconcileBatchWriterLease(state);
  assert.equal(orphan.ok, false);
  if (!orphan.ok) assert.equal(orphan.error.code, "orphan");
});

test("evidenced completion rejects contradictory open leases and clears a matching closed handoff", () => {
  const state = baseState();
  startTicket(state, "T1");
  assert.equal(acquireBatchWriterLease(state, {
    leaseId: "lease-1", worktreeKey: "active", owner: "writer", ownerRole: "parent", phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01",
  }).ok, true);
  const contradiction = report();
  contradiction.writerLease.leaseId = "other-lease";
  const before = structuredClone(state);
  assert.equal(applyEvidencedOutcome(state, "T1", contradiction, "completed").ok, false);
  assert.deepEqual(state.activeWriterLease, before.activeWriterLease);

  assert.equal(applyEvidencedOutcome(state, "T1", report(), "completed").ok, true);
  assert.equal(state.activeWriterLease, undefined);
  assert.equal(state.lastClosedWriterLease?.leaseId, "lease-1");
  assert.equal(state.tickets[0].status, "completed");
  assert.equal((state.writerLeaseHistory ?? []).some((lease) => lease.leaseId === "lease-1"), true);
});

test("self-asserted closed completion without a recorded lease is rejected", () => {
  const state = baseState(); startTicket(state, "T1"); const before = structuredClone(state);
  const result = applyEvidencedOutcome(state, "T1", report(), "completed");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, /Self-asserted closed writer lease/);
  assert.deepEqual(state, before);
});

test("non-completed outcomes cannot leave an open lease orphaned", () => {
  const state = baseState(); startTicket(state, "T1");
  assert.equal(acquireBatchWriterLease(state, {
    leaseId: "lease-open", worktreeKey: "active", owner: "writer", ownerRole: "parent", phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01",
  }).ok, true);
  const openRetry = report("retry");
  openRetry.writerLease.phase = "implementation";
  delete openRetry.writerLease.closedAt;
  delete openRetry.writerLease.handoffFingerprint;
  const before = structuredClone(state);
  assert.equal(applyEvidencedOutcome(state, "T1", openRetry, "retry").ok, false);
  assert.deepEqual(state, before);

  const closedRetry = report("retry");
  closedRetry.writerLease.leaseId = "lease-open";
  assert.equal(applyEvidencedOutcome(state, "T1", closedRetry, "retry").ok, true);
  assert.equal(state.activeWriterLease, undefined);
  assert.equal(state.tickets[0].status, "queued");
  assert.equal(state.lastClosedWriterLease?.leaseId, "lease-open");
});

test("isBatchRunState rejects orphaned open leases and deactivate clears mutation authority", () => {
  const state = baseState(); startTicket(state, "T1");
  assert.equal(acquireBatchWriterLease(state, {
    leaseId: "lease-1", worktreeKey: "active", owner: "writer", ownerRole: "parent", phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01",
  }).ok, true);
  assert.equal(isBatchRunState(structuredClone(state)), true);
  state.tickets[0].status = "queued";
  assert.equal(isBatchRunState(structuredClone(state)), false);
  state.tickets[0].status = "in_progress";
  deactivate(state, "source_changed");
  assert.equal(state.activeWriterLease, undefined);
  assert.equal(state.tickets[0].status, "queued");
  assert.equal(isBatchRunState(structuredClone(state)), true);
});

test("fix lease paths must stay inside brief and eligibility scope at batch acquire", () => {
  const state = baseState(); startTicket(state, "T1");
  const dispositions = [{ findingId: "F1", disposition: "accepted" as const, parentActor: "parent", evidenceLocator: "d:1" }];
  const brief = { briefId: "fix-1", parentActor: "parent", acceptedFindingIds: ["F1"], scopePaths: ["lib/x.ts"], summary: "fix", issuedAt: "2026-01-01" };
  const outside = acquireBatchWriterLease(state, {
    leaseId: "fix-1", worktreeKey: "active", owner: "fix-writer", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/y.ts"], openedAt: "2026-01-01", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, priorFixRounds: 0, implementationScopePaths: ["lib/x.ts", "lib/y.ts"] });
  assert.equal(outside.ok, false);
  const ok = acquireBatchWriterLease(state, {
    leaseId: "fix-1", worktreeKey: "active", owner: "fix-writer", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, priorFixRounds: 0, implementationScopePaths: ["lib/x.ts"] });
  assert.equal(ok.ok, true);
});

test("fixApplied completion requires implementation-then-fix lease history and rejects bare fix evidence", () => {
  const state = baseState(); startTicket(state, "T1");
  withRecordedLease(state, "impl-lease", "implementation");
  const dispositions = [{ findingId: "F1", disposition: "accepted" as const, parentActor: "parent", evidenceLocator: "d:1" }];
  const brief = { briefId: "fix-1", parentActor: "parent", acceptedFindingIds: ["F1"], scopePaths: ["lib/x.ts"], summary: "fix", issuedAt: "2026-01-02" };
  assert.equal(acquireBatchWriterLease(state, {
    leaseId: "fix-lease", ticketId: "T1", attempt: 1, worktreeKey: "active", owner: "fix-writer", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-02", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, implementationScopePaths: ["lib/x.ts"] }).ok, true);
  assert.equal(closeBatchWriterLease(state, {
    leaseId: "fix-lease", owner: "fix-writer", closedAt: "2026-01-02", handoffFingerprint: "implementation",
  }).ok, true);

  const fixed = report();
  fixed.reviews[0].verdict = "findings";
  fixed.reviews[0].findings = [{ id: "F1", severity: "medium", summary: "nit", locator: "lib/x.ts:1", replay: "node --test" }];
  fixed.dispositions = dispositions;
  const fixLease = {
    leaseId: "fix-lease", ticketId: "T1", attempt: 1, worktreeKey: "active", owner: "fix-writer", ownerRole: "fix-writer", phase: "closed",
    allowedPaths: ["lib/x.ts"], openedAt: "2026-01-02", closedAt: "2026-01-02", handoffFingerprint: "implementation", fixBriefId: "fix-1",
  };
  fixed.writerLease = { ...fixLease };
  fixed.fixAndRereview = {
    round: 1,
    fixApplied: true,
    fixBrief: brief,
    fixLease,
    fixValidation: [{ command: "node --test", outcome: "passed", locator: "log:fix", observedFingerprint: "implementation" }],
    focusedRereview: structuredClone(fixed.reviews).map((review: any, index: number) => ({
      ...review,
      run: { ...review.run, runId: `re-${index}` },
      verdict: "no-findings",
      findings: [],
    })),
  };
  assert.equal(applyEvidencedOutcome(state, "T1", fixed, "completed").ok, true);
  assert.equal((state.writerLeaseHistory ?? []).filter((lease) => lease.ownerRole === "fix-writer").length, 1);
  assert.equal((state.writerLeaseHistory ?? []).some((lease) => lease.leaseId === "impl-lease"), true);
});

test("closed lease history is scoped to each ticket attempt", () => {
  const state = createRunState({ batchId: "b", source: "tickets.md", fingerprint: "fp", order: ["T1", "T2"], tickets: [{ id: "T1", dependencies: [] }, { id: "T2", dependencies: [] }], now: 1 });
  const dispositions = [{ findingId: "F1", disposition: "accepted" as const, parentActor: "parent", evidenceLocator: "d:1" }];
  const brief = { briefId: "fix-1", parentActor: "parent", acceptedFindingIds: ["F1"], scopePaths: ["lib/x.ts"], summary: "fix", issuedAt: "2026-01-01" };

  startTicket(state, "T1");
  assert.equal(acquireBatchWriterLease(state, { leaseId: "t1-fix", worktreeKey: "active", owner: "fix", ownerRole: "fix-writer", phase: "fix", ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", fixBriefId: "fix-1" }, { dispositions, fixBrief: brief, implementationScopePaths: ["lib/x.ts"] }).ok, true);
  assert.equal(closeBatchWriterLease(state, { leaseId: "t1-fix", owner: "fix", closedAt: "2026-01-01", handoffFingerprint: "implementation" }).ok, true);
  state.tickets[0].status = "completed";

  startTicket(state, "T2");
  assert.equal(acquireBatchWriterLease(state, { leaseId: "t2-fix", worktreeKey: "active", owner: "fix", ownerRole: "fix-writer", phase: "fix", ticketId: "T2", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-02", fixBriefId: "fix-1" }, { dispositions, fixBrief: brief, implementationScopePaths: ["lib/x.ts"] }).ok, true);
  assert.equal(closeBatchWriterLease(state, { leaseId: "t2-fix", owner: "fix", closedAt: "2026-01-02", handoffFingerprint: "implementation" }).ok, true);
  assert.equal(isBatchRunState(structuredClone(state)), true);

  const wrongTicket = reportFor("T2", 1);
  wrongTicket.writerLease = structuredClone(state.writerLeaseHistory![0]);
  assert.equal(applyEvidencedOutcome(state, "T2", wrongTicket, "completed").ok, false);
});

test("fix lease acquisition requires parent dispositions and blocks a second ordinary round", () => {
  const state = baseState();
  startTicket(state, "T1");
  const dispositions = [{ findingId: "F1", disposition: "accepted" as const, parentActor: "parent", evidenceLocator: "d:1" }];
  const brief = { briefId: "fix-1", parentActor: "parent", acceptedFindingIds: ["F1"], scopePaths: ["lib/x.ts"], summary: "apply accepted fix", issuedAt: "2026-01-01" };
  const missing = acquireBatchWriterLease(state, {
    leaseId: "fix-1", worktreeKey: "active", owner: "fix-writer", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", fixBriefId: "fix-1",
  });
  assert.equal(missing.ok, false);
  const first = acquireBatchWriterLease(state, {
    leaseId: "fix-1", worktreeKey: "active", owner: "fix-writer", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, priorFixRounds: 0 });
  assert.equal(first.ok, true);
  assert.equal(closeBatchWriterLease(state, { leaseId: "fix-1", owner: "fix-writer", closedAt: "2026-01-01", handoffFingerprint: "implementation" }).ok, true);
  const second = acquireBatchWriterLease(state, {
    leaseId: "fix-2", worktreeKey: "active", owner: "fix-writer", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-02", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, priorFixRounds: 1 });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.error.code, "fix-round-exhausted");
});

test("pilot ledger and worker-lane control persist and fail closed", () => {
  const state = baseState();
  state.workerLaneControl = { mode: "disabled", reason: "T2 rework threshold", locator: "pilot:T2", operatorConsequence: "Use the parent writer while retaining evidence and review controls." };
  assert.equal(isBatchRunState(structuredClone(state)), true);
  startTicket(state, "T1");
  const denied = acquireBatchWriterLease(state, { leaseId: "worker-1", worktreeKey: "active", owner: "worker", ownerRole: "worker", phase: "implementation", ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01" });
  assert.equal(denied.ok, false);
  assert.equal(acquireBatchWriterLease(state, { leaseId: "parent-1", worktreeKey: "active", owner: "parent", ownerRole: "parent", phase: "implementation", ticketId: "T1", attempt: 1, allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01" }).ok, true);
  const malformed = structuredClone(state) as any;
  malformed.workerLaneControl = { mode: "disabled" };
  assert.equal(isBatchRunState(malformed), false);
  const malformedLedger = structuredClone(state) as any;
  malformedLedger.pilotLedger = { version: 1, rows: [{ clean: true, exclusionReasons: [] }] };
  assert.equal(isBatchRunState(malformedLedger), false);
});
