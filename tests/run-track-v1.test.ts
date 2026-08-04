import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  RUN_TRACK_EVAL_DIGEST_PREFIX,
  RUN_TRACK_EVENT_KINDS,
  RUN_TRACK_EVENT_MAX_BYTES,
  RUN_TRACK_NAMESPACE,
  RUN_TRACK_POLICY_VERSION,
  RUN_TRACK_VERSION,
  canonicalRunTrackJson,
  createRunTrackReceipt,
  deriveRunTrackFork,
  parseRunTrackEvent,
  planEvidenceTransition,
  projectRunTrackBranch,
  runTrackEvaluationDigest,
  type RunTrackEvent,
  type RunTrackProjection,
} from "../lib/run-track-v1.ts";

const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);
const TS = "2026-08-04T12:00:00.000Z";

function sha64(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function started(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "task.started",
    id: "evt-start-1",
    ts: TS,
    trackId: "track-1",
    sessionId: "session-1",
    taskRef: "task/demo",
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
    key: "tests",
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
    action: "claim.complete",
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
    action: "claim.complete",
    policyVersion: RUN_TRACK_POLICY_VERSION,
    factsDigest,
    origin: "operator-interactive",
    ...overrides,
  };
}

function transition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const factsDigest =
    typeof overrides.factsDigest === "string"
      ? overrides.factsDigest
      : runTrackEvaluationDigest({ placeholder: true });
  return {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "task.transition-observed",
    id: "evt-tr-1",
    ts: TS,
    trackId: "track-1",
    action: "claim.complete",
    factsDigest,
    degraded: false,
    acknowledgmentId: null,
    ...overrides,
  };
}

function mustParse(input: unknown): RunTrackEvent {
  const parsed = parseRunTrackEvent(input);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  return (parsed as { ok: true; value: RunTrackEvent }).value;
}

function projectHealthy(entries: unknown[]): RunTrackProjection {
  const projection = projectRunTrackBranch(entries);
  assert.equal(projection.healthy, true, projection.parseErrors.join("; "));
  return projection;
}

// ---------------------------------------------------------------------------
// Contract surface
// ---------------------------------------------------------------------------

test("exports exactly five event kinds and stable namespace/version/policy constants", () => {
  assert.deepEqual([...RUN_TRACK_EVENT_KINDS], [
    "task.started",
    "evidence.recorded",
    "guardrail.occurred",
    "guardrail.acknowledged",
    "task.transition-observed",
  ]);
  assert.equal(RUN_TRACK_NAMESPACE, "run-track/v1");
  assert.equal(RUN_TRACK_VERSION, 1);
  assert.equal(RUN_TRACK_POLICY_VERSION, "rt-policy-v1");
  assert.equal(RUN_TRACK_EVENT_MAX_BYTES, 8192);
  assert.equal(RUN_TRACK_EVAL_DIGEST_PREFIX, "rt-eval-v1:");
});

// ---------------------------------------------------------------------------
// Strict parse + unknown field rejection
// ---------------------------------------------------------------------------

test("parseRunTrackEvent accepts each of the five kinds with strict metadata-only shapes", () => {
  for (const sample of [started(), evidence(), occurred(), acknowledged(), transition()]) {
    const parsed = parseRunTrackEvent(sample);
    assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  }
});

test("parseRunTrackEvent rejects unknown kinds, unknown fields, and non-objects", () => {
  assert.equal(parseRunTrackEvent(null).ok, false);
  assert.equal(parseRunTrackEvent([]).ok, false);
  assert.equal(parseRunTrackEvent({ ...started(), kind: "task.finished" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...started(), extra: true }).ok, false);
  assert.equal(parseRunTrackEvent({ ...evidence(), body: "raw log text" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...evidence(), prompt: "hello" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...evidence(), artifact: { path: "/tmp/x" } }).ok, false);
  assert.equal(parseRunTrackEvent({ ...occurred(), note: "x" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...acknowledged(), operatorName: "ada" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...transition(), lifecycleState: "done" }).ok, false);
});

test("parseRunTrackEvent rejects malformed values and non-operator acknowledgment origins", () => {
  assert.equal(parseRunTrackEvent({ ...started(), v: 2 }).ok, false);
  assert.equal(parseRunTrackEvent({ ...started(), ns: "other" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...started(), id: "" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...started(), ts: "yesterday" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...evidence(), trust: "minted" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...evidence(), resolution: "pending" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...evidence(), fingerprint: "nope" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...occurred(), decision: "allow" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...occurred(), policyVersion: "other" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...occurred(), factsDigest: "sha:abc" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...acknowledged(), origin: "model-tool" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...acknowledged(), origin: "headless" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...acknowledged(), origin: "rpc" }).ok, false);
  assert.equal(parseRunTrackEvent({ ...transition(), degraded: "yes" }).ok, false);
});

test("parseRunTrackEvent rejects events over the 8 KiB canonical serialized cap", () => {
  const under = occurred({
    id: "occ-under",
    reason: "r".repeat(100),
  });
  assert.equal(parseRunTrackEvent(under).ok, true);

  // Reason is allowed as metadata prose up to the event ceiling, but canonical
  // encoding of envelope fields pushes a near-max reason over the 8 KiB byte cap.
  const over = occurred({
    id: "occ-over",
    reason: "r".repeat(RUN_TRACK_EVENT_MAX_BYTES - 32),
  });
  const parsed = parseRunTrackEvent(over);
  assert.equal(parsed.ok, false);
  assert.match((parsed as { ok: false; error: string }).error, /8|cap|byte/i);

  const fitted = mustParse(
    occurred({
      id: "occ-fit",
      reason: "ok",
    }),
  );
  assert.ok(Buffer.byteLength(canonicalRunTrackJson(fitted), "utf8") <= RUN_TRACK_EVENT_MAX_BYTES);
});

test("canonical JSON is deterministic for key-order permutations and digest format is versioned", () => {
  const a = { z: 1, a: { y: 2, b: "x" }, m: [1, 2] };
  const b = { m: [1, 2], a: { b: "x", y: 2 }, z: 1 };
  assert.equal(canonicalRunTrackJson(a), canonicalRunTrackJson(b));
  const digest = runTrackEvaluationDigest(a);
  assert.match(digest, /^rt-eval-v1:[0-9a-f]{64}$/);
  assert.equal(digest, runTrackEvaluationDigest(b));
  assert.equal(
    digest,
    `${RUN_TRACK_EVAL_DIGEST_PREFIX}${sha64(canonicalRunTrackJson(a))}`,
  );
});

// ---------------------------------------------------------------------------
// Active-branch projection
// ---------------------------------------------------------------------------

test("projectRunTrackBranch replays deterministically and indexes evidence/occurrences", () => {
  const branch = [started(), evidence({ trust: "operator-observed" }), evidence({ id: "evt-ev-2", evidenceId: "ev-2", key: "review", trust: "self-attested", fingerprint: FP_B })];
  const first = projectHealthy(branch);
  const second = projectHealthy(branch);
  assert.equal(first.factsDigest, second.factsDigest);
  assert.equal(first.trackId, "track-1");
  assert.equal(first.sessionId, "session-1");
  assert.equal(first.eventCount, 3);
  assert.equal(first.evidenceByKey.tests.trust, "operator-observed");
  assert.equal(first.evidenceByKey.review.trust, "self-attested");
  assert.match(first.factsDigest!, /^rt-eval-v1:[0-9a-f]{64}$/);
});

test("any malformed event on the active branch fails prospective authorization closed", () => {
  const healthyStart = started();
  const bad = { ...evidence(), kind: "evidence.recorded", extraField: 1 };
  const goodEvidence = evidence({ id: "evt-ev-good", trust: "operator-observed" });
  const projection = projectRunTrackBranch([healthyStart, bad, goodEvidence]);
  assert.equal(projection.healthy, false);
  assert.ok(projection.malformedCount >= 1);
  assert.ok(projection.parseErrors.length >= 1);

  const plan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(plan.decision, "block");
  assert.match(plan.reason, /malformed/i);
  assert.equal(plan.transitionProposal, null);
  assert.ok(plan.occurrenceProposal);
  assert.equal(plan.occurrenceProposal?.decision, "block");
});

test("malformed newest or older entries both fail closed without skipping", () => {
  const olderBad = projectRunTrackBranch([
    { not: "an-event" },
    started(),
    evidence({ trust: "operator-observed" }),
  ]);
  assert.equal(olderBad.healthy, false);
  assert.equal(planEvidenceTransition(olderBad, { action: "claim.complete", requiredKeys: ["tests"] }).decision, "block");

  const newerBad = projectRunTrackBranch([
    started(),
    evidence({ trust: "operator-observed" }),
    { kind: "task.started", bogus: true },
  ]);
  assert.equal(newerBad.healthy, false);
  assert.equal(planEvidenceTransition(newerBad, { action: "claim.complete", requiredKeys: ["tests"] }).decision, "block");
});

// ---------------------------------------------------------------------------
// Prospective transition decisions
// ---------------------------------------------------------------------------

test("missing evidence hard-blocks and cannot be acknowledged into validity", () => {
  const projection = projectHealthy([started()]);
  const plan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(plan.decision, "block");
  assert.match(plan.reason, /missing evidence/);
  assert.equal(plan.transitionProposal, null);
  assert.ok(plan.occurrenceProposal);
  assert.equal(plan.occurrenceProposal?.kind, "guardrail.occurred");
  assert.equal(plan.occurrenceProposal?.decision, "block");

  // Even if a fabricated ack exists, missing evidence stays non-waivable.
  const withAck = projectHealthy([
    started(),
    occurred({
      id: "occ-missing",
      decision: "block",
      reason: "missing evidence: tests",
      factsDigest: projection.factsDigest!,
    }),
    acknowledged({
      id: "ack-missing",
      occurrenceId: "occ-missing",
      factsDigest: projection.factsDigest!,
    }),
  ]);
  // facts changed? still no evidence
  const retry = planEvidenceTransition(withAck, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(retry.decision, "block");
  assert.equal(retry.transitionProposal, null);
  assert.match(retry.reason, /missing evidence/);
});

test("unresolved evidence hard-blocks and is non-waivable", () => {
  const projection = projectHealthy([
    started(),
    evidence({ resolution: "unresolved", trust: "operator-observed" }),
  ]);
  const plan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(plan.decision, "block");
  assert.match(plan.reason, /unresolved evidence/);
  assert.equal(plan.transitionProposal, null);
  assert.ok(plan.occurrenceProposal);
});

test("self-attested-only evidence pauses with occurrence proposal and no transition proposal", () => {
  const projection = projectHealthy([started(), evidence({ trust: "self-attested" })]);
  const plan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(plan.decision, "pause");
  assert.match(plan.reason, /self-attested-only/);
  assert.equal(plan.degraded, false);
  assert.ok(plan.occurrenceProposal);
  assert.equal(plan.occurrenceProposal?.decision, "pause");
  assert.equal(plan.occurrenceProposal?.action, "claim.complete");
  assert.equal(plan.occurrenceProposal?.policyVersion, RUN_TRACK_POLICY_VERSION);
  assert.equal(plan.occurrenceProposal?.factsDigest, projection.factsDigest);
  assert.equal(plan.transitionProposal, null);
});

test("planner outputs contain no transition proposal on pause or block", () => {
  const paused = planEvidenceTransition(
    projectHealthy([started(), evidence({ trust: "self-attested" })]),
    { action: "claim.complete", requiredKeys: ["tests"] },
  );
  const blockedMissing = planEvidenceTransition(projectHealthy([started()]), {
    action: "claim.complete",
    requiredKeys: ["tests"],
  });
  const blockedMalformed = planEvidenceTransition(
    projectRunTrackBranch([started(), { kind: "nope" }]),
    { action: "claim.complete", requiredKeys: ["tests"] },
  );

  for (const plan of [paused, blockedMissing, blockedMalformed]) {
    assert.ok(plan.decision === "pause" || plan.decision === "block");
    assert.equal(plan.transitionProposal, null);
    assert.ok(plan.occurrenceProposal);
    assert.equal(plan.occurrenceProposal?.kind, "guardrail.occurred");
  }
});

test("operator-observed required evidence allows a non-degraded transition proposal", () => {
  const projection = projectHealthy([started(), evidence({ trust: "operator-observed" })]);
  const plan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(plan.decision, "allow");
  assert.equal(plan.degraded, false);
  assert.equal(plan.occurrenceProposal, null);
  assert.ok(plan.transitionProposal);
  assert.equal(plan.transitionProposal?.kind, "task.transition-observed");
  assert.equal(plan.transitionProposal?.degraded, false);
  assert.equal(plan.transitionProposal?.acknowledgmentId, null);
  assert.equal(plan.transitionProposal?.factsDigest, projection.factsDigest);
});

test("fact-bound acknowledgment permits only degraded allow and binds action, policy, occurrence, facts", () => {
  const base = projectHealthy([started(), evidence({ trust: "self-attested" })]);
  const pause = planEvidenceTransition(base, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(pause.decision, "pause");
  const factsDigest = base.factsDigest!;

  const branch = [
    started(),
    evidence({ trust: "self-attested" }),
    occurred({
      id: "occ-1",
      action: "claim.complete",
      decision: "pause",
      reason: pause.reason,
      factsDigest,
    }),
    acknowledged({
      id: "ack-1",
      occurrenceId: "occ-1",
      action: "claim.complete",
      policyVersion: RUN_TRACK_POLICY_VERSION,
      factsDigest,
      origin: "operator-interactive",
    }),
  ];
  const projection = projectHealthy(branch);
  const plan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(plan.decision, "allow");
  assert.equal(plan.degraded, true);
  assert.equal(plan.matchedAcknowledgmentId, "ack-1");
  assert.equal(plan.occurrenceProposal, null);
  assert.ok(plan.transitionProposal);
  assert.equal(plan.transitionProposal?.degraded, true);
  assert.equal(plan.transitionProposal?.acknowledgmentId, "ack-1");
  assert.equal(plan.transitionProposal?.action, "claim.complete");
  assert.equal(plan.transitionProposal?.factsDigest, factsDigest);

  // Action mismatch on ack → still pause
  const wrongAction = projectHealthy([
    started(),
    evidence({ trust: "self-attested" }),
    occurred({ id: "occ-1", action: "claim.complete", decision: "pause", reason: "x", factsDigest }),
    acknowledged({ id: "ack-1", occurrenceId: "occ-1", action: "claim.other", factsDigest }),
  ]);
  assert.equal(
    planEvidenceTransition(wrongAction, { action: "claim.complete", requiredKeys: ["tests"] }).decision,
    "pause",
  );

  // Policy mismatch rejected at parse
  assert.equal(
    parseRunTrackEvent(
      acknowledged({ policyVersion: "rt-policy-v0", factsDigest }),
    ).ok,
    false,
  );
});

test("acknowledgment becomes stale after fact changes", () => {
  const initial = projectHealthy([started(), evidence({ trust: "self-attested", fingerprint: FP_A })]);
  const factsDigest = initial.factsDigest!;

  const afterFactsChange = projectHealthy([
    started(),
    evidence({ id: "evt-ev-1", trust: "self-attested", fingerprint: FP_A }),
    occurred({
      id: "occ-1",
      action: "claim.complete",
      decision: "pause",
      reason: "self-attested-only evidence",
      factsDigest,
    }),
    acknowledged({
      id: "ack-1",
      occurrenceId: "occ-1",
      action: "claim.complete",
      factsDigest,
    }),
    // Fact change: new fingerprint for same key
    evidence({ id: "evt-ev-2", evidenceId: "ev-2", trust: "self-attested", fingerprint: FP_B }),
  ]);

  assert.notEqual(afterFactsChange.factsDigest, factsDigest);
  const plan = planEvidenceTransition(afterFactsChange, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(plan.decision, "pause");
  assert.equal(plan.transitionProposal, null);
  assert.ok(plan.staleAcknowledgmentIds.includes("ack-1"));
});

test("acknowledgment ordering must follow occurrence (pre-transition binding)", () => {
  const base = projectHealthy([started(), evidence({ trust: "self-attested" })]);
  const factsDigest = base.factsDigest!;

  // Ack event id/order before occurrence in branch sequence — invalid binding.
  const outOfOrder = projectHealthy([
    started(),
    evidence({ trust: "self-attested" }),
    acknowledged({
      id: "ack-early",
      occurrenceId: "occ-late",
      action: "claim.complete",
      factsDigest,
    }),
    occurred({
      id: "occ-late",
      action: "claim.complete",
      decision: "pause",
      reason: "self-attested-only evidence",
      factsDigest,
    }),
  ]);
  const plan = planEvidenceTransition(outOfOrder, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(plan.decision, "pause");
  assert.equal(plan.matchedAcknowledgmentId, null);
  assert.equal(plan.transitionProposal, null);
});

test("hard block acknowledgments never upgrade to allow", () => {
  const base = projectHealthy([started()]);
  const factsDigest = base.factsDigest!;
  const projection = projectHealthy([
    started(),
    occurred({
      id: "occ-hard",
      action: "claim.complete",
      decision: "block",
      reason: "missing evidence: tests",
      factsDigest,
    }),
    acknowledged({
      id: "ack-hard",
      occurrenceId: "occ-hard",
      action: "claim.complete",
      factsDigest,
    }),
  ]);
  const plan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(plan.decision, "block");
  assert.equal(plan.transitionProposal, null);
});

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

test("createRunTrackReceipt returns compact metadata without journal payloads", () => {
  const projection = projectHealthy([
    started(),
    evidence({ trust: "operator-observed" }),
  ]);
  const plan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  const receipt = createRunTrackReceipt(projection, plan);
  assert.equal(receipt.ns, RUN_TRACK_NAMESPACE);
  assert.equal(receipt.trackId, "track-1");
  assert.equal(receipt.healthy, true);
  assert.equal(receipt.decision, "allow");
  assert.equal(receipt.degraded, false);
  assert.equal(receipt.factsDigest, projection.factsDigest);
  assert.equal(receipt.policyVersion, RUN_TRACK_POLICY_VERSION);
  assert.equal(receipt.eventCount, 2);
  assert.deepEqual(receipt.evidenceKeys, ["tests"]);
  assert.equal(receipt.occurrenceCount, 0);
  assert.equal(receipt.transitionCount, 0);

  const serialized = JSON.stringify(receipt);
  assert.ok(serialized.length < 2048);
  assert.ok(!("events" in receipt));
  assert.ok(!serialized.includes("fingerprint"));
});

test("degraded acknowledgment path is visible on receipt", () => {
  const base = projectHealthy([started(), evidence({ trust: "self-attested" })]);
  const factsDigest = base.factsDigest!;
  const projection = projectHealthy([
    started(),
    evidence({ trust: "self-attested" }),
    occurred({ id: "occ-1", decision: "pause", reason: "self-attested-only evidence", factsDigest }),
    acknowledged({ id: "ack-1", occurrenceId: "occ-1", factsDigest }),
  ]);
  const plan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  const receipt = createRunTrackReceipt(projection, plan);
  assert.equal(receipt.decision, "allow");
  assert.equal(receipt.degraded, true);
  assert.equal(receipt.occurrenceCount, 1);
});

// ---------------------------------------------------------------------------
// Fork lineage
// ---------------------------------------------------------------------------

test("deriveRunTrackFork is deterministic, idempotent, and ignores caller parent authority", () => {
  const parent = projectHealthy([started({ trackId: "track-parent", sessionId: "sess-parent" })]);
  const first = deriveRunTrackFork({ parent, childSessionId: "sess-child" });
  const second = deriveRunTrackFork({ parent, childSessionId: "sess-child" });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(first.value, second.value);
  assert.equal(first.value.parentTrackId, "track-parent");
  assert.equal(first.value.parentSessionId, "sess-parent");
  assert.equal(first.value.rootTrackId, "track-parent");
  assert.match(first.value.childTrackId, /^fork:[0-9a-f]{32}$/);

  const otherChild = deriveRunTrackFork({ parent, childSessionId: "sess-other" });
  assert.equal(otherChild.ok, true);
  if (otherChild.ok) assert.notEqual(otherChild.value.childTrackId, first.value.childTrackId);

  // Nested fork preserves root from parent lineage.
  const childStarted = started({
    id: "evt-start-child",
    trackId: "track-child",
    sessionId: "sess-child",
    lineage: first.value,
  });
  const childProj = projectHealthy([childStarted]);
  const grand = deriveRunTrackFork({ parent: childProj, childSessionId: "sess-grand" });
  assert.equal(grand.ok, true);
  if (grand.ok) {
    assert.equal(grand.value.parentTrackId, "track-child");
    assert.equal(grand.value.rootTrackId, "track-parent");
  }
});

test("deriveRunTrackFork rejects unhealthy parents and invalid child session ids", () => {
  const unhealthy = projectRunTrackBranch([{ bad: true }]);
  assert.equal(deriveRunTrackFork({ parent: unhealthy, childSessionId: "sess-child" }).ok, false);
  assert.equal(deriveRunTrackFork({ parent: projectHealthy([started()]), childSessionId: "" }).ok, false);
  assert.equal(
    deriveRunTrackFork({ parent: emptyishProjection(), childSessionId: "sess-child" }).ok,
    false,
  );
});

function emptyishProjection(): RunTrackProjection {
  return projectRunTrackBranch([]);
}

// ---------------------------------------------------------------------------
// Evaluate-before-append integration sketch (pure)
// ---------------------------------------------------------------------------

test("evaluate-before-append: pause then ack then degraded transition observation sequence", () => {
  const events: unknown[] = [started(), evidence({ trust: "self-attested" })];
  let projection = projectHealthy(events);

  const pausePlan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(pausePlan.decision, "pause");
  assert.equal(pausePlan.transitionProposal, null);
  assert.ok(pausePlan.occurrenceProposal);

  events.push(
    occurred({
      id: "occ-1",
      action: pausePlan.occurrenceProposal!.action,
      decision: pausePlan.occurrenceProposal!.decision,
      reason: pausePlan.occurrenceProposal!.reason,
      factsDigest: pausePlan.occurrenceProposal!.factsDigest,
    }),
  );
  projection = projectHealthy(events);

  events.push(
    acknowledged({
      id: "ack-1",
      occurrenceId: "occ-1",
      action: "claim.complete",
      factsDigest: projection.factsDigest!,
    }),
  );
  projection = projectHealthy(events);

  const allowPlan = planEvidenceTransition(projection, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(allowPlan.decision, "allow");
  assert.equal(allowPlan.degraded, true);
  assert.ok(allowPlan.transitionProposal);
  assert.equal(allowPlan.occurrenceProposal, null);

  events.push(
    transition({
      id: "tr-1",
      action: allowPlan.transitionProposal!.action,
      factsDigest: allowPlan.transitionProposal!.factsDigest,
      degraded: allowPlan.transitionProposal!.degraded,
      acknowledgmentId: allowPlan.transitionProposal!.acknowledgmentId,
    }),
  );
  projection = projectHealthy(events);
  assert.equal(projection.transitions.length, 1);
  assert.equal(projection.transitions[0]?.degraded, true);
  assert.equal(projection.transitions[0]?.acknowledgmentId, "ack-1");

  const receipt = createRunTrackReceipt(projection, allowPlan);
  assert.equal(receipt.degraded, true);
  assert.equal(receipt.transitionCount, 1);
});

test("module has no lifecycle completion state machine API surface", () => {
  const exported = {
    parseRunTrackEvent,
    projectRunTrackBranch,
    planEvidenceTransition,
    deriveRunTrackFork,
    createRunTrackReceipt,
    canonicalRunTrackJson,
    runTrackEvaluationDigest,
  };
  // Projection-oriented seam only — no complete/fail/cancel lifecycle verbs.
  for (const name of Object.keys(exported)) {
    assert.equal(/completeTask|failTask|cancelTask|mutateLifecycle|setStatus/.test(name), false);
  }
  const plan = planEvidenceTransition(projectHealthy([started(), evidence({ trust: "operator-observed" })]), {
    action: "claim.complete",
    requiredKeys: ["tests"],
  });
  // Decision observes a claim; it does not return domain lifecycle states.
  assert.equal(plan.transitionProposal?.kind, "task.transition-observed");
  assert.ok(!("lifecycleState" in (plan.transitionProposal ?? {})));
});

test("facts digest changes when evidence set changes and stays stable otherwise", () => {
  const a = projectHealthy([started(), evidence({ trust: "self-attested", fingerprint: FP_A })]);
  const b = projectHealthy([started(), evidence({ trust: "self-attested", fingerprint: FP_A })]);
  const c = projectHealthy([started(), evidence({ trust: "self-attested", fingerprint: FP_B })]);
  assert.equal(a.factsDigest, b.factsDigest);
  assert.notEqual(a.factsDigest, c.factsDigest);
});

// ---------------------------------------------------------------------------
// Review-pinned invariants (previously guaranteed only by inspection)
// ---------------------------------------------------------------------------

test("cross-track contamination and duplicate task.started fail projection closed", () => {
  // Foreign trackId on the active branch must not merge into this track's facts.
  const foreign = projectRunTrackBranch([started(), evidence({ trackId: "track-2", trust: "operator-observed" })]);
  assert.equal(foreign.healthy, false);
  assert.equal(
    planEvidenceTransition(foreign, { action: "claim.complete", requiredKeys: ["tests"] }).decision,
    "block",
  );

  // A second task.started on one branch is malformed lifecycle and fails closed.
  const doubled = projectRunTrackBranch([started(), started({ id: "evt-start-2" })]);
  assert.equal(doubled.healthy, false);
  assert.equal(
    planEvidenceTransition(doubled, { action: "claim.complete", requiredKeys: ["tests"] }).decision,
    "block",
  );
});

test("empty requiredKeys yields an explicit non-degraded allow with no evidence obligation", () => {
  const plan = planEvidenceTransition(projectHealthy([started()]), {
    action: "claim.complete",
    requiredKeys: [],
  });
  assert.equal(plan.decision, "allow");
  assert.equal(plan.degraded, false);
  assert.match(plan.reason, /no evidence keys required/);
  assert.equal(plan.occurrenceProposal, null);
  assert.equal(plan.transitionProposal?.degraded, false);
  assert.equal(plan.transitionProposal?.acknowledgmentId, null);
});

test("mixed-trust aggregation: one operator-observed key elevates a self-attested peer to allow", () => {
  const mixed = projectHealthy([
    started(),
    evidence({ id: "evt-ev-a", evidenceId: "ev-a", key: "tests", trust: "operator-observed", fingerprint: FP_A }),
    evidence({ id: "evt-ev-b", evidenceId: "ev-b", key: "review", trust: "self-attested", fingerprint: FP_B }),
  ]);
  const allow = planEvidenceTransition(mixed, { action: "claim.complete", requiredKeys: ["tests", "review"] });
  assert.equal(allow.decision, "allow");
  assert.equal(allow.degraded, false);
  assert.equal(allow.transitionProposal?.acknowledgmentId, null);

  // All-self-attested counterpart pauses (no elevated key present).
  const allSelf = projectHealthy([
    started(),
    evidence({ id: "evt-ev-a", evidenceId: "ev-a", key: "tests", trust: "self-attested", fingerprint: FP_A }),
    evidence({ id: "evt-ev-b", evidenceId: "ev-b", key: "review", trust: "self-attested", fingerprint: FP_B }),
  ]);
  assert.equal(
    planEvidenceTransition(allSelf, { action: "claim.complete", requiredKeys: ["tests", "review"] }).decision,
    "pause",
  );
});

test("invalid-action hard block emits a re-parseable occurrence proposal in both facts branches", () => {
  // Healthy projection (factsDigest present) with an invalid action.
  const withFacts = planEvidenceTransition(projectHealthy([started()]), {
    action: "BAD ACTION!",
    requiredKeys: ["tests"],
  });
  assert.equal(withFacts.decision, "block");
  assert.equal(withFacts.transitionProposal, null);
  assert.equal(withFacts.occurrenceProposal?.action, "invalid-action");
  const reparsedWithFacts = parseRunTrackEvent(
    occurred({
      id: "evt-occ-x",
      action: withFacts.occurrenceProposal!.action,
      decision: withFacts.occurrenceProposal!.decision,
      reason: withFacts.occurrenceProposal!.reason,
      policyVersion: withFacts.occurrenceProposal!.policyVersion,
      factsDigest: withFacts.occurrenceProposal!.factsDigest,
    }),
  );
  assert.equal(reparsedWithFacts.ok, true, reparsedWithFacts.ok ? "" : reparsedWithFacts.error);

  // Empty-branch counterpart (factsDigest null) must also sanitize.
  const noFacts = planEvidenceTransition(projectRunTrackBranch([]), {
    action: "BAD ACTION!",
    requiredKeys: ["tests"],
  });
  assert.equal(noFacts.decision, "block");
  assert.equal(noFacts.occurrenceProposal?.action, "invalid-action");
});

test("defensive replay branches fail safe: non-array input and duplicate acknowledgments", () => {
  // Non-array branch input projects to an unhealthy/empty projection, never throws.
  const nonArray = projectRunTrackBranch("not-an-array" as unknown as unknown[]);
  assert.equal(nonArray.healthy, false);
  assert.equal(
    planEvidenceTransition(nonArray, { action: "claim.complete", requiredKeys: ["tests"] }).decision,
    "block",
  );

  // Two acknowledgments for one pause occurrence: first match wins, still a single degraded allow.
  const base = projectHealthy([started(), evidence({ trust: "self-attested" })]);
  const pause = planEvidenceTransition(base, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(pause.decision, "pause");
  const dg = base.factsDigest!;
  const dup = projectHealthy([
    started(),
    evidence({ trust: "self-attested" }),
    occurred({ id: "evt-occ-1", factsDigest: dg }),
    acknowledged({ id: "evt-ack-1", occurrenceId: "evt-occ-1", factsDigest: dg }),
    acknowledged({ id: "evt-ack-2", occurrenceId: "evt-occ-1", factsDigest: dg }),
  ]);
  const allow = planEvidenceTransition(dup, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(allow.decision, "allow");
  assert.equal(allow.degraded, true);
  assert.equal(allow.matchedAcknowledgmentId, "evt-ack-1");
});
