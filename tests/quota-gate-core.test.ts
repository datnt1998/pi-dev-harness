import assert from "node:assert/strict";
import test from "node:test";
import {
  QuotaLaunchRuntime,
  buildPremiumQuotaSnapshot,
  createQuotaLedger,
  decideDegradation,
  decideQuotaLaunch,
  getQuotaAccounting,
  reconcileProvisionalDebit,
  releaseProvisionalDebit,
  rolloverQuotaLedger,
  type LaunchRequest,
  type PremiumQuotaSnapshot,
  type QuotaLedger,
  type UsageQuotaInput,
} from "../lib/quota-gate-core.ts";

const NOW = Date.parse("2026-02-01T12:00:00Z");
const RESET = "2026-02-08T00:00:00.000Z";

function usage(overrides: Partial<UsageQuotaInput> = {}): UsageQuotaInput {
  return {
    fetchedAt: new Date(NOW).toISOString(),
    status: "ready",
    weekly: { usedPercent: 20, remainingPercent: 80, resetAt: RESET },
    shortWindow: { usedPercent: 30, remainingPercent: 70, resetAt: "2026-02-01T15:00:00.000Z" },
    premiumSpecificWeekly: { usedPercent: 25, remainingPercent: 75, resetAt: RESET },
    allowSingleWeeklyWindow: false,
    ...overrides,
  };
}

function request(overrides: Partial<LaunchRequest> = {}): LaunchRequest {
  return {
    tier: "scarce-premium",
    quotaCategory: "main",
    attribution: { source: "tickets/work.md", ticket: "T1", purpose: "production" },
    context: "fresh",
    requestedThinking: "high",
    importantReasoning: true,
    route: { selectedTier: "scarce-premium", effectiveThinking: "high", fallback: "none" },
    ...overrides,
  };
}

function snapshotAndLedger(
  input: UsageQuotaInput = usage(),
  initial = 75,
): { snapshot: PremiumQuotaSnapshot; ledger: QuotaLedger } {
  const ledger = createQuotaLedger(RESET, initial, NOW);
  return { snapshot: buildPremiumQuotaSnapshot(input, ledger, NOW), ledger };
}

test("snapshot preserves nullable windows, derives minimum weekly capacity, age, and band", () => {
  const ledger = createQuotaLedger(RESET, 75, NOW);
  const snapshot = buildPremiumQuotaSnapshot(usage(), ledger, NOW + 60_000);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.fetchedAt, new Date(NOW).toISOString());
  assert.equal(snapshot.ageMs, 60_000);
  assert.equal(snapshot.freshness, "fresh");
  assert.equal(snapshot.effectiveWeeklyRemainingPercent, 75);
  assert.equal(snapshot.weekly?.resetAt, RESET);
  assert.equal(snapshot.premiumSpecificWeekly?.remainingPercent, 75);
  assert.equal(snapshot.pendingDebitPercent, 0);
  assert.equal(snapshot.band, "healthy");
  assert.equal(snapshot.gateReason, "ready");
  assert.ok(Object.isFrozen(snapshot));

  const absent = buildPremiumQuotaSnapshot(usage({ weekly: null, premiumSpecificWeekly: null }), null, NOW);
  assert.equal(absent.effectiveWeeklyRemainingPercent, null);
  assert.equal(absent.weekly, null);
  assert.equal(absent.band, "unknown");
  assert.notEqual(absent.effectiveWeeklyRemainingPercent, 0);

  const realZero = buildPremiumQuotaSnapshot(usage({
    weekly: { usedPercent: 100, remainingPercent: 0, resetAt: RESET },
    premiumSpecificWeekly: { usedPercent: 100, remainingPercent: 0, resetAt: RESET },
  }), ledger, NOW);
  assert.equal(realZero.effectiveWeeklyRemainingPercent, 0);
  assert.equal(realZero.band, "exhausted");
});

test("provider contract controls whether one available weekly window is sufficient", () => {
  const permitted = buildPremiumQuotaSnapshot(usage({ premiumSpecificWeekly: null, allowSingleWeeklyWindow: true }), null, NOW);
  assert.equal(permitted.effectiveWeeklyRemainingPercent, 80);
  assert.equal(permitted.status, "ready");

  const denied = buildPremiumQuotaSnapshot(usage({ premiumSpecificWeekly: null, allowSingleWeeklyWindow: false }), null, NOW);
  assert.equal(denied.effectiveWeeklyRemainingPercent, null);
  assert.equal(denied.status, "partial");
  assert.match(denied.gateReason, /premium-specific weekly/i);
});

test("ledger initializes partial weeks in reverse protection order", () => {
  assert.deepEqual(createQuotaLedger(RESET, 100, NOW).balances, {
    main: 60,
    "production-review": 20,
    arbitration: 15,
    emergency: 5,
  });
  assert.deepEqual(createQuotaLedger(RESET, 50, NOW).balances, {
    main: 30,
    "production-review": 0,
    arbitration: 15,
    emergency: 5,
  });
  assert.deepEqual(createQuotaLedger(RESET, 10, NOW).balances, {
    main: 0,
    "production-review": 0,
    arbitration: 5,
    emergency: 5,
  });
});

test("gate borrows only from lower-priority reserves and records attribution", () => {
  const { snapshot, ledger } = snapshotAndLedger();
  ledger.balances.main = 0;
  ledger.balances["production-review"] = 2;
  const decision = decideQuotaLaunch(snapshot, ledger, request());
  assert.equal(decision.decision, "allow");
  assert.equal(decision.reserveDebitedFrom, "production-review");

  const runtime = new QuotaLaunchRuntime({
    providerIdentity: "premium/account-a",
    initialSnapshot: snapshot,
    initialLedger: ledger,
    refresh: async () => usage(),
    now: () => NOW,
  });
  return runtime.start(request()).then(async (lease) => {
    assert.equal(lease.decision.decision, "allow");
    assert.equal(runtime.ledger?.borrowEvents.length, 1);
    assert.deepEqual(runtime.ledger?.borrowEvents[0].attribution, request().attribution);
    assert.equal(runtime.ledger?.pending[0].reserveDebitedFrom, "production-review");
    await lease.finish({ outcome: "failed-before-request" });
  });
});

test("review cannot borrow, main cannot borrow protected reserves, higher categories can borrow down", () => {
  const cases: Array<[LaunchRequest["quotaCategory"], Partial<QuotaLedger["balances"]>, "allow" | "defer", LaunchRequest["quotaCategory"] | null]> = [
    ["production-review", { "production-review": 0, main: 10 }, "defer", null],
    ["main", { main: 0, arbitration: 10, emergency: 5, "production-review": 0 }, "defer", null],
    ["arbitration", { arbitration: 0, "production-review": 2 }, "allow", "production-review"],
    ["emergency", { emergency: 0, "production-review": 2 }, "allow", "production-review"],
  ];
  for (const [category, balances, expected, source] of cases) {
    const { snapshot, ledger } = snapshotAndLedger();
    Object.assign(ledger.balances, { main: 0, "production-review": 0, arbitration: 0, emergency: 0 }, balances);
    const decision = decideQuotaLaunch(snapshot, ledger, request({
      quotaCategory: category,
      attribution: { ...request().attribution, purpose: category === "arbitration" ? "arbitration" : "production" },
    }));
    assert.equal(decision.decision, expected, category);
    assert.equal(decision.reserveDebitedFrom, source, category);
  }
});

test("gate fails closed for stale, errors, missing resets, exhaustion, and the 10% short-window boundary", () => {
  const inputs: Array<[string, UsageQuotaInput]> = [
    ["stale", usage({ fetchedAt: new Date(NOW - 300_001).toISOString() })],
    ["auth", usage({ status: "auth-error" })],
    ["fetch", usage({ status: "fetch-error" })],
    ["weekly reset", usage({ weekly: { usedPercent: 20, remainingPercent: 80, resetAt: null } })],
    ["short reset", usage({ shortWindow: { usedPercent: 30, remainingPercent: 70, resetAt: null } })],
    ["weekly exhausted", usage({ weekly: { usedPercent: 100, remainingPercent: 0, resetAt: RESET }, premiumSpecificWeekly: { usedPercent: 100, remainingPercent: 0, resetAt: RESET } })],
    ["weekly below hold", usage({ weekly: { usedPercent: 99.5, remainingPercent: 0.5, resetAt: RESET }, premiumSpecificWeekly: { usedPercent: 99.5, remainingPercent: 0.5, resetAt: RESET } })],
    ["short low", usage({ shortWindow: { usedPercent: 90, remainingPercent: 10, resetAt: "2026-02-01T15:00:00.000Z" } })],
  ];
  for (const [label, input] of inputs) {
    const ledger = createQuotaLedger(RESET, 75, NOW);
    const snapshot = buildPremiumQuotaSnapshot(input, ledger, NOW);
    const decision = decideQuotaLaunch(snapshot, ledger, request());
    assert.equal(decision.decision, "defer", label);
    assert.equal(decision.degradationRequired, true, label);
  }
});

test("gate validates attribution independently from accounting category and blocks silent fallback/downgrade", () => {
  const { snapshot, ledger } = snapshotAndLedger();
  const badRequests: LaunchRequest[] = [
    request({ attribution: { source: "../escape", ticket: "T1", purpose: "production" } }),
    request({ attribution: { source: "tickets/work.md", ticket: "", purpose: "production" } }),
    request({ route: { selectedTier: "metered-mid", effectiveThinking: "high", fallback: "undeclared" } }),
    request({ context: "fork", requestedThinking: "high", route: { selectedTier: "scarce-premium", effectiveThinking: "off", fallback: "none" } }),
    request({ context: "fresh", requestedThinking: "high", route: { selectedTier: "scarce-premium", effectiveThinking: "medium", fallback: "none" } }),
    request({ quotaCategory: "main", ownerEmergencyOverride: { reason: "not an emergency category" } }),
    request({ importantReasoning: "unknown", route: { selectedTier: "flat-fee", effectiveThinking: "off", fallback: "declared" } }),
  ];
  for (const bad of badRequests) assert.equal(decideQuotaLaunch(snapshot, ledger, bad).decision, "defer");

  const arbitration = decideQuotaLaunch(snapshot, ledger, request({
    quotaCategory: "arbitration",
    attribution: { source: "tickets/work.md", ticket: "T2", purpose: "arbitration" },
  }));
  assert.equal(arbitration.decision, "allow");
});

test("degradation is explicit, metered-mid only, and cannot satisfy protected evidence", () => {
  const primary = decideDegradation({
    declared: true,
    targetTier: "metered-mid",
    mode: "primary",
    importantReasoning: "mixed",
    intendedEvidence: "ordinary",
  });
  assert.equal(primary.decision, "allow");
  assert.equal(primary.degraded, true);
  assert.equal(primary.verdict, "final");

  const planning = decideDegradation({
    declared: true,
    targetTier: "metered-mid",
    mode: "planning-only",
    importantReasoning: true,
    intendedEvidence: "ordinary",
  });
  assert.equal(planning.decision, "allow");
  assert.equal(planning.verdict, "provisional");

  for (const intendedEvidence of ["scarce-premium-pilot", "arbitration", "emergency-authorization", "no-test-bar"] as const) {
    const result = decideDegradation({ declared: true, targetTier: "metered-mid", mode: "primary", importantReasoning: false, intendedEvidence });
    assert.equal(result.decision, "owner-required", intendedEvidence);
    assert.equal(result.evidenceEligible, false, intendedEvidence);
  }
  assert.equal(decideDegradation({ declared: false, targetTier: "metered-mid", mode: "primary", importantReasoning: false, intendedEvidence: "ordinary" }).decision, "defer");
  assert.equal(decideDegradation({ declared: true, targetTier: "flat-fee", mode: "primary", importantReasoning: "unknown", intendedEvidence: "ordinary" }).decision, "defer");
});

test("emergency override only bypasses stale/unknown state and is recorded, never authorizes irreversible action", async () => {
  const ledger = createQuotaLedger(RESET, 75, NOW);
  const stale = buildPremiumQuotaSnapshot(usage({ fetchedAt: new Date(NOW - 999_999).toISOString() }), ledger, NOW);
  const emergency = request({
    quotaCategory: "emergency",
    attribution: { source: "tickets/incident.md", ticket: "INC-1", purpose: "production" },
  });
  assert.equal(decideQuotaLaunch(stale, ledger, emergency).decision, "owner-required");
  const override = { reason: "active production outage" };
  const allowed = decideQuotaLaunch(stale, ledger, request({ ...emergency, ownerEmergencyOverride: override }));
  assert.equal(allowed.decision, "allow");
  assert.equal(allowed.irreversibleActionAuthorized, false);

  const runtime = new QuotaLaunchRuntime({
    providerIdentity: "premium/account-emergency",
    initialSnapshot: stale,
    initialLedger: ledger,
    refresh: async () => usage({ fetchedAt: new Date(NOW - 999_999).toISOString() }),
    now: () => NOW,
  });
  const lease = await runtime.start(request({ ...emergency, ownerEmergencyOverride: override }));
  assert.equal(runtime.ledger?.pending[0].ownerEmergencyOverride?.reason, override.reason);
  await lease.finish({ outcome: "failed-before-request" });

  const exhausted = buildPremiumQuotaSnapshot(usage({ shortWindow: { usedPercent: 95, remainingPercent: 5, resetAt: RESET } }), ledger, NOW);
  assert.equal(decideQuotaLaunch(exhausted, ledger, request({ ...emergency, ownerEmergencyOverride: override })).decision, "defer");
});

test("provisional debit reconciles positive utilization, preserves delayed reads, and releases failed starts", () => {
  const { snapshot, ledger } = snapshotAndLedger();
  const runtimeDecision = decideQuotaLaunch(snapshot, ledger, request());
  assert.equal(runtimeDecision.decision, "allow");

  const held = structuredClone(ledger);
  held.balances.main -= 1;
  held.pending.push({
    id: "p1", category: "main", reserveDebitedFrom: "main", amount: 1,
    attribution: request().attribution, createdAt: new Date(NOW).toISOString(),
  });
  const delayed = reconcileProvisionalDebit(held, "p1", 0, NOW + 1);
  assert.equal(delayed.pending.length, 1);
  assert.equal(delayed.debits.length, 0);

  const observed = reconcileProvisionalDebit(held, "p1", 2.5, NOW + 2);
  assert.equal(observed.pending.length, 0);
  assert.equal(observed.debits[0].amount, 2.5);
  assert.equal(observed.balances.main, ledger.balances.main - 2.5);
  const withArbitration = structuredClone(observed);
  withArbitration.debits.push({ ...observed.debits[0], id: "arb", amount: 1.25, attribution: { ...observed.debits[0].attribution, purpose: "arbitration" } });
  assert.deepEqual(getQuotaAccounting(withArbitration), { productionPercent: 2.5, arbitrationPercent: 1.25 });

  const released = releaseProvisionalDebit(held, "p1");
  assert.equal(released.pending.length, 0);
  assert.equal(released.balances.main, ledger.balances.main);
});

test("validated forward reset rolls over while malformed or backward epochs are rejected", () => {
  const ledger = createQuotaLedger(RESET, 75, NOW);
  assert.equal(rolloverQuotaLedger(ledger, "not-a-date", 100, NOW), ledger);
  assert.equal(rolloverQuotaLedger(ledger, "2026-02-01T00:00:00Z", 100, NOW), ledger);
  const next = rolloverQuotaLedger(ledger, "2026-02-15T00:00:00Z", 100, NOW);
  assert.notEqual(next, ledger);
  assert.equal(next.resetEpoch, "2026-02-15T00:00:00.000Z");
  assert.deepEqual(next.balances, { main: 60, "production-review": 20, arbitration: 15, emergency: 5 });
});

test("runtime observes mid-session exhaustion and denies the next start", async () => {
  const ledger = createQuotaLedger(RESET, 20, NOW);
  let fetchCount = 0;
  const healthyEnough = usage({
    weekly: { usedPercent: 80, remainingPercent: 20, resetAt: RESET },
    premiumSpecificWeekly: { usedPercent: 80, remainingPercent: 20, resetAt: RESET },
  });
  const exhausted = usage({
    weekly: { usedPercent: 95, remainingPercent: 5, resetAt: RESET },
    premiumSpecificWeekly: { usedPercent: 95, remainingPercent: 5, resetAt: RESET },
    shortWindow: { usedPercent: 95, remainingPercent: 5, resetAt: "2026-02-01T15:00:00.000Z" },
  });
  const runtime = new QuotaLaunchRuntime({
    providerIdentity: "premium/account-a",
    initialSnapshot: buildPremiumQuotaSnapshot(healthyEnough, ledger, NOW),
    initialLedger: ledger,
    refresh: async () => (++fetchCount === 1 ? healthyEnough : exhausted),
    now: () => NOW,
  });
  const first = await runtime.start(request({ quotaCategory: "arbitration", attribution: { source: "tickets/work.md", ticket: "A", purpose: "arbitration" } }));
  await first.finish({ outcome: "completed" });
  const second = await runtime.start(request({ quotaCategory: "arbitration", attribution: { source: "tickets/work.md", ticket: "B", purpose: "arbitration" } }));
  assert.equal(second.decision.decision, "defer");
  assert.match(second.decision.reason, /exhausted|10% or less/i);
});

test("runtime serializes from the post-refresh band on a healthy-to-scarce transition", async () => {
  const ledger = createQuotaLedger(RESET, 80, NOW);
  const healthy = usage({ weekly: { usedPercent: 20, remainingPercent: 80, resetAt: RESET }, premiumSpecificWeekly: { usedPercent: 20, remainingPercent: 80, resetAt: RESET } });
  const scarce = usage({ weekly: { usedPercent: 80, remainingPercent: 20, resetAt: RESET }, premiumSpecificWeekly: { usedPercent: 80, remainingPercent: 20, resetAt: RESET } });
  const runtime = new QuotaLaunchRuntime({
    providerIdentity: "premium/account-transition",
    initialSnapshot: buildPremiumQuotaSnapshot(healthy, ledger, NOW),
    initialLedger: ledger,
    refresh: async () => scarce,
    now: () => NOW,
  });
  const first = await runtime.start(request({ quotaCategory: "arbitration", attribution: { source: "tickets/work.md", ticket: "A", purpose: "arbitration" } }));
  let secondStarted = false;
  const secondPromise = runtime.start(request({ quotaCategory: "arbitration", attribution: { source: "tickets/work.md", ticket: "B", purpose: "arbitration" } })).then((lease) => {
    secondStarted = true;
    return lease;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(secondStarted, false);
  await first.finish({ outcome: "failed-before-request" });
  const second = await secondPromise;
  await second.finish({ outcome: "failed-before-request" });
});

test("scarce runtime releases serialization when reservation persistence fails", async () => {
  const ledger = createQuotaLedger(RESET, 20, NOW);
  const scarce = usage({ weekly: { usedPercent: 80, remainingPercent: 20, resetAt: RESET }, premiumSpecificWeekly: { usedPercent: 80, remainingPercent: 20, resetAt: RESET } });
  let fail = true;
  const runtime = new QuotaLaunchRuntime({
    providerIdentity: "premium/account-store-failure",
    initialSnapshot: buildPremiumQuotaSnapshot(scarce, ledger, NOW),
    initialLedger: ledger,
    refresh: async () => scarce,
    store: { save: async () => { if (fail) throw new Error("disk full"); } },
    now: () => NOW,
  });
  await assert.rejects(runtime.start(request({ quotaCategory: "arbitration", attribution: { source: "tickets/work.md", ticket: "A", purpose: "arbitration" } })), /disk full/);
  assert.equal(runtime.ledger?.pending.length, 0, "failed persistence does not publish an in-memory reservation");
  fail = false;
  const second = await runtime.start(request({ quotaCategory: "arbitration", attribution: { source: "tickets/work.md", ticket: "B", purpose: "arbitration" } }));
  assert.equal(second.decision.decision, "allow");
  await second.finish({ outcome: "failed-before-request" });
});

test("scarce runtime serializes starts and reserves atomically", async () => {
  const ledger = createQuotaLedger(RESET, 20, NOW);
  const scarceUsage = usage({
    weekly: { usedPercent: 80, remainingPercent: 20, resetAt: RESET },
    premiumSpecificWeekly: { usedPercent: 80, remainingPercent: 20, resetAt: RESET },
  });
  const runtime = new QuotaLaunchRuntime({
    providerIdentity: "premium/account-a",
    initialSnapshot: buildPremiumQuotaSnapshot(scarceUsage, ledger, NOW),
    initialLedger: ledger,
    refresh: async () => scarceUsage,
    now: () => NOW,
  });
  const first = await runtime.start(request({ quotaCategory: "arbitration", attribution: { source: "tickets/work.md", ticket: "A", purpose: "arbitration" } }));
  let secondStarted = false;
  const secondPromise = runtime.start(request({ quotaCategory: "arbitration", attribution: { source: "tickets/work.md", ticket: "B", purpose: "arbitration" } })).then((lease) => {
    secondStarted = true;
    return lease;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(secondStarted, false);
  await first.finish({ outcome: "failed-before-request" });
  const second = await secondPromise;
  assert.equal(second.decision.decision, "allow");
  await second.finish({ outcome: "failed-before-request" });
});
