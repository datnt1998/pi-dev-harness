import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireExclusiveWriterLease,
  authorizeFixWorkerRound,
  canStartReviewAgainstLease,
  classifyIndependence,
  closeExclusiveWriterLease,
  decideWriterEligibility,
  decisionPacketEquivalenceKey,
  implementationStateFingerprint,
  inspectPersistedWriterLease,
  isProviderIndependent,
  normalizeProviderIdentity,
  parseTeamOrchestrationEnvelope,
  roleMayAcquireWriterLease,
  type TeamOrchestrationEnvelopeV1,
} from "../lib/team-orchestration-protocol.ts";

function envelope(): TeamOrchestrationEnvelopeV1 {
  return {
    protocolVersion: 1,
    workUnit: { source: "tickets.md", sourceFingerprint: "source-hash", ticketId: "T1", purpose: "production", attempt: 1 },
    runs: [{ role: "producer", actor: "writer-1", runId: "run-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "provider-a", model: "writer", requestedProvider: "requested-a", requestedModel: "requested-writer", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }],
    eligibility: {
      lane: "parent",
      reasonCode: "tiny-known-parent",
      rule: "tiny known diffs stay on the parent writer lane",
      architectureFrozen: true,
      scopeExplicit: true,
      reversible: true,
      falsifiableBar: "focused test passes",
      validationAvailable: true,
      freshContext: true,
      checkedAcceptance: true,
      pilotMember: false,
      allowedPaths: ["lib/example.ts"],
      importantReasoning: "none",
      tinyKnownDiff: true,
      leaseSafetyAvailable: true,
    },
    writerLease: { leaseId: "lease-1", ticketId: "T1", attempt: 1, worktreeKey: "active", owner: "writer-1", ownerRole: "parent", phase: "closed", allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:00:00Z", closedAt: "2026-01-01T00:01:00Z", handoffFingerprint: "implementation-hash" },
    implementation: { changedPaths: ["lib/example.ts"], fingerprint: "implementation-hash" },
    producerObservations: [{ summary: "Changed the requested seam.", locators: ["lib/example.ts:1"], replayCommands: ["node --test tests/example.test.ts"] }],
    parentValidation: [{ command: "node --test tests/example.test.ts", outcome: "passed", locator: "test-output:1", observedFingerprint: "implementation-hash" }],
    reviews: [
      { axis: "standards", run: { role: "standards-reviewer", actor: "reviewer-a", runId: "review-a", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "provider-b", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }, reviewedFingerprint: "implementation-hash", sealing: { mode: "serialized", preMutationFingerprint: "implementation-hash", postMutationFingerprint: "implementation-hash", evidenceLocator: "seal:standards" }, verdict: "no-findings", findings: [] },
      { axis: "spec", run: { role: "spec-reviewer", actor: "reviewer-b", runId: "review-b", contextMode: "fresh", acceptanceMode: "verified", provider: { provider: "provider-c", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }, reviewedFingerprint: "implementation-hash", sealing: { mode: "capability", readOnlyCapabilities: ["read", "search"], evidenceLocator: "seal:spec" }, verdict: "no-findings", findings: [] },

    ],
    dispositions: [],
    fixAndRereview: { round: 0, fixApplied: false },
    completionFidelity: { criteria: { C1: "verified", C2: "verified", C3: "verified", C4: "verified", C5: "verified", C6: "verified", C7: "verified" }, claims: [{ claim: "focused test passed", locator: "test-output:1", verifiedBy: "parent" }] },
    diversity: { achievedIndependence: "provider-distinct", degraded: false, cleanPilotEvidence: true },
    residualRisks: [],
    requestedOutcome: "completed",
    parentGate: { actor: "parent-1", role: "parent", action: "accepted", observedFingerprint: "implementation-hash", evidenceLocator: "parent-log:1" },
  };
}

function setDegraded(input: TeamOrchestrationEnvelopeV1, level: Exclude<TeamOrchestrationEnvelopeV1["diversity"]["achievedIndependence"], "provider-distinct">): void {
  input.diversity = {
    achievedIndependence: level,
    degraded: true,
    cleanPilotEvidence: false,
    warning: { targetTopology: "three distinct providers", configuredProviders: ["alpha", "beta", "gamma"], actualProviders: ["alpha", "alpha", "beta"], missingOrOverlapping: "review topology is degraded", qualityConsequence: "correlated blind spots", configurationGuidance: "configure distinct provider families" },
    acknowledgment: { actor: "operator", at: "2026-01-01T00:02:00Z", decision: "continue", reason: "known temporary capacity limit" },
  };
}

test("V1 envelope round-trips all evidence categories and acceptance provenance", () => {
  const input = envelope();
  const parsed = parseTeamOrchestrationEnvelope(input);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, input);
  assert.equal(parsed.value.runs[0].acceptanceMode, "checked");
  assert.equal(parsed.value.runs[0].provider.requestedProvider, "requested-a");
  assert.equal(parsed.value.reviews.length, 2);
  assert.equal(parsed.value.parentGate.role, "parent");
});

test("missing and unknown versions fail closed without input mutation", () => {
  const missing = { ...envelope() } as Record<string, unknown>;
  delete missing.protocolVersion;
  const missingBefore = structuredClone(missing);
  assert.deepEqual(parseTeamOrchestrationEnvelope(missing), { ok: false, error: { code: "missing-version", message: "Evidence envelope must declare protocolVersion.", path: "protocolVersion" } });
  assert.deepEqual(missing, missingBefore);
  const unknown = { ...envelope(), protocolVersion: 99 };
  assert.equal(parseTeamOrchestrationEnvelope(unknown).ok, false);
});

test("child final-gate claims are rejected recursively in all child carriers", () => {
  for (const mutate of [
    (input: any) => { input.runs[0].nested = { completionVerdict: "accepted" }; },
    (input: any) => { input.reviews[0].run.gateVerdict = "accepted"; },
    (input: any) => { input.fixAndRereview.focusedRereview = [structuredClone(input.reviews[1])]; input.fixAndRereview.focusedRereview[0].run.nested = { parentGate: "accepted" }; },
  ]) {
    const input = envelope() as any;
    mutate(input);
    const result = parseTeamOrchestrationEnvelope(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "child-gate-authority");
  }
  const parentEvidence = envelope() as any;
  parentEvidence.parentValidation[0].completionVerdict = "parent-only record";
  assert.equal(parseTeamOrchestrationEnvelope(parentEvidence).ok, true);
});

test("deferred dispositions and residual risks require non-empty risk text", () => {
  const deferred = envelope();
  deferred.dispositions = [{ findingId: "F1", disposition: "deferred", parentActor: "parent-1", evidenceLocator: "log:1" }];
  assert.equal(parseTeamOrchestrationEnvelope(deferred).ok, false);
  deferred.dispositions[0].residualRisk = "temporary test coverage gap";
  deferred.reviews[0].verdict = "findings";
  deferred.reviews[0].findings = [{ id: "F1", severity: "low", summary: "coverage gap", locator: "lib/example.ts:1", replay: "node --test" }];
  assert.equal(parseTeamOrchestrationEnvelope(deferred).ok, true);
  deferred.residualRisks = ["   "];
  assert.equal(parseTeamOrchestrationEnvelope(deferred).ok, false);
});

test("independence is derived from actual provenance, including actor topology", () => {
  assert.deepEqual(normalizeProviderIdentity({ provider: "  Alpha/fast ", model: "Variant" }), { provider: "alpha", model: "variant" });
  assert.equal(classifyIndependence({ producer: { provider: "alpha" }, standards: { provider: "beta" }, spec: { provider: "gamma" } }), "provider-distinct");
  assert.equal(classifyIndependence({ producer: { provider: "alpha" }, standards: { provider: "alpha" }, spec: { provider: "alpha" } }), "provider-overlap");
  assert.equal(classifyIndependence({ producer: { provider: "alpha" }, standards: { provider: "beta" }, spec: { provider: "gamma" }, producerActor: "same", standardsActor: "same" }), "self-review");
  assert.equal(classifyIndependence({ producer: { provider: "alpha" }, standards: { provider: "beta" }, spec: { provider: "gamma" }, standardsActor: "same", specActor: "same" }), "combined");
  assert.equal(classifyIndependence({ producer: { provider: "alpha" }, standards: { provider: "beta" } }), "axis-missing");
  assert.equal(classifyIndependence({ standards: { provider: "beta" }, spec: { provider: "gamma" } }), "unknown");
  assert.equal(isProviderIndependent("provider-distinct"), true);
  assert.equal(isProviderIndependent("provider-overlap"), false);

  const contradictory = envelope();
  contradictory.reviews[1].run.provider.provider = "provider-a";
  assert.equal(parseTeamOrchestrationEnvelope(contradictory).ok, false);
  setDegraded(contradictory, "provider-overlap");
  assert.equal(parseTeamOrchestrationEnvelope(contradictory).ok, true);

  const unknown = envelope();
  unknown.runs = [];
  unknown.requestedOutcome = "retry";
  setDegraded(unknown, "unknown");
  assert.equal(parseTeamOrchestrationEnvelope(unknown).ok, true);

  const axisMissing = envelope();
  axisMissing.reviews.splice(1, 1);
  axisMissing.requestedOutcome = "retry";
  setDegraded(axisMissing, "axis-missing");
  assert.equal(parseTeamOrchestrationEnvelope(axisMissing).ok, true);
});

test("all accepted runtime acceptance modes round-trip and invalid values fail closed", () => {
  for (const mode of ["auto", "attested", "checked", "verified", "reviewed", "none"] as const) {
    const input = envelope();
    input.runs[0].acceptanceMode = mode;
    assert.equal(parseTeamOrchestrationEnvelope(input).ok, true);
  }
  const acceptance = envelope() as any;
  acceptance.runs[0].acceptanceMode = "route-derived";
  assert.equal(parseTeamOrchestrationEnvelope(acceptance).ok, false);
});

test("parent actor collisions fail while parent-run provenance may share the parent actor", () => {
  const collision = envelope();
  collision.parentGate.actor = "reviewer-a";
  const collisionResult = parseTeamOrchestrationEnvelope(collision);
  assert.equal(collisionResult.ok, false);
  if (!collisionResult.ok) assert.equal(collisionResult.error.code, "invalid-parent-gate");

  const parentRun = envelope();
  parentRun.runs.push({ role: "parent", actor: "parent-1", runId: "parent-run", contextMode: "fresh", acceptanceMode: "verified", provider: { provider: "provider-parent", fallback: false } });
  assert.equal(parseTeamOrchestrationEnvelope(parentRun).ok, true);

  const degraded = envelope();
  setDegraded(degraded, "provider-overlap");
  assert.equal(parseTeamOrchestrationEnvelope(degraded).ok, false);
  degraded.reviews[1].run.provider.provider = "provider-a";
  assert.equal(parseTeamOrchestrationEnvelope(degraded).ok, true);
});

test("decision packets require replayable structural evidence for all pattern kinds", () => {
  for (const patternKind of ["code-shape", "decision-category", "combined"] as const) {
    const input = envelope();
    input.requestedOutcome = "needs_decision";
    input.parentGate.action = "escalated";
    input.decisionPacket = {
      affectedWorkUnitIds: ["T1"], affectedTicketIds: ["T1"], affectedFiles: ["lib/example.ts"], locatorOrGlob: "lib/**/*.ts:1",
      searchedScope: "lib", exclusions: ["node_modules"], pattern: "missing stable decision invariant", patternKind,
      occurrences: 2, representativeLocators: ["lib/example.ts:1"], question: "Which invariant should govern this behavior?",
      safeDefault: "Leave behavior unchanged.", consequences: "Changing it could alter callers.", replayCommand: "rg invariant lib",
      disconfirmProcedure: "Inspect the listed locators for a counterexample.", blockedStage: "implementation", unrelatedWorkSafe: true,
    };
    assert.equal(parseTeamOrchestrationEnvelope(input).ok, true);
  }
  const missing = envelope() as any;
  missing.requestedOutcome = "needs_decision";
  missing.parentGate.action = "escalated";
  assert.equal(parseTeamOrchestrationEnvelope(missing).ok, false);
  const notCounted = envelope() as any;
  notCounted.requestedOutcome = "needs_decision";
  notCounted.parentGate.action = "escalated";
  notCounted.decisionPacket = { affectedWorkUnitIds: ["T1"], affectedTicketIds: ["T1"], affectedFiles: ["lib/example.ts"], locatorOrGlob: "lib/**/*.ts:1", searchedScope: "lib", exclusions: [], pattern: "shape", patternKind: "code-shape", notCountedReason: "generated files make a reliable count unavailable", representativeLocators: ["lib/example.ts:1"], question: "Choose behavior?", safeDefault: "Do nothing.", consequences: "Callers retain current behavior.", replayCommand: "rg shape lib", disconfirmProcedure: "Inspect matches.", blockedStage: "implementation", unrelatedWorkSafe: true };
  assert.equal(parseTeamOrchestrationEnvelope(notCounted).ok, true);
  notCounted.decisionPacket.occurrences = 1;
  assert.equal(parseTeamOrchestrationEnvelope(notCounted).ok, false);
});

test("decision equivalence includes the exact question but excludes aggregating evidence", () => {
  const packet = { affectedWorkUnitIds: ["T1"], affectedTicketIds: ["T1"], affectedFiles: ["lib/x.ts"], locatorOrGlob: "lib/x.ts:1", searchedScope: "lib", exclusions: [], pattern: "missing invariant", patternKind: "code-shape" as const, occurrences: 1, representativeLocators: ["lib/x.ts:1"], question: "Which API?", safeDefault: "No change", consequences: "Compatibility", replayCommand: "rg x lib", disconfirmProcedure: "inspect", blockedStage: "implementation", unrelatedWorkSafe: true };
  assert.equal(decisionPacketEquivalenceKey(packet), decisionPacketEquivalenceKey({ ...packet, affectedWorkUnitIds: ["T2"], affectedTicketIds: ["T2"], affectedFiles: ["tests/x.ts"], representativeLocators: ["tests/x.ts:1"], replayCommand: "rg x tests" }));
  assert.notEqual(decisionPacketEquivalenceKey(packet), decisionPacketEquivalenceKey({ ...packet, question: "Please decide the API owner." }));
  assert.notEqual(decisionPacketEquivalenceKey(packet), decisionPacketEquivalenceKey({ ...packet, pattern: "different missing invariant" }));
});

test("decision packets are rejected for outcomes other than needs_decision", () => {
  const input = envelope() as any;
  input.decisionPacket = { affectedWorkUnitIds: ["T1"], affectedTicketIds: ["T1"], affectedFiles: ["lib/x.ts"], locatorOrGlob: "lib/x.ts:1", searchedScope: "lib", exclusions: [], pattern: "shape", patternKind: "code-shape", occurrences: 1, representativeLocators: ["lib/x.ts:1"], question: "Which behavior?", safeDefault: "No change.", consequences: "Compatibility.", replayCommand: "rg shape lib", disconfirmProcedure: "Inspect matches.", blockedStage: "implementation", unrelatedWorkSafe: true };
  assert.equal(parseTeamOrchestrationEnvelope(input).ok, false);
});

test("completed envelopes fail closed for stable handoff, fresh sealed axes, provenance uncertainty, and dispositions", () => {
  const cases: Array<[string, (input: any) => void, string]> = [
    ["missing axis", (input) => { input.reviews.pop(); input.diversity = { ...input.diversity, achievedIndependence: "axis-missing", degraded: true, cleanPilotEvidence: false, warning: { targetTopology: "three distinct actual providers", configuredProviders: ["producer", "falsification", "adversarial-authority"], actualProviders: ["provider-a", "provider-b", "unknown"], missingOrOverlapping: "Adversarial-authority axis is missing", qualityConsequence: "not clean pilot evidence", configurationGuidance: "run the separate Adversarial-authority axis" }, acknowledgment: { actor: "operator", at: "2026-01-01T00:03:00Z", decision: "continue", reason: "test" } }; }, "invalid-review-integrity"],
    ["combined axis calls", (input) => { input.reviews[1].run.runId = input.reviews[0].run.runId; }, "invalid-review-integrity"],
    ["self review", (input) => { input.reviews[0].run.actor = input.runs[0].actor; }, "invalid-provider-diversity"],
    ["rejected parent gate", (input) => { input.parentGate.action = "rejected"; }, "invalid-review-integrity"],
    ["escalated parent gate", (input) => { input.parentGate.action = "escalated"; }, "invalid-review-integrity"],
    ["stale parent gate", (input) => { input.parentGate.observedFingerprint = "stale"; }, "invalid-review-integrity"],
    ["stale parent validation", (input) => { input.parentValidation[0].observedFingerprint = "stale"; }, "invalid-review-integrity"],
    ["failed parent validation", (input) => { input.parentValidation[0].outcome = "failed"; }, "invalid-review-integrity"],
    ["missing parent validation", (input) => { input.parentValidation = []; }, "invalid-review-integrity"],
    ["stale review", (input) => { input.reviews[0].reviewedFingerprint = "stale"; }, "invalid-review-integrity"],
    ["non-fresh review", (input) => { input.reviews[0].run.contextMode = "inherited"; }, "invalid-review-integrity"],
    ["missing seal", (input) => { delete input.reviews[0].sealing; }, "invalid-review-integrity"],
    ["reviewer mutation", (input) => { input.reviews[0].sealing.postMutationFingerprint = "mutated"; }, "invalid-review-integrity"],
    ["mutation-capable seal", (input) => { input.reviews[1].sealing.readOnlyCapabilities = ["read", "write"]; }, "invalid-review-integrity"],
    ["unable to review", (input) => { input.reviews[0].verdict = "unable-to-review"; }, "invalid-review-integrity"],
    ["hidden unverified model", (input) => { input.reviews[0].run.provider.effectiveModel = "unknown"; input.diversity = { achievedIndependence: "unknown", degraded: true, cleanPilotEvidence: false }; }, "invalid-provider-diversity"],
    ["hidden unverified thinking", (input) => { input.reviews[0].run.provider.effectiveThinking = "unknown"; input.diversity = { achievedIndependence: "unknown", degraded: true, cleanPilotEvidence: false }; }, "invalid-provider-diversity"],
  ];
  for (const [name, mutate, code] of cases) {
    const input = envelope() as any;
    mutate(input);
    const result = parseTeamOrchestrationEnvelope(input);
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.equal(result.error.code, code, name);
  }

  const missingDisposition = envelope() as any;
  missingDisposition.reviews[0].verdict = "findings";
  missingDisposition.reviews[0].findings = [{ id: "F1", severity: "high", summary: "problem", locator: "lib/example.ts:1", replay: "node --test" }];
  assert.equal(parseTeamOrchestrationEnvelope(missingDisposition).ok, false);
  missingDisposition.dispositions = [{ findingId: "F1", disposition: "rejected", parentActor: "parent-1", evidenceLocator: "parent-log:2" }];
  assert.equal(parseTeamOrchestrationEnvelope(missingDisposition).ok, true);
  missingDisposition.dispositions.push({ findingId: "F1", disposition: "accepted", parentActor: "parent-1", evidenceLocator: "parent-log:3" });
  assert.equal(parseTeamOrchestrationEnvelope(missingDisposition).ok, false);
  missingDisposition.dispositions.pop();
  missingDisposition.dispositions[0].parentActor = "reviewer-a";
  assert.equal(parseTeamOrchestrationEnvelope(missingDisposition).ok, false);
});

test("fallback or effective-thinking uncertainty renders a complete acknowledged degraded topology", () => {
  const fallback = envelope() as any;
  fallback.reviews[0].run.provider.fallback = true;
  fallback.diversity = {
    achievedIndependence: "unknown", degraded: true, cleanPilotEvidence: false,
    warning: { targetTopology: "three distinct actual providers", configuredProviders: ["producer", "falsification", "adversarial-authority"], actualProviders: ["provider-a", "provider-b", "provider-c"], missingOrOverlapping: "Falsification route fell back", qualityConsequence: "correlated blind spots are more likely and this is not clean pilot evidence", configurationGuidance: "configure and verify distinct actual routes" },
    acknowledgment: { actor: "operator", at: "2026-01-01T00:03:00Z", decision: "continue", reason: "temporary capacity limit" },
  };
  assert.equal(parseTeamOrchestrationEnvelope(fallback).ok, true);
  fallback.diversity.acknowledgment.decision = "stop";
  assert.equal(parseTeamOrchestrationEnvelope(fallback).ok, false);
});

test("fingerprints are normalization and key-order stable but materially sensitive", () => {
  const first = implementationStateFingerprint({ changedPaths: ["lib/a.ts"], summary: "line one\r\n" });
  assert.equal(first, implementationStateFingerprint({ summary: "line one", changedPaths: ["lib/a.ts"] }));
  assert.notEqual(first, implementationStateFingerprint({ changedPaths: ["lib/b.ts"], summary: "line one" }));
});

const workerEligibleInput = {
  architectureFrozen: true,
  scopeExplicit: true,
  reversible: true,
  falsifiableBar: "node --test tests/example.test.ts exits 0",
  validationAvailable: true,
  freshContext: true,
  checkedAcceptance: true,
  pilotMember: true,
  allowedPaths: ["lib/example.ts"],
  importantReasoning: "none" as const,
  leaseSafetyAvailable: true,
};

test("eligibility routes only frozen bounded work to the worker lane and fails closed otherwise", () => {
  assert.equal(decideWriterEligibility(workerEligibleInput).lane, "worker");
  assert.equal(decideWriterEligibility(workerEligibleInput).reasonCode, "frozen-bounded-worker");
  assert.equal(decideWriterEligibility({ ...workerEligibleInput, importantReasoning: "unknown-mixed" }).lane, "parent");
  assert.equal(decideWriterEligibility({ ...workerEligibleInput, importantReasoning: "unknown-mixed" }).requiresDecision, true);
  assert.equal(decideWriterEligibility({ ...workerEligibleInput, importantReasoning: "present" }).reasonCode, "important-reasoning-parent");
  assert.equal(decideWriterEligibility({ ...workerEligibleInput, tinyKnownDiff: true }).reasonCode, "tiny-known-parent");
  assert.equal(decideWriterEligibility({ ...workerEligibleInput, pilotMember: false }).lane, "parent");
  assert.equal(decideWriterEligibility({ ...workerEligibleInput, falsifiableBar: "" }).lane, "parent");

  const worker = envelope();
  worker.eligibility = {
    lane: "worker",
    reasonCode: "frozen-bounded-worker",
    rule: decideWriterEligibility(workerEligibleInput).rule,
    architectureFrozen: true,
    scopeExplicit: true,
    reversible: true,
    falsifiableBar: workerEligibleInput.falsifiableBar,
    validationAvailable: true,
    freshContext: true,
    checkedAcceptance: true,
    pilotMember: true,
    allowedPaths: ["lib/example.ts"],
    importantReasoning: "none",
    tinyKnownDiff: false,
    leaseSafetyAvailable: true,
  };
  worker.writerLease.ownerRole = "worker";
  worker.parentImplementationAfterDelegation = { occurred: false };
  assert.equal(parseTeamOrchestrationEnvelope(worker).ok, true);

  const mixed = envelope();
  mixed.eligibility.importantReasoning = "unknown-mixed";
  mixed.eligibility.reasonCode = "frozen-bounded-worker";
  mixed.eligibility.lane = "worker";
  assert.equal(parseTeamOrchestrationEnvelope(mixed).ok, false);

  const hiddenParentWrite = envelope();
  hiddenParentWrite.eligibility = { ...worker.eligibility };
  hiddenParentWrite.writerLease.ownerRole = "parent";
  delete hiddenParentWrite.parentImplementationAfterDelegation;
  assert.equal(parseTeamOrchestrationEnvelope(hiddenParentWrite).ok, false);
  hiddenParentWrite.parentImplementationAfterDelegation = { occurred: true, attribution: "rework", evidenceLocator: "parent-log:rework" };
  assert.equal(parseTeamOrchestrationEnvelope(hiddenParentWrite).ok, true);
});

test("exclusive writer leases reject overlap, stale close, and review while open", () => {
  const first = acquireExclusiveWriterLease(undefined, {
    leaseId: "l1", worktreeKey: "active", owner: "worker-1", ownerRole: "worker", phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const overlap = acquireExclusiveWriterLease(first.value, {
    leaseId: "l2", worktreeKey: "active", owner: "worker-2", ownerRole: "worker", phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:00:01Z",
  });
  assert.equal(overlap.ok, false);
  if (!overlap.ok) assert.equal(overlap.error.code, "overlap");
  assert.equal(canStartReviewAgainstLease(first.value).ok, false);
  const closed = closeExclusiveWriterLease(first.value, { leaseId: "l1", owner: "worker-1", closedAt: "2026-01-01T00:01:00Z", handoffFingerprint: "fp" });
  assert.equal(closed.ok, true);
  assert.equal(canStartReviewAgainstLease(closed.ok ? closed.value : undefined).ok, true);
  const badClose = closeExclusiveWriterLease(first.value, { leaseId: "other", owner: "worker-1", closedAt: "2026-01-01T00:01:00Z", handoffFingerprint: "fp" });
  assert.equal(badClose.ok, false);
  if (!badClose.ok) assert.equal(badClose.error.code, "contradiction");
  const orphan = inspectPersistedWriterLease(first.value, { ticketStatuses: { T1: "completed" }, inProgressTicketId: undefined });
  assert.equal(orphan.ok, false);
  if (!orphan.ok) assert.equal(orphan.error.code, "orphan");

  const openReview = envelope() as any;
  openReview.writerLease.phase = "implementation";
  delete openReview.writerLease.closedAt;
  delete openReview.writerLease.handoffFingerprint;
  openReview.requestedOutcome = "retry";
  openReview.parentGate.action = "escalated";
  openReview.diversity = { achievedIndependence: "provider-distinct", degraded: false };
  assert.equal(parseTeamOrchestrationEnvelope(openReview).ok, false);
});

test("reviewer roles and read-only acceptance metadata never grant mutation authority", () => {
  assert.equal(roleMayAcquireWriterLease("standards-reviewer", "checked"), false);
  assert.equal(roleMayAcquireWriterLease("spec-reviewer", "none"), false);
  assert.equal(roleMayAcquireWriterLease("producer", "checked"), false);
  assert.equal(roleMayAcquireWriterLease("worker", "reviewed"), true);
  const denied = acquireExclusiveWriterLease(undefined, {
    leaseId: "l1", worktreeKey: "active", owner: "reviewer-a", ownerRole: "standards-reviewer" as any, phase: "implementation",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "reviewer-mutation-authority");

  const envelopeDenied = envelope() as any;
  envelopeDenied.writerLease.owner = "reviewer-a";
  envelopeDenied.writerLease.ownerRole = "worker";
  envelopeDenied.eligibility = {
    lane: "worker",
    reasonCode: "frozen-bounded-worker",
    rule: decideWriterEligibility(workerEligibleInput).rule,
    architectureFrozen: true,
    scopeExplicit: true,
    reversible: true,
    falsifiableBar: workerEligibleInput.falsifiableBar,
    validationAvailable: true,
    freshContext: true,
    checkedAcceptance: true,
    pilotMember: true,
    allowedPaths: ["lib/example.ts"],
    importantReasoning: "none",
    tinyKnownDiff: false,
    leaseSafetyAvailable: true,
  };
  envelopeDenied.parentImplementationAfterDelegation = { occurred: false };
  assert.equal(parseTeamOrchestrationEnvelope(envelopeDenied).ok, false);
});

test("fix leases require parent dispositions, one ordinary round, and escalation for a second substantial fix", () => {
  const dispositions = [{ findingId: "F1", disposition: "accepted" as const, parentActor: "parent-1", evidenceLocator: "d:1" }];
  const brief = { briefId: "fix-1", parentActor: "parent-1", acceptedFindingIds: ["F1"], scopePaths: ["lib/example.ts"], summary: "fix the accepted finding", issuedAt: "2026-01-01T00:02:00Z" };
  assert.equal(authorizeFixWorkerRound({ priorFixRounds: 0, dispositions, fixBrief: brief }).ok, true);
  assert.equal(authorizeFixWorkerRound({ priorFixRounds: 1, dispositions, fixBrief: brief }).ok, false);
  assert.equal(authorizeFixWorkerRound({ priorFixRounds: 0, dispositions, fixBrief: brief, substantialSecondFixNeeded: true }).ok, false);
  assert.equal(authorizeFixWorkerRound({ priorFixRounds: 0, dispositions: [{ ...dispositions[0], disposition: "rejected" }], fixBrief: brief }).ok, false);

  const acquiredFix = acquireExclusiveWriterLease(undefined, {
    leaseId: "fix-lease", worktreeKey: "active", owner: "fix-1", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:02:00Z", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, priorFixRounds: 0 });
  assert.equal(acquiredFix.ok, true);
  const second = acquireExclusiveWriterLease(undefined, {
    leaseId: "fix-lease-2", worktreeKey: "active", owner: "fix-1", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:03:00Z", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, priorFixRounds: 1 });
  assert.equal(second.ok, false);

  const fixed = envelope() as any;
  fixed.reviews[0].verdict = "findings";
  fixed.reviews[0].findings = [{ id: "F1", severity: "medium", summary: "nit", locator: "lib/example.ts:1", replay: "node --test" }];
  fixed.dispositions = dispositions;
  const fixLease = {
    leaseId: "fix-lease", ticketId: "T1", attempt: 1, worktreeKey: "active", owner: "fix-1", ownerRole: "fix-writer" as const, phase: "closed" as const,
    allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:02:00Z", closedAt: "2026-01-01T00:03:00Z",
    handoffFingerprint: "implementation-hash", fixBriefId: "fix-1",
  };
  fixed.fixAndRereview = {
    round: 1,
    fixApplied: true,
    fixBrief: brief,
    fixLease,
    fixValidation: [{ command: "node --test tests/example.test.ts", outcome: "passed", locator: "test-output:2", observedFingerprint: "implementation-hash" }],
    focusedRereview: structuredClone(fixed.reviews).map((review: any, index: number) => ({ ...review, run: { ...review.run, runId: `re-${index}` }, verdict: "no-findings", findings: [] })),
  };
  fixed.writerLease = { ...fixLease };
  assert.equal(parseTeamOrchestrationEnvelope(fixed).ok, true);

  const secondRound = structuredClone(fixed);
  secondRound.fixAndRereview.round = 2;
  assert.equal(parseTeamOrchestrationEnvelope(secondRound).ok, false);

  const escalate = envelope() as any;
  escalate.requestedOutcome = "needs_decision";
  escalate.parentGate.action = "escalated";
  escalate.fixAndRereview = { round: 2, fixApplied: false, escalatedInsteadOfSecondFix: true, escalationLocator: "decision:second-fix" };
  escalate.decisionPacket = {
    affectedWorkUnitIds: ["T1"], affectedTicketIds: ["T1"], affectedFiles: ["lib/example.ts"], locatorOrGlob: "lib/example.ts:1",
    searchedScope: "lib", exclusions: [], pattern: "repeated fix need", patternKind: "decision-category", occurrences: 2,
    representativeLocators: ["lib/example.ts:1"], question: "How should the remaining semantic conflict be resolved?",
    safeDefault: "Escalate to owner.", consequences: "No silent fix loop.", replayCommand: "rg conflict lib",
    disconfirmProcedure: "Inspect dispositions.", blockedStage: "fix", unrelatedWorkSafe: true,
  };
  assert.equal(parseTeamOrchestrationEnvelope(escalate).ok, true);
});

test("malformed or outcome-contradictory pilot metrics fail closed at the protocol seam", () => {
  const value = envelope() as any;
  value.pilotMetrics = {};
  assert.equal(parseTeamOrchestrationEnvelope(value).ok, false);

  const contradictory = envelope() as any;
  contradictory.requestedOutcome = "retry";
  contradictory.pilotMetrics = {
    primary: true, realWork: true, testBar: "test-bar", attribution: "verified", usageAttribution: "verified",
    falseClaims: [], parentRework: [], parentValidationDiagnostic: "validation:1",
    productionScarcePremiumCalls: 1, arbitrationScarcePremiumCalls: 0, meteredSpend: 1,
    flatFeeOutputTokens: 0, flatFeePrice: 0, latencyMs: 10, baselineLocator: "baseline:1",
    baselineMatched: true, baselineProductionScarcePremiumCallsPerTicket: 2, baselineLatencyMs: 20,
    routeSnapshotLocator: "route:1", terminalOutcome: "completed",
  };
  assert.equal(parseTeamOrchestrationEnvelope(contradictory).ok, false);
});

test("eligibility reason codes require consistent tiny-known and isolation facts", () => {
  const tiny = envelope();
  assert.equal(parseTeamOrchestrationEnvelope(tiny).ok, true);
  tiny.eligibility.tinyKnownDiff = false;
  assert.equal(parseTeamOrchestrationEnvelope(tiny).ok, false);

  const unsafe = envelope();
  unsafe.eligibility.reasonCode = "unsafe-isolation-parent";
  unsafe.eligibility.tinyKnownDiff = false;
  unsafe.eligibility.leaseSafetyAvailable = false;
  assert.equal(parseTeamOrchestrationEnvelope(unsafe).ok, true);
  unsafe.eligibility.leaseSafetyAvailable = true;
  assert.equal(parseTeamOrchestrationEnvelope(unsafe).ok, false);

  const worker = envelope();
  worker.eligibility = {
    lane: "worker",
    reasonCode: "frozen-bounded-worker",
    rule: decideWriterEligibility(workerEligibleInput).rule,
    architectureFrozen: true,
    scopeExplicit: true,
    reversible: true,
    falsifiableBar: workerEligibleInput.falsifiableBar,
    validationAvailable: true,
    freshContext: true,
    checkedAcceptance: true,
    pilotMember: true,
    allowedPaths: ["lib/example.ts"],
    importantReasoning: "none",
    tinyKnownDiff: true,
    leaseSafetyAvailable: true,
  };
  worker.writerLease.ownerRole = "worker";
  worker.parentImplementationAfterDelegation = { occurred: false };
  assert.equal(parseTeamOrchestrationEnvelope(worker).ok, false);
});

test("fix lease allowedPaths must stay inside brief and eligibility scope", () => {
  const dispositions = [{ findingId: "F1", disposition: "accepted" as const, parentActor: "parent-1", evidenceLocator: "d:1" }];
  const brief = { briefId: "fix-1", parentActor: "parent-1", acceptedFindingIds: ["F1"], scopePaths: ["lib/example.ts"], summary: "fix", issuedAt: "2026-01-01T00:02:00Z" };
  const outsideBrief = acquireExclusiveWriterLease(undefined, {
    leaseId: "fix-lease", worktreeKey: "active", owner: "fix-1", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/other.ts"], openedAt: "2026-01-01T00:02:00Z", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, priorFixRounds: 0, implementationScopePaths: ["lib/example.ts", "lib/other.ts"] });
  assert.equal(outsideBrief.ok, false);
  const outsideEligibility = acquireExclusiveWriterLease(undefined, {
    leaseId: "fix-lease", worktreeKey: "active", owner: "fix-1", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:02:00Z", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, priorFixRounds: 0, implementationScopePaths: ["lib/other.ts"] });
  assert.equal(outsideEligibility.ok, false);
  const ok = acquireExclusiveWriterLease(undefined, {
    leaseId: "fix-lease", worktreeKey: "active", owner: "fix-1", ownerRole: "fix-writer", phase: "fix",
    ticketId: "T1", attempt: 1, allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:02:00Z", fixBriefId: "fix-1",
  }, { dispositions, fixBrief: brief, priorFixRounds: 0, implementationScopePaths: ["lib/example.ts"] });
  assert.equal(ok.ok, true);
});

test("focused re-review after an applied fix enforces load-bearing axis integrity", () => {
  const dispositions = [{ findingId: "F1", disposition: "accepted" as const, parentActor: "parent-1", evidenceLocator: "d:1" }];
  const brief = { briefId: "fix-1", parentActor: "parent-1", acceptedFindingIds: ["F1"], scopePaths: ["lib/example.ts"], summary: "fix", issuedAt: "2026-01-01T00:02:00Z" };
  const fixLease = {
    leaseId: "fix-lease", ticketId: "T1", attempt: 1, worktreeKey: "active", owner: "fix-1", ownerRole: "fix-writer" as const, phase: "closed" as const,
    allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:02:00Z", closedAt: "2026-01-01T00:03:00Z",
    handoffFingerprint: "implementation-hash", fixBriefId: "fix-1",
  };
  function fixedEnvelope() {
    const fixed = envelope() as any;
    fixed.reviews[0].verdict = "findings";
    fixed.reviews[0].findings = [{ id: "F1", severity: "medium", summary: "nit", locator: "lib/example.ts:1", replay: "node --test" }];
    fixed.dispositions = dispositions;
    fixed.writerLease = { ...fixLease };
    fixed.fixAndRereview = {
      round: 1,
      fixApplied: true,
      fixBrief: brief,
      fixLease,
      fixValidation: [{ command: "node --test tests/example.test.ts", outcome: "passed", locator: "test-output:2", observedFingerprint: "implementation-hash" }],
      focusedRereview: structuredClone(fixed.reviews).map((review: any, index: number) => ({ ...review, run: { ...review.run, runId: `re-${index}` }, verdict: "no-findings", findings: [] })),
    };
    return fixed;
  }
  assert.equal(parseTeamOrchestrationEnvelope(fixedEnvelope()).ok, true);

  for (const [name, mutate] of [
    ["missing axis", (input: any) => { input.fixAndRereview.focusedRereview.pop(); }],
    ["shared run id", (input: any) => { input.fixAndRereview.focusedRereview[1].run.runId = input.fixAndRereview.focusedRereview[0].run.runId; }],
    ["stale fingerprint", (input: any) => { input.fixAndRereview.focusedRereview[0].reviewedFingerprint = "stale"; }],
    ["non-fresh", (input: any) => { input.fixAndRereview.focusedRereview[0].run.contextMode = "inherited"; }],
    ["missing seal", (input: any) => { delete input.fixAndRereview.focusedRereview[0].sealing; }],
    ["unable", (input: any) => { input.fixAndRereview.focusedRereview[0].verdict = "unable-to-review"; }],
    ["missing fix lease", (input: any) => { delete input.fixAndRereview.fixLease; }],
  ] as const) {
    const input = fixedEnvelope();
    mutate(input);
    const result = parseTeamOrchestrationEnvelope(input);
    assert.equal(result.ok, false, name);
  }
});
