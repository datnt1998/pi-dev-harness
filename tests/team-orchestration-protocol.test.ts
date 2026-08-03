import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyIndependence,
  decisionPacketEquivalenceKey,
  implementationStateFingerprint,
  isProviderIndependent,
  normalizeProviderIdentity,
  parseTeamOrchestrationEnvelope,
  type TeamOrchestrationEnvelopeV1,
} from "../lib/team-orchestration-protocol.ts";

function envelope(): TeamOrchestrationEnvelopeV1 {
  return {
    protocolVersion: 1,
    workUnit: { source: "tickets.md", sourceFingerprint: "source-hash", ticketId: "T1", purpose: "production", attempt: 1 },
    runs: [{ role: "producer", actor: "writer-1", runId: "run-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "provider-a", model: "writer", requestedProvider: "requested-a", requestedModel: "requested-writer", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }],
    writerLease: { owner: "writer-1", phase: "closed", allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:00:00Z", closedAt: "2026-01-01T00:01:00Z", handoffFingerprint: "implementation-hash" },
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
    ["missing axis", (input) => { input.reviews.pop(); input.diversity = { ...input.diversity, achievedIndependence: "axis-missing", degraded: true, cleanPilotEvidence: false, warning: { targetTopology: "three distinct actual providers", configuredProviders: ["producer", "standards", "spec"], actualProviders: ["provider-a", "provider-b", "unknown"], missingOrOverlapping: "Spec axis is missing", qualityConsequence: "not clean pilot evidence", configurationGuidance: "run the separate Spec axis" }, acknowledgment: { actor: "operator", at: "2026-01-01T00:03:00Z", decision: "continue", reason: "test" } }; }, "invalid-review-integrity"],
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
    warning: { targetTopology: "three distinct actual providers", configuredProviders: ["producer", "standards", "spec"], actualProviders: ["provider-a", "provider-b", "provider-c"], missingOrOverlapping: "Standards route fell back", qualityConsequence: "correlated blind spots are more likely and this is not clean pilot evidence", configurationGuidance: "configure and verify distinct actual routes" },
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
