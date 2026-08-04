/**
 * Isolated tests for the Run Track v1 Pi journal adapter extension.
 * Drives the real extension with a fake Pi host (ticket-runner convention).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import runTrack, {
  RUN_TRACK_ENTRY_TYPE,
  RUN_TRACK_EVIDENCE_TOOL,
  consultEvidenceTransition,
  ensureRunTrackStarted,
  projectRunTrackContext,
  recordSelfAttestedEvidence,
} from "../extensions/run-track.ts";
import {
  RUN_TRACK_NAMESPACE,
  RUN_TRACK_POLICY_VERSION,
  RUN_TRACK_VERSION,
  createRunTrackReceipt,
  planEvidenceTransition,
  projectRunTrackBranch,
  type RunTrackReceipt,
} from "../lib/run-track-v1.ts";

const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);

function fakePi() {
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => unknown>> = {};
  const tools: Record<
    string,
    {
      name: string;
      label?: string;
      description: string;
      parameters: unknown;
      execute: (...args: any[]) => Promise<any>;
    }
  > = {};
  return {
    handlers,
    tools,
    entries: [] as any[],
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      (handlers[event] ??= []).push(handler);
    },
    registerTool(def: {
      name: string;
      label?: string;
      description: string;
      parameters: unknown;
      execute: (...args: any[]) => Promise<any>;
    }) {
      tools[def.name] = def;
    },
    // Match the host's custom-entry shape so reconstruction sees persisted events.
    appendEntry(type: string, data: unknown) {
      this.entries.push({ type: "custom", customType: type, data: structuredClone(data) });
    },
  };
}

function context(pi: ReturnType<typeof fakePi>, opts?: { throwOnGetEntries?: boolean; sessionId?: string }) {
  const throwOnGetEntries = opts?.throwOnGetEntries !== false;
  return {
    cwd: process.cwd(),
    mode: "headless" as const,
    hasUI: false,
    isIdle: () => true,
    hasPendingMessages: () => false,
    sessionManager: {
      getBranch: () => pi.entries,
      getSessionId: () => opts?.sessionId ?? "session-test-1",
      getEntries: () => {
        if (throwOnGetEntries) {
          throw new Error("getEntries() must not be used for Run Track replay");
        }
        return pi.entries;
      },
      buildContextEntries: () => {
        throw new Error("buildContextEntries() must not be used for Run Track replay");
      },
    },
    ui: {
      setStatus() {},
      notify() {},
      theme: { fg: (_: string, text: string) => text },
    },
  };
}

function runHandlers(pi: ReturnType<typeof fakePi>, event: "session_start" | "session_tree", ctx: unknown) {
  const list = pi.handlers[event] ?? [];
  assert.ok(list.length > 0, `${event} handler registered`);
  for (const handler of list) handler({}, ctx);
}

function runTrackEntries(pi: ReturnType<typeof fakePi>) {
  return pi.entries.filter((e) => e.type === "custom" && e.customType === RUN_TRACK_ENTRY_TYPE);
}

function kinds(pi: ReturnType<typeof fakePi>): string[] {
  return runTrackEntries(pi).map((e) => e.data?.kind);
}

function isBoundedReceipt(details: unknown): details is RunTrackReceipt {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return false;
  const r = details as Record<string, unknown>;
  const keys = Object.keys(r).sort();
  const expected = [
    "decision",
    "degraded",
    "eventCount",
    "evidenceKeys",
    "factsDigest",
    "healthy",
    "ns",
    "occurrenceCount",
    "policyVersion",
    "reason",
    "trackId",
    "transitionCount",
  ].sort();
  if (keys.join(",") !== expected.join(",")) return false;
  if (r.ns !== RUN_TRACK_NAMESPACE) return false;
  if (r.policyVersion !== RUN_TRACK_POLICY_VERSION) return false;
  if (typeof r.healthy !== "boolean") return false;
  if (typeof r.degraded !== "boolean") return false;
  if (typeof r.eventCount !== "number") return false;
  if (!Array.isArray(r.evidenceKeys)) return false;
  // Never journal state / raw evidence content.
  if ("events" in r || "evidenceByKey" in r || "content" in r || "body" in r || "raw" in r) return false;
  return true;
}

// ---------------------------------------------------------------------------
// AC1 — getBranch replay on session_start + session_tree; never getEntries
// ---------------------------------------------------------------------------

test("AC1: state restoration uses getBranch on session_start and session_tree; never getEntries", async () => {
  const pi = fakePi();
  runTrack(pi as never);
  const ctx = context(pi, { throwOnGetEntries: true });

  // Seed a valid started event before replay.
  pi.appendEntry(RUN_TRACK_ENTRY_TYPE, {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "task.started",
    id: "evt-start-1",
    ts: "2026-08-04T12:00:00.000Z",
    trackId: "track-1",
    sessionId: "session-test-1",
    taskRef: "task/demo",
    lineage: null,
  });

  // getEntries throws on this ctx — replay must still succeed.
  runHandlers(pi, "session_start", ctx);
  const afterStart = projectRunTrackContext(ctx);
  assert.equal(afterStart.healthy, true);
  assert.equal(afterStart.trackId, "track-1");
  assert.equal(afterStart.eventCount, 1);

  runHandlers(pi, "session_tree", ctx);
  const afterTree = projectRunTrackContext(ctx);
  assert.equal(afterTree.healthy, true);
  assert.equal(afterTree.trackId, "track-1");

  // Explicit: both handlers registered; no reliance on getEntries.
  assert.ok(pi.handlers.session_start?.length);
  assert.ok(pi.handlers.session_tree?.length);
  assert.equal(pi.handlers.tool_call, undefined);
});

// ---------------------------------------------------------------------------
// AC2 — namespace + strict schema + bounded receipt details
// ---------------------------------------------------------------------------

test("AC2: custom entries use approved namespace/schema; tool details are bounded receipts", async () => {
  const pi = fakePi();
  runTrack(pi as never);
  const ctx = context(pi);
  runHandlers(pi, "session_start", ctx);

  const tool = pi.tools[RUN_TRACK_EVIDENCE_TOOL];
  assert.ok(tool, "evidence tool registered");

  const result = await tool.execute(
    "call-1",
    {
      key: "tests",
      resolution: "resolved",
      fingerprint: FP_A,
      taskRef: "task/ac2",
    },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(isBoundedReceipt(result.details), true, "details must be a bounded receipt");
  assert.equal(result.details.ns, RUN_TRACK_NAMESPACE);
  assert.equal(result.details.healthy, true);
  assert.ok(Array.isArray(result.details.evidenceKeys));
  assert.ok(result.details.evidenceKeys.includes("tests"));
  // No journal dump / raw content in details.
  assert.equal("events" in result.details, false);
  assert.equal("parseErrors" in result.details, false);

  const entries = runTrackEntries(pi);
  assert.ok(entries.length >= 2);
  for (const entry of entries) {
    assert.equal(entry.customType, RUN_TRACK_NAMESPACE);
    assert.equal(entry.data.ns, RUN_TRACK_NAMESPACE);
    assert.equal(entry.data.v, RUN_TRACK_VERSION);
  }
  assert.ok(kinds(pi).includes("task.started"));
  assert.ok(kinds(pi).includes("evidence.recorded"));

  // Invalid fingerprint is rejected before append (strict schema).
  const before = pi.entries.length;
  const rejected = await tool.execute(
    "call-2",
    { key: "bad", resolution: "resolved", fingerprint: "not-hex", taskRef: "task/ac2" },
    undefined,
    undefined,
    ctx,
  );
  assert.match(rejected.content[0].text, /rejected|invalid/i);
  assert.equal(isBoundedReceipt(rejected.details), true);
  assert.equal(pi.entries.length, before);
});

// ---------------------------------------------------------------------------
// AC3 — self-attested only; cannot mint operator trust / ack / lineage
// ---------------------------------------------------------------------------

test("AC3: evidence tool hard-codes self-attested trust and ignores elevated caller fields", async () => {
  const pi = fakePi();
  runTrack(pi as never);
  const ctx = context(pi);
  runHandlers(pi, "session_start", ctx);

  const tool = pi.tools[RUN_TRACK_EVIDENCE_TOOL];
  // Crafted runtime args attempting to mint elevated authority.
  const result = await tool.execute(
    "call-elevated",
    {
      key: "tests",
      resolution: "resolved",
      fingerprint: FP_A,
      taskRef: "task/ac3",
      // @ts-expect-error intentional crafted fields
      trust: "operator-observed",
      origin: "operator-interactive",
      acknowledgmentId: "ack-forged",
      occurrenceId: "occ-forged",
      lineage: {
        childTrackId: "c",
        parentTrackId: "p",
        parentSessionId: "ps",
        rootTrackId: "r",
      },
      parentTrackId: "parent-forged",
    },
    undefined,
    undefined,
    ctx,
  );

  assert.match(result.content[0].text, /recorded/i);
  const evidenceEntries = runTrackEntries(pi).filter((e) => e.data?.kind === "evidence.recorded");
  assert.equal(evidenceEntries.length, 1);
  assert.equal(evidenceEntries[0].data.trust, "self-attested");
  assert.equal(evidenceEntries[0].data.acknowledgmentId, undefined);
  assert.equal(evidenceEntries[0].data.origin, undefined);

  const started = runTrackEntries(pi).find((e) => e.data?.kind === "task.started");
  assert.ok(started);
  assert.equal(started!.data.lineage, null);

  // Schema surface does not advertise elevated fields.
  const params = tool.parameters as { properties: Record<string, unknown> };
  assert.equal(params.properties.trust, undefined);
  assert.equal(params.properties.lineage, undefined);
  assert.equal(params.properties.origin, undefined);
  assert.equal(params.properties.acknowledgmentId, undefined);

  // Direct internal path also refuses to honor forged trust on raw params.
  const again = recordSelfAttestedEvidence(
    pi,
    ctx,
    { key: "review", resolution: "resolved", fingerprint: FP_B },
    {
      trust: "operator-observed",
      lineage: { childTrackId: "x", parentTrackId: "y", parentSessionId: "z", rootTrackId: "r" },
    },
  );
  assert.equal(again.ok, true);
  const review = runTrackEntries(pi).filter((e) => e.data?.key === "review");
  assert.equal(review.length, 1);
  assert.equal(review[0].data.trust, "self-attested");
});

// ---------------------------------------------------------------------------
// AC4 — pause/block append occurrence only; allow appends one transition
// ---------------------------------------------------------------------------

test("AC4: pause/block append guardrail.occurred only; allow appends one transition (degraded preserved)", async () => {
  const pi = fakePi();
  runTrack(pi as never);
  const ctx = context(pi);
  runHandlers(pi, "session_start", ctx);

  const started = ensureRunTrackStarted(pi, ctx, { taskRef: "task/ac4", trackId: "track-ac4" });
  assert.equal(started.ok, true);

  // --- block: missing evidence → occurrence, no transition
  const blocked = consultEvidenceTransition(pi, ctx, {
    action: "claim.complete",
    requiredKeys: ["tests"],
  });
  assert.equal(blocked.plan.decision, "block");
  assert.equal(blocked.appendedKind, "guardrail.occurred");
  assert.equal(blocked.plan.transitionProposal, null);
  assert.ok(blocked.plan.occurrenceProposal);
  assert.deepEqual(
    kinds(pi).filter((k) => k === "task.transition-observed"),
    [],
  );
  assert.equal(kinds(pi).filter((k) => k === "guardrail.occurred").length, 1);

  // --- pause: self-attested-only → occurrence, no transition
  const ev = await pi.tools[RUN_TRACK_EVIDENCE_TOOL].execute(
    "ev-1",
    { key: "tests", resolution: "resolved", fingerprint: FP_A },
    undefined,
    undefined,
    ctx,
  );
  assert.match(ev.content[0].text, /recorded/i);

  const paused = consultEvidenceTransition(pi, ctx, {
    action: "claim.complete",
    requiredKeys: ["tests"],
  });
  assert.equal(paused.plan.decision, "pause");
  assert.equal(paused.appendedKind, "guardrail.occurred");
  assert.equal(paused.plan.transitionProposal, null);
  assert.equal(kinds(pi).filter((k) => k === "task.transition-observed").length, 0);
  assert.equal(kinds(pi).filter((k) => k === "guardrail.occurred").length, 2);

  // --- allow (no keys required): exactly one transition-observed, not degraded
  const allowed = consultEvidenceTransition(pi, ctx, {
    action: "claim.noop",
    requiredKeys: [],
  });
  assert.equal(allowed.plan.decision, "allow");
  assert.equal(allowed.appendedKind, "task.transition-observed");
  assert.equal(allowed.plan.degraded, false);
  assert.equal(kinds(pi).filter((k) => k === "task.transition-observed").length, 1);
  const tr = runTrackEntries(pi).find((e) => e.data?.kind === "task.transition-observed");
  assert.ok(tr);
  assert.equal(tr!.data.degraded, false);
  assert.equal(tr!.data.action, "claim.noop");

  // --- degraded allow via pre-seeded occurrence+ack binding (adapter preserves degraded)
  const pi2 = fakePi();
  runTrack(pi2 as never);
  const ctx2 = context(pi2, { sessionId: "session-deg" });
  runHandlers(pi2, "session_start", ctx2);
  ensureRunTrackStarted(pi2, ctx2, { taskRef: "task/deg", trackId: "track-deg", sessionId: "session-deg" });
  recordSelfAttestedEvidence(pi2, ctx2, {
    key: "tests",
    resolution: "resolved",
    fingerprint: FP_A,
  });
  const proj = projectRunTrackContext(ctx2);
  assert.equal(proj.healthy, true);
  const pausePlan = planEvidenceTransition(proj, { action: "claim.complete", requiredKeys: ["tests"] });
  assert.equal(pausePlan.decision, "pause");
  assert.ok(pausePlan.occurrenceProposal);
  assert.ok(pausePlan.factsDigest);

  // Seed occurrence + matching operator ack (T3 owns the interactive path; journal shape is core).
  pi2.appendEntry(RUN_TRACK_ENTRY_TYPE, {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "guardrail.occurred",
    id: "evt-occ-deg",
    ts: "2026-08-04T12:01:00.000Z",
    trackId: "track-deg",
    action: "claim.complete",
    decision: "pause",
    reason: "self-attested-only evidence",
    policyVersion: RUN_TRACK_POLICY_VERSION,
    factsDigest: pausePlan.factsDigest,
  });
  pi2.appendEntry(RUN_TRACK_ENTRY_TYPE, {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "guardrail.acknowledged",
    id: "evt-ack-deg",
    ts: "2026-08-04T12:02:00.000Z",
    trackId: "track-deg",
    occurrenceId: "evt-occ-deg",
    action: "claim.complete",
    policyVersion: RUN_TRACK_POLICY_VERSION,
    factsDigest: pausePlan.factsDigest,
    origin: "operator-interactive",
  });

  const degraded = consultEvidenceTransition(pi2, ctx2, {
    action: "claim.complete",
    requiredKeys: ["tests"],
  });
  assert.equal(degraded.plan.decision, "allow");
  assert.equal(degraded.plan.degraded, true);
  assert.equal(degraded.appendedKind, "task.transition-observed");
  assert.equal(degraded.receipt.degraded, true);
  const degTr = runTrackEntries(pi2).find((e) => e.data?.kind === "task.transition-observed");
  assert.ok(degTr);
  assert.equal(degTr!.data.degraded, true);
  assert.equal(degTr!.data.acknowledgmentId, "evt-ack-deg");
});

// ---------------------------------------------------------------------------
// AC5 — no foreign lifecycle mutation; no global tool blocking
// ---------------------------------------------------------------------------

test("AC5: adapter does not block foreign tools or mutate foreign subsystem state", async () => {
  const pi = fakePi();
  // Pre-existing foreign custom entry (ticket-batch-state stand-in).
  const foreign = {
    version: 1,
    batchId: "b-foreign",
    tickets: [{ id: "T9", status: "in_progress" }],
  };
  pi.entries.push({ type: "custom", customType: "ticket-batch-state", data: structuredClone(foreign) });

  runTrack(pi as never);
  const ctx = context(pi);
  runHandlers(pi, "session_start", ctx);

  // No unconditional tool_call interception.
  assert.equal(pi.handlers.tool_call, undefined);
  assert.equal(pi.handlers.tool_execution_start, undefined);

  // Only the evidence tool is registered by this extension.
  assert.deepEqual(Object.keys(pi.tools), [RUN_TRACK_EVIDENCE_TOOL]);

  await pi.tools[RUN_TRACK_EVIDENCE_TOOL].execute(
    "x",
    { key: "tests", resolution: "resolved", fingerprint: FP_A, taskRef: "task/ac5" },
    undefined,
    undefined,
    ctx,
  );
  consultEvidenceTransition(pi, ctx, { action: "claim.complete", requiredKeys: ["tests"] });

  const foreignAfter = pi.entries.filter((e) => e.customType === "ticket-batch-state");
  assert.equal(foreignAfter.length, 1);
  assert.deepEqual(foreignAfter[0].data, foreign);
  assert.equal(foreignAfter[0].data.tickets[0].status, "in_progress");
});

// ---------------------------------------------------------------------------
// AC6 — malformed active-branch entries remain fail-closed (visible, not repaired)
// ---------------------------------------------------------------------------

test("AC6: malformed active-branch entries fail closed and are not skipped/repaired", async () => {
  const pi = fakePi();
  runTrack(pi as never);
  const ctx = context(pi);

  pi.appendEntry(RUN_TRACK_ENTRY_TYPE, {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "task.started",
    id: "evt-start-ok",
    ts: "2026-08-04T12:00:00.000Z",
    trackId: "track-mal",
    sessionId: "session-mal",
    taskRef: "task/mal",
    lineage: null,
  });
  // Malformed: unknown field + bad kind mix
  pi.entries.push({
    type: "custom",
    customType: RUN_TRACK_ENTRY_TYPE,
    data: { v: 1, ns: RUN_TRACK_NAMESPACE, kind: "evidence.recorded", totally: "broken" },
  });

  runHandlers(pi, "session_start", ctx);
  const projection = projectRunTrackContext(ctx);
  assert.equal(projection.healthy, false);
  assert.ok(projection.malformedCount >= 1);
  assert.ok(projection.parseErrors.length >= 1);

  // Evidence tool refuses to append on unhealthy branch (no repair).
  const before = pi.entries.length;
  const result = await pi.tools[RUN_TRACK_EVIDENCE_TOOL].execute(
    "x",
    { key: "tests", resolution: "resolved", fingerprint: FP_A, taskRef: "task/mal" },
    undefined,
    undefined,
    ctx,
  );
  assert.match(result.content[0].text, /rejected|malformed|unhealthy/i);
  assert.equal(result.details.healthy, false);
  assert.equal(pi.entries.length, before, "must not append or overwrite malformed entries");

  // Malformed entry still present and untouched.
  const malformed = pi.entries.find((e) => e.data && e.data.totally === "broken");
  assert.ok(malformed);
  assert.equal(malformed.data.totally, "broken");

  // Prospective transition also fail-closed.
  const consulted = consultEvidenceTransition(pi, ctx, {
    action: "claim.complete",
    requiredKeys: ["tests"],
  });
  assert.equal(consulted.plan.decision, "block");
  assert.match(consulted.plan.reason, /malformed/i);
  // Unhealthy with a track still appends occurrence (durable guardrail), never transition.
  assert.equal(consulted.appendedKind, "guardrail.occurred");
  assert.equal(
    runTrackEntries(pi).filter((e) => e.data?.kind === "task.transition-observed").length,
    0,
  );
});

// ---------------------------------------------------------------------------
// AC7 — no prototype path, deps, settings, network fixtures
// ---------------------------------------------------------------------------

test("AC7: extension source has no prototype import, fixture provider, or settings coupling", () => {
  const source = readFileSync(join(process.cwd(), "extensions/run-track.ts"), "utf8");
  // Shipped adapter only — do not scan this test file (it may name forbidden paths in assertions).
  assert.equal(source.includes("/tmp/run-track-v1-prototype"), false);
  assert.equal(/fixture-provider|fixtureProvider/i.test(source), false);
  assert.equal(source.includes("pi.events"), false);
  assert.equal(/from\s+["'][^"']*(node-fetch|openai|anthropic)/i.test(source), false);
  assert.equal(/readFileSync|writeFileSync|fetch\(/i.test(source), false);
  assert.equal(source.includes("settings.json"), false);
  // Extension only type-imports the SDK (no runtime package coupling beyond peers).
  assert.match(source, /import type \{[^}]*ExtensionAPI/);
  assert.equal(source.includes("registerCommand"), false);
  // Receipt helper stays bounded.
  const empty = projectRunTrackBranch([]);
  const receipt = createRunTrackReceipt(empty);
  assert.equal(isBoundedReceipt(receipt), true);
  // Smoke: fingerprint helper used only as metadata in tests.
  assert.equal(createHash("sha256").update("x").digest("hex").length, 64);
});

// ---------------------------------------------------------------------------
// Wiring smoke: both lifecycle handlers + tool name stable
// ---------------------------------------------------------------------------

test("extension wires session_start, session_tree, and the self-attested evidence tool only", () => {
  const pi = fakePi();
  runTrack(pi as never);
  assert.ok(pi.handlers.session_start?.length);
  assert.ok(pi.handlers.session_tree?.length);
  assert.equal(RUN_TRACK_ENTRY_TYPE, "run-track/v1");
  assert.equal(RUN_TRACK_EVIDENCE_TOOL, "run_track_record_evidence");
  assert.ok(pi.tools[RUN_TRACK_EVIDENCE_TOOL]);
  assert.match(pi.tools[RUN_TRACK_EVIDENCE_TOOL].description, /self-attested/i);
});

// ---------------------------------------------------------------------------
// Consult seam idempotency: repeated non-allow consults do not grow the journal
// ---------------------------------------------------------------------------

test("consultEvidenceTransition does not re-append a duplicate occurrence on repeated consults", () => {
  const pi = fakePi();
  runTrack(pi as never);
  const ctx = context(pi);
  runHandlers(pi, "session_start", ctx);
  ensureRunTrackStarted(pi, ctx, { taskRef: "task/idem", trackId: "track-idem" });

  const req = { action: "claim.complete", requiredKeys: ["tests"] } as const;
  const first = consultEvidenceTransition(pi, ctx, req);
  assert.equal(first.plan.decision, "block");
  assert.equal(first.appendedKind, "guardrail.occurred");

  const second = consultEvidenceTransition(pi, ctx, req);
  assert.equal(second.plan.decision, "block");
  // Same action/decision/facts — deduped: no new durable occurrence appended.
  assert.equal(second.appendedKind, null);

  const third = consultEvidenceTransition(pi, ctx, req);
  assert.equal(third.appendedKind, null);

  const occurrences = runTrackEntries(pi).filter((e) => e.data?.kind === "guardrail.occurred");
  assert.equal(occurrences.length, 1);
  assert.equal(kinds(pi).filter((k) => k === "task.transition-observed").length, 0);
});
