import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyIndependence,
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
    runs: [{ role: "producer", actor: "writer-1", runId: "run-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "provider-a", model: "writer", requestedProvider: "requested-a", requestedModel: "requested-writer", fallback: false, effectiveThinking: "unverified" } }],
    writerLease: { owner: "writer-1", phase: "closed", allowedPaths: ["lib/example.ts"], openedAt: "2026-01-01T00:00:00Z", closedAt: "2026-01-01T00:01:00Z" },
    implementation: { changedPaths: ["lib/example.ts"], fingerprint: "implementation-hash" },
    producerObservations: [{ summary: "Changed the requested seam.", locators: ["lib/example.ts:1"], replayCommands: ["node --test tests/example.test.ts"] }],
    parentValidation: [{ command: "node --test tests/example.test.ts", outcome: "passed", locator: "test-output:1", observedFingerprint: "implementation-hash" }],
    reviews: [
      { axis: "standards", run: { role: "standards-reviewer", actor: "reviewer-a", runId: "review-a", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "provider-b", fallback: false } }, reviewedFingerprint: "implementation-hash", verdict: "no-findings", findings: [] },
      { axis: "spec", run: { role: "spec-reviewer", actor: "reviewer-b", runId: "review-b", contextMode: "fresh", acceptanceMode: "verified", provider: { provider: "provider-c", fallback: false } }, reviewedFingerprint: "implementation-hash", verdict: "no-findings", findings: [] },
    ],
    dispositions: [],
    fixAndRereview: { round: 0, fixApplied: false },
    completionFidelity: { criteria: { C1: "verified", C2: "verified", C3: "verified", C4: "verified", C5: "verified", C6: "verified", C7: "verified" }, claims: [{ claim: "focused test passed", locator: "test-output:1", verifiedBy: "parent" }] },
    diversity: { achievedIndependence: "provider-distinct", degraded: false },
    residualRisks: [],
    requestedOutcome: "completed",
    parentGate: { actor: "parent-1", role: "parent", action: "accepted", observedFingerprint: "implementation-hash", evidenceLocator: "parent-log:1" },
  };
}

function setDegraded(input: TeamOrchestrationEnvelopeV1, level: Exclude<TeamOrchestrationEnvelopeV1["diversity"]["achievedIndependence"], "provider-distinct">): void {
  input.diversity = {
    achievedIndependence: level,
    degraded: true,
    warning: { targetTopology: "three distinct providers", configuredProviders: ["alpha"], actualProviders: ["alpha", "alpha", "beta"], missingOrOverlapping: "review topology is degraded", qualityConsequence: "correlated blind spots", configurationGuidance: "configure distinct provider families" },
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
  setDegraded(unknown, "unknown");
  assert.equal(parseTeamOrchestrationEnvelope(unknown).ok, true);

  const axisMissing = envelope();
  axisMissing.reviews.splice(1, 1);
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

test("fingerprints are normalization and key-order stable but materially sensitive", () => {
  const first = implementationStateFingerprint({ changedPaths: ["lib/a.ts"], summary: "line one\r\n" });
  assert.equal(first, implementationStateFingerprint({ summary: "line one", changedPaths: ["lib/a.ts"] }));
  assert.notEqual(first, implementationStateFingerprint({ changedPaths: ["lib/b.ts"], summary: "line one" }));
});
