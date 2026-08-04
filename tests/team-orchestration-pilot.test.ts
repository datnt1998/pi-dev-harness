import assert from "node:assert/strict";
import test from "node:test";
import {
  createPilotLedger,
  derivePilotRow,
  effectiveWriterLane,
  evaluatePilotWindow,
  flatFeePriceState,
  isPilotLedger,
  isWorkerLaneControl,
  recordPilotRow,
  renderPilotReport,
  type PilotMetrics,
  type PilotRow,
} from "../lib/team-orchestration-pilot.ts";

function envelope() {
  return {
    protocolVersion: 1,
    workUnit: { source: "tickets.md", sourceFingerprint: "fp", ticketId: "T1", purpose: "production", attempt: 1 },
    runs: [{ role: "producer", actor: "worker", runId: "producer-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "producer", requestedProvider: "requested-producer", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }],
    eligibility: { lane: "worker", reasonCode: "frozen-bounded-worker", rule: "frozen", architectureFrozen: true, scopeExplicit: true, reversible: true, falsifiableBar: "node --test", validationAvailable: true, freshContext: true, checkedAcceptance: true, pilotMember: true, allowedPaths: ["lib/x.ts"], importantReasoning: "none", tinyKnownDiff: false, leaseSafetyAvailable: true },
    writerLease: { leaseId: "lease", ticketId: "T1", attempt: 1, worktreeKey: "active", owner: "worker", ownerRole: "worker", phase: "closed", allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", closedAt: "2026-01-01", handoffFingerprint: "impl" },
    implementation: { changedPaths: ["lib/x.ts"], fingerprint: "impl" },
    producerObservations: [{ summary: "done", locators: ["lib/x.ts:1"], replayCommands: ["node --test"] }],
    parentValidation: [{ command: "node --test", outcome: "passed", locator: "test:1", observedFingerprint: "impl" }],
    reviews: [
      { axis: "standards", run: { role: "standards-reviewer", actor: "standards", runId: "standards-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "standards", requestedProvider: "requested-standards", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }, reviewedFingerprint: "impl", sealing: { mode: "capability", readOnlyCapabilities: ["read"], evidenceLocator: "seal:s" }, verdict: "no-findings", findings: [] },
      { axis: "spec", run: { role: "spec-reviewer", actor: "spec", runId: "spec-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "spec", requestedProvider: "requested-spec", fallback: false, effectiveModel: "verified", effectiveThinking: "verified" } }, reviewedFingerprint: "impl", sealing: { mode: "capability", readOnlyCapabilities: ["read"], evidenceLocator: "seal:p" }, verdict: "no-findings", findings: [] },
    ],
    dispositions: [], fixAndRereview: { round: 0, fixApplied: false },
    completionFidelity: { criteria: { C1: "verified", C2: "verified", C3: "verified", C4: "verified", C5: "verified", C6: "verified", C7: "verified" }, claims: [{ claim: "tests pass", locator: "test:1", verifiedBy: "parent" }] },
    diversity: { achievedIndependence: "provider-distinct", degraded: false, cleanPilotEvidence: true }, residualRisks: [], requestedOutcome: "completed",
    parentImplementationAfterDelegation: { occurred: false }, parentGate: { actor: "parent", role: "parent", action: "accepted", observedFingerprint: "impl", evidenceLocator: "gate:1" },
  } as any;
}

function metrics(n = 0): PilotMetrics {
  return {
    primary: true, realWork: true, testBar: n < 6 ? "test-bar" : "no-test-bar",
    attribution: "verified", usageAttribution: "verified", falseClaims: [], parentRework: [],
    parentValidationDiagnostic: `validation:${n}`, productionScarcePremiumCalls: 1, arbitrationScarcePremiumCalls: 9,
    meteredSpend: 2, flatFeeOutputTokens: 100, flatFeePrice: 0, latencyMs: 20,
    baselineLocator: `baseline:${n}`, baselineMatched: true, baselineProductionScarcePremiumCallsPerTicket: 2,
    baselineLatencyMs: 30, routeSnapshotLocator: `route:${n}`, terminalOutcome: "completed",
  };
}

function row(n: number, mutate?: (envelopeValue: any, metricsValue: PilotMetrics) => void): PilotRow {
  const value = envelope();
  value.workUnit.ticketId = `T${n}`;
  value.workUnit.attempt = 1;
  const observations = metrics(n);
  mutate?.(value, observations);
  return derivePilotRow(value, observations);
}

function completeRows() {
  return Array.from({ length: 10 }, (_, n) => row(n));
}

test("classification is fail-closed for degraded, fallback, unknown, and T5 rows", () => {
  assert.equal(row(0).clean, true);
  const fallback = row(1, (value) => { value.runs[0].provider.fallback = true; });
  assert.deepEqual(fallback.exclusionReasons, ["fallback-contaminated"]);
  const degraded = row(2, (value) => {
    value.reviews[0].run.provider.provider = "producer";
    value.diversity = { achievedIndependence: "provider-overlap", degraded: true, cleanPilotEvidence: false, warning: { targetTopology: "three", configuredProviders: ["a", "b", "c"], actualProviders: ["a", "a", "c"], missingOrOverlapping: "overlap", qualityConsequence: "correlated blind spots", configurationGuidance: "configure distinct providers" }, acknowledgment: { actor: "operator", at: "2026-01-01", decision: "continue", reason: "explicit" } };
  });
  assert.equal(degraded.clean, false);
  assert.equal(degraded.diversity.acknowledgment?.decision, "continue");
  const unknown = row(3, (_value, observed) => { observed.usageAttribution = "unknown"; observed.productionScarcePremiumCalls = "unknown"; });
  assert.equal(unknown.clean, false);
  const t5 = row(4, (_value, observed) => { observed.silentThinkingDowngrade = { role: "standards-reviewer", locator: "route:t5" }; });
  assert.equal(t5.clean, false);
  assert.match(t5.exclusionReasons.join(","), /T5/);
});

test("window closes on exactly the first ten clean rows with 6/2 strata", () => {
  let ledger = createPilotLedger();
  for (let n = 0; n < 9; n++) ledger = recordPilotRow(ledger, row(n));
  assert.equal(evaluatePilotWindow(ledger).windowComplete, false);
  ledger = recordPilotRow(ledger, row(9));
  assert.equal(evaluatePilotWindow(ledger).windowComplete, true);
  ledger = recordPilotRow(ledger, row(10, (_value, observed) => { observed.testBar = "test-bar"; }));
  assert.deepEqual(evaluatePilotWindow(ledger).cleanRows.map((item) => item.ticketId), Array.from({ length: 10 }, (_, n) => `T${n}`));
  const badStrata = completeRows().map((item) => ({ ...item, testBar: "test-bar" as const, metrics: { ...item.metrics!, testBar: "test-bar" as const } }));
  assert.equal(evaluatePilotWindow(createPilotLedger(badStrata)).windowComplete, false);
});

test("quality precedes cost, strict decrease is the win, and latency is only a tiebreak", () => {
  let evaluation = evaluatePilotWindow(createPilotLedger(completeRows()));
  assert.equal(evaluation.costResult, "strict-decrease");
  assert.equal(evaluation.ownerConsequence, "consider-promotion");

  const equal = completeRows().map((item) => ({ ...item, metrics: { ...item.metrics!, baselineProductionScarcePremiumCallsPerTicket: 1 } }));
  evaluation = evaluatePilotWindow(createPilotLedger(equal));
  assert.equal(evaluation.costResult, "equal");
  assert.equal(evaluation.decision, "owner-decision-ready");
  assert.equal(evaluation.ownerConsequence, "remain-opt-in");

  const unknown = Array.from({ length: 10 }, (_, n) => row(n, (_value, observed) => { if (n === 0) observed.productionScarcePremiumCalls = "unknown"; }));
  evaluation = evaluatePilotWindow(createPilotLedger(unknown));
  assert.equal(evaluation.decision, "hold/incomplete");
});

test("T1-T5 produce role-specific actions with replay locators and consequences", () => {
  const base = completeRows();
  const t1 = base.map((item, n) => n < 2 ? { ...item, metrics: { ...item.metrics!, falseClaims: [{ criterion: "C7" as const, role: "worker" as const, locator: `claim:${n}` }] } } : item);
  assert.equal(evaluatePilotWindow(createPilotLedger(t1)).actions.some((item) => item.trigger === "T1" && item.role === "worker"), true);

  const t2 = base.map((item, n) => n < 4 ? { ...item, parentRework: [{ findingId: `F${n}`, severity: "high" as const, locator: `rework:${n}`, attribution: "strong-route" as const, implicatedRole: "worker" as const }], metrics: { ...item.metrics!, parentRework: [{ findingId: `F${n}`, severity: "high" as const, locator: `rework:${n}`, attribution: "strong-route" as const, implicatedRole: "worker" as const }] } } : item);
  assert.equal(evaluatePilotWindow(createPilotLedger(t2)).actions.some((item) => item.trigger === "T2"), true);

  const t3 = base.map((item) => ({ ...item, metrics: { ...item.metrics!, productionScarcePremiumCalls: 3 } }));
  assert.equal(evaluatePilotWindow(createPilotLedger(t3)).actions.some((item) => item.trigger === "T3"), true);

  const t4 = row(11, (_value, observed) => { observed.flatFeeImportantReasoning = { role: "worker", locator: "reasoning:1" }; });
  assert.equal(evaluatePilotWindow(createPilotLedger([t4])).actions[0].trigger, "T4");

  const t5 = row(12, (_value, observed) => { observed.silentThinkingDowngrade = { role: "standards-reviewer", locator: "thinking:1" }; });
  const t5Action = evaluatePilotWindow(createPilotLedger([t5])).actions[0];
  assert.equal(t5Action.action, "repair-config-and-replace");
  assert.equal(t5Action.role, "standards-reviewer");
  assert.match(t5Action.operatorConsequence, /exclude.*replacement/i);
});

test("ledger classification round-trips requested outcome and pilot membership", () => {
  const retry = envelope();
  retry.requestedOutcome = "retry";
  const completedMetrics = metrics();
  const contradictory = derivePilotRow(retry, completedMetrics);
  assert.equal(contradictory.requestedOutcome, "retry");
  assert.equal(contradictory.outcome, "completed");
  assert.equal(contradictory.exclusionReasons.includes("non-completed-outcome"), true);
  assert.equal(isPilotLedger(createPilotLedger([contradictory])), true);

  const nonMember = envelope();
  nonMember.eligibility.pilotMember = false;
  const nonMemberRow = derivePilotRow(nonMember, metrics());
  assert.equal(nonMemberRow.worker, true);
  assert.equal(nonMemberRow.pilotMember, false);
  assert.equal(nonMemberRow.exclusionReasons.includes("not-worker-pilot-member"), true);
  assert.equal(isPilotLedger(createPilotLedger([nonMemberRow])), true);
});

test("non-completed pilot rows retain missing axes as unknown rather than throwing", () => {
  const value = envelope();
  value.requestedOutcome = "retry";
  value.parentGate.action = "escalated";
  value.parentValidation[0].outcome = "failed";
  value.reviews = [];
  value.diversity = { achievedIndependence: "axis-missing", degraded: true, cleanPilotEvidence: false, warning: { targetTopology: "three providers", configuredProviders: ["a", "b", "c"], actualProviders: ["a"], missingOrOverlapping: "axes missing", qualityConsequence: "review coverage unavailable", configurationGuidance: "configure axes" }, acknowledgment: { actor: "operator", at: "2026-01-01", decision: "continue", reason: "retain operational retry" } };
  const observed = metrics(); observed.terminalOutcome = "retry";
  const retained = derivePilotRow(value, observed);
  assert.equal(retained.clean, false);
  assert.deepEqual(retained.routes.filter((route) => route.provider.provider === "unknown").map((route) => route.role), ["standards", "spec"]);
});

test("T2 counts degraded eligible operational rework rows", () => {
  const degradedRework = Array.from({ length: 4 }, (_, n) => row(n, (value, observed) => {
    value.runs[0].provider.fallback = true;
    observed.parentRework = [{ findingId: `D${n}`, severity: "high", locator: `degraded-rework:${n}`, attribution: "strong-route", implicatedRole: "worker" }];
  }));
  const evaluation = evaluatePilotWindow(createPilotLedger(degradedRework));
  assert.equal(evaluation.cleanRows.length, 0);
  assert.equal(evaluation.actions.some((item) => item.trigger === "T2" && item.role === "worker"), true);
});

test("T5 worker trial remains degraded/non-clean with two HIGH strong-route reworks", () => {
  const trial = row(20, (value, observed) => {
    value.runs[0].provider.effectiveThinking = "unknown";
    value.reviews[0].run.provider.provider = "producer";
    value.reviews[0].run.provider.effectiveThinking = "unknown";
    value.reviews[1].run.provider.effectiveThinking = "unknown";
    value.diversity = { achievedIndependence: "provider-overlap", degraded: true, cleanPilotEvidence: false, warning: { targetTopology: "three providers", configuredProviders: ["requested-a", "requested-b", "requested-c"], actualProviders: ["unknown", "unknown", "unknown"], missingOrOverlapping: "provider overlap and unverified effective route", qualityConsequence: "correlated blind spots and fallback cannot be ruled out", configurationGuidance: "configure and verify distinct routes" }, acknowledgment: { actor: "Dat", at: "2026-01-01", decision: "continue", reason: "temporary routing experiment" } };
    observed.attribution = "unknown";
    observed.usageAttribution = "unknown";
    observed.productionScarcePremiumCalls = "unknown";
    observed.arbitrationScarcePremiumCalls = "unknown";
    observed.meteredSpend = "unknown";
    observed.flatFeeOutputTokens = "unknown";
    observed.latencyMs = "unknown";
    observed.baselineMatched = false;
    observed.baselineProductionScarcePremiumCallsPerTicket = "unknown";
    observed.parentRework = [
      { findingId: "T5-H1", severity: "high", locator: "lease-history:ticket-attempt", attribution: "strong-route", implicatedRole: "worker" },
      { findingId: "T5-H2", severity: "high", locator: "reconstruct:newest-snapshot", attribution: "strong-route", implicatedRole: "worker" },
    ];
  });
  assert.equal(trial.clean, false);
  assert.equal(trial.diversity.acknowledgment?.decision, "continue");
  assert.equal(trial.diversity.acknowledgment?.actor, "Dat");
  assert.equal(trial.parentRework.filter((item) => item.severity === "high" && item.attribution === "strong-route").length, 2);
  const evaluation = evaluatePilotWindow(createPilotLedger([trial]));
  assert.equal(evaluation.cleanRows.length, 0);
  assert.equal(evaluation.decision, "hold/incomplete");
  assert.equal(evaluation.costResult, "unknown");
});

test("unknown and unpriced are separate; ledger/control validation fails closed", () => {
  assert.equal(flatFeePriceState(metrics()), "unpriced");
  assert.equal(flatFeePriceState({ ...metrics(), flatFeePrice: "unknown" }), "unknown");
  assert.equal(isPilotLedger(createPilotLedger([row(1)])), true);
  assert.equal(isPilotLedger({ version: 1, rows: [{ clean: true, exclusionReasons: [] }] }), false);
  const forged = row(2, (value) => { value.runs[0].provider.fallback = true; });
  forged.clean = true; forged.exclusionReasons = [];
  assert.equal(isPilotLedger({ version: 1, rows: [forged] }), false);
  const mismatchedStratum = row(4);
  mismatchedStratum.testBar = mismatchedStratum.testBar === "test-bar" ? "no-test-bar" : "test-bar";
  assert.equal(isPilotLedger({ version: 1, rows: [mismatchedStratum] }), false);
  const mismatchedOperational = row(6);
  mismatchedOperational.primary = false;
  assert.equal(isPilotLedger({ version: 1, rows: [mismatchedOperational] }), false);
  const mismatchedOutcome = row(7);
  mismatchedOutcome.outcome = "retry";
  assert.equal(isPilotLedger({ version: 1, rows: [mismatchedOutcome] }), false);
  const suppressedRework = row(8, (_value, observed) => {
    observed.parentRework = [{ findingId: "F8", severity: "high", locator: "rework:8", attribution: "strong-route", implicatedRole: "worker" }];
  });
  suppressedRework.parentRework = [];
  assert.equal(isPilotLedger({ version: 1, rows: [suppressedRework] }), false);
  const strippedAcknowledgment = row(3, (value) => {
    value.reviews[0].run.provider.provider = "producer";
    value.diversity = { achievedIndependence: "provider-overlap", degraded: true, cleanPilotEvidence: false, warning: { targetTopology: "three", configuredProviders: ["a", "b", "c"], actualProviders: ["a", "a", "c"], missingOrOverlapping: "overlap", qualityConsequence: "correlated blind spots", configurationGuidance: "configure distinct providers" }, acknowledgment: { actor: "operator", at: "2026-01-01", decision: "continue", reason: "explicit" } };
  });
  delete (strippedAcknowledgment.diversity as any).acknowledgment;
  assert.equal(isPilotLedger({ version: 1, rows: [strippedAcknowledgment] }), false);
  const shortWarning = row(5, (value) => {
    value.reviews[0].run.provider.provider = "producer";
    value.diversity = { achievedIndependence: "provider-overlap", degraded: true, cleanPilotEvidence: false, warning: { targetTopology: "three", configuredProviders: ["a"], actualProviders: ["a"], missingOrOverlapping: "overlap", qualityConsequence: "correlated blind spots", configurationGuidance: "configure distinct providers" }, acknowledgment: { actor: "operator", at: "2026-01-01", decision: "continue", reason: "explicit" } };
  });
  assert.equal(isPilotLedger({ version: 1, rows: [shortWarning] }), false);
  assert.equal(isWorkerLaneControl({ mode: "disabled", reason: "T2", locator: "pilot:T2", operatorConsequence: "parent writer" }), true);
  assert.equal(isWorkerLaneControl({ mode: "disabled" }), false);
  assert.equal(effectiveWriterLane({ mode: "demoted", reason: "T1", locator: "pilot:T1", operatorConsequence: "parent writer" }, "worker"), "parent");
  assert.match(renderPilotReport(createPilotLedger([row(1)])), /arbitration-excluded=true/);
});
