/**
 * T2 — Evidence locator referential integrity (spec invariant-registry-and-evidence-audit R2).
 *
 * Verifies that every evidenceLocator string on a parsed orchestration envelope
 * resolves to an actual evidence.recorded event in the provided run-track entries.
 * Opt-in only; the pure applyEvidencedOutcome path skips this check entirely.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { InvariantRegistry, InvariantError } from "../lib/invariant-registry.ts";
import {
  EVIDENCE_MODULE,
  collectEvidenceLocators,
  extractEvidenceEvents,
  installEvidenceReferentialIntegrity,
} from "../lib/evidence-integrity.ts";
import type { TeamOrchestrationEnvelopeV1 } from "../lib/team-orchestration-protocol.ts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Minimal envelope carrying the four locator-bearing surfaces. */
function minimalEnvelope(overrides?: Partial<TeamOrchestrationEnvelopeV1>): TeamOrchestrationEnvelopeV1 {
  return {
    protocolVersion: 1,
    workUnit: { ticketId: "T1", source: "tickets.md", sourceFingerprint: "fp", purpose: "state gate", attempt: 1 },
    runs: [{ role: "producer", actor: "writer", runId: "run-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "p", fallback: false, effectiveModel: "m", effectiveThinking: "t" } }] as never,
    eligibility: {} as never,
    writerLease: { leaseId: "lease-1", ticketId: "T1", attempt: 1, worktreeKey: "active", owner: "writer", ownerRole: "parent", phase: "closed", allowedPaths: [], openedAt: "2026-01-01", closedAt: "2026-01-01", handoffFingerprint: "impl" } as never,
    implementation: { changedPaths: ["lib/x.ts"], fingerprint: "impl" },
    producerObservations: [],
    parentValidation: [],
    reviews: [
      { axis: "standards", run: { role: "r", actor: "a", runId: "s1", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "s", fallback: false, effectiveModel: "m", effectiveThinking: "t" } }, reviewedFingerprint: "impl", sealing: { mode: "capability", readOnlyCapabilities: ["read"], evidenceLocator: "ev-seal-std" }, verdict: "no-findings", findings: [] },
      { axis: "spec", run: { role: "r", actor: "a", runId: "s2", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "sp", fallback: false, effectiveModel: "m", effectiveThinking: "t" } }, reviewedFingerprint: "impl", sealing: { mode: "serialized", preMutationFingerprint: "impl", postMutationFingerprint: "impl", evidenceLocator: "ev-seal-spec" }, verdict: "no-findings", findings: [] },
    ] as never,
    dispositions: [{ findingId: "f1", disposition: "accepted", parentActor: "parent", evidenceLocator: "ev-disp" }],
    fixAndRereview: { round: 0, fixApplied: false },
    completionFidelity: { criteria: { C1: "verified", C2: "verified", C3: "verified", C4: "verified", C5: "verified", C6: "verified", C7: "verified" }, claims: [] },
    diversity: { achievedIndependence: "provider-distinct", degraded: false, cleanPilotEvidence: true },
    residualRisks: [],
    requestedOutcome: "completed",
    parentGate: { role: "parent", actor: "parent", action: "accepted", observedFingerprint: "impl", evidenceLocator: "ev-gate" },
    ...overrides,
  } as TeamOrchestrationEnvelopeV1;
}

function evEntry(evidenceId: string): Record<string, unknown> {
  return { kind: "evidence.recorded", evidenceId };
}

function nonEvEntry(kind = "task.started"): Record<string, unknown> {
  return { kind, id: "evt-1", trackId: "track-1", ts: "2026-01-01" };
}

// ---------------------------------------------------------------------------
// Fixture 1: valid envelope + matching event log → pass
// ---------------------------------------------------------------------------

test("referential integrity passes when all locators resolve", () => {
  const registry = new InvariantRegistry();
  registry.register(EVIDENCE_MODULE, installEvidenceReferentialIntegrity);
  const envelope = minimalEnvelope();
  const locators = collectEvidenceLocators(envelope);
  // Build entries containing every referenced locator as an evidence.recorded event.
  const entries = locators.map((id) => evEntry(id));
  assert.doesNotThrow(() => registry.check(EVIDENCE_MODULE, { envelope, entries }));
});

// ---------------------------------------------------------------------------
// Fixture 2: missing locator → fail with named locator in message
// ---------------------------------------------------------------------------

test("referential integrity fails when one locator does not resolve", () => {
  const registry = new InvariantRegistry();
  registry.register(EVIDENCE_MODULE, installEvidenceReferentialIntegrity);
  const envelope = minimalEnvelope();
  const locators = collectEvidenceLocators(envelope);
  // Drop one entry so exactly one locator is unresolvable.
  const entries = locators.slice(1).map((id) => evEntry(id));
  try {
    registry.check(EVIDENCE_MODULE, { envelope, entries });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof InvariantError);
    const e = err as InvariantError;
    assert.equal(e.moduleName, EVIDENCE_MODULE);
    assert.equal(e.rule, "locator-resolves");
    assert.match(e.message, /does not resolve to any recorded evidence event/);
    // The missing locator must be named in the error message.
    const missing = locators[0];
    assert.match(e.message, new RegExp(missing));
  }
});

// ---------------------------------------------------------------------------
// Fixture 3: zero evidence locators → pass (vacuously valid)
// ---------------------------------------------------------------------------

test("referential integrity passes vacuously when envelope has no locators", () => {
  const registry = new InvariantRegistry();
  registry.register(EVIDENCE_MODULE, installEvidenceReferentialIntegrity);
  // Strip every locator-bearing surface.
  const envelope = minimalEnvelope({
    dispositions: [],
    reviews: [
      { axis: "standards", run: {} as never, reviewedFingerprint: "impl", verdict: "no-findings", findings: [] },
      { axis: "spec", run: {} as never, reviewedFingerprint: "impl", verdict: "no-findings", findings: [] },
    ] as never,
    parentImplementationAfterDelegation: undefined,
  } as Partial<TeamOrchestrationEnvelopeV1>);
  assert.equal(collectEvidenceLocators(envelope).length, 0);
  assert.doesNotThrow(() => registry.check(EVIDENCE_MODULE, { envelope, entries: [] }));
});

// ---------------------------------------------------------------------------
// Fixture 4: locator matches event of wrong kind → fail
// ---------------------------------------------------------------------------

test("referential integrity rejects locator matching a non-evidence-recorded event", () => {
  const registry = new InvariantRegistry();
  registry.register(EVIDENCE_MODULE, installEvidenceReferentialIntegrity);
  const envelope = minimalEnvelope();
  const locators = collectEvidenceLocators(envelope);
  // All entries carry the right ID but the wrong kind.
  const entries = locators.map((id) => ({ ...nonEvEntry("guardrail.occurred"), evidenceId: id }));
  try {
    registry.check(EVIDENCE_MODULE, { envelope, entries });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof InvariantError);
    const e = err as InvariantError;
    assert.equal(e.moduleName, EVIDENCE_MODULE);
    assert.equal(e.rule, "locator-resolves");
    assert.match(e.message, /does not resolve to any recorded evidence event/);
  }
});

// ---------------------------------------------------------------------------
// Collector / extractor unit coverage
// ---------------------------------------------------------------------------

test("collectEvidenceLocators covers dispositions, seals, and parent-after-delegation", () => {
  const envelope = minimalEnvelope({
    parentImplementationAfterDelegation: { occurred: true, attribution: "rework", evidenceLocator: "ev-parent" },
  } as Partial<TeamOrchestrationEnvelopeV1>);
  const locators = collectEvidenceLocators(envelope);
  assert.ok(locators.includes("ev-disp"));
  assert.ok(locators.includes("ev-seal-std"));
  assert.ok(locators.includes("ev-seal-spec"));
  // parentGate.evidenceLocator is intentionally excluded (see collector comment).
  assert.ok(!locators.includes("ev-gate"));
  assert.ok(locators.includes("ev-parent"));
});

test("extractEvidenceEvents ignores malformed and non-evidence entries", () => {
  const entries: readonly unknown[] = [
    evEntry("good"),
    null,
    undefined,
    42,
    "string",
    { kind: "task.started", evidenceId: "ignored" },
    { kind: "evidence.recorded" }, // missing evidenceId
    { kind: "evidence.recorded", evidenceId: "" }, // empty
    { kind: "evidence.recorded", evidenceId: "also-good" },
  ];
  const events = extractEvidenceEvents(entries);
  assert.deepEqual(events.map((e) => e.evidenceId), ["good", "also-good"]);
});
