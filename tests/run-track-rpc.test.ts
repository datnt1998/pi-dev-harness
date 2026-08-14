/**
 * Run Track v1 — T3 operator acknowledgment mode gates + real isolated Pi SessionManager tests.
 *
 * SDK resolution mirrors scripts/sdk-smoke.mjs. When the SDK cannot be resolved,
 * integration tests skip so `npm test` stays portable; when resolvable they run.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import runTrack, {
  RUN_TRACK_ACK_COMMAND,
  RUN_TRACK_ENTRY_TYPE,
  RUN_TRACK_EVIDENCE_TOOL,
  acknowledgeGuardrailOccurrence,
  consultEvidenceTransition,
  ensureRunTrackStarted,
  extractRunTrackEventData,
  projectRunTrackContext,
  recordSelfAttestedEvidence,
} from "../extensions/run-track.ts";
import {
  RUN_TRACK_NAMESPACE,
  RUN_TRACK_POLICY_VERSION,
  RUN_TRACK_VERSION,
  createRunTrackReceipt,
  deriveRunTrackFork,
  planEvidenceTransition,
  projectRunTrackBranch,
  type RunTrackReceipt,
} from "../lib/run-track-v1.ts";

const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// SDK resolution (same candidate order as scripts/sdk-smoke.mjs)
// ---------------------------------------------------------------------------

function resolvePiSdkRoot(): string | null {
  const candidates: string[] = [];
  try {
    candidates.push(dirname(require.resolve("@earendil-works/pi-coding-agent/package.json")));
  } catch {
    // not installed locally
  }
  if (process.env.PI_CODING_AGENT_ROOT) candidates.push(process.env.PI_CODING_AGENT_ROOT);
  candidates.push(
    join(dirname(dirname(process.execPath)), "lib/node_modules/@earendil-works/pi-coding-agent"),
  );
  try {
    candidates.push(
      join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent"),
    );
  } catch {
    // npm root -g unavailable
  }
  return candidates.find((candidate) => existsSync(join(candidate, "dist/index.js"))) ?? null;
}

const PI_SDK_ROOT = resolvePiSdkRoot();

type PiSdk = {
  SessionManager: {
    create: (cwd: string, sessionDir?: string) => SessionManagerLike;
    open: (path: string, sessionDir?: string) => SessionManagerLike;
    inMemory: (cwd?: string) => SessionManagerLike;
    forkFrom: (sourcePath: string, targetCwd: string, sessionDir?: string) => SessionManagerLike;
  };
};

type SessionManagerLike = {
  getSessionId: () => string;
  getSessionFile: () => string | undefined;
  getBranch: (fromId?: string) => readonly any[];
  getEntries: () => readonly any[];
  getLeafId: () => string | null;
  appendCustomEntry: (customType: string, data?: unknown) => string;
  appendMessage: (message: unknown) => string;
  branch: (branchFromId: string) => void;
  createBranchedSession?: (leafId: string) => string | undefined;
};

async function loadPiSdk(): Promise<PiSdk | null> {
  if (!PI_SDK_ROOT) return null;
  const mod = await import(pathToFileURL(join(PI_SDK_ROOT, "dist/index.js")).href);
  return mod as PiSdk;
}

function tempPair(label: string): { cwd: string; sessionDir: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), `run-track-${label}-`));
  const cwd = join(root, "cwd");
  const sessionDir = join(root, "sessions");
  // SessionManager.create creates sessionDir; cwd just needs to exist as a path string.
  // mkdtemp created root only — create children via SessionManager / explicit mkdir not required for cwd string.
  return {
    cwd,
    sessionDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Force SessionManager file flush (custom entries alone are deferred until an assistant message). */
function seedFlushableSession(sm: SessionManagerLike): void {
  sm.appendMessage({
    role: "user",
    content: "run-track isolation seed",
    timestamp: Date.now(),
  });
  sm.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    timestamp: Date.now(),
    api: "openai-responses",
    provider: "test",
    model: "test-model",
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
    stopReason: "stop",
  });
}

function appendPiFor(sm: SessionManagerLike) {
  return {
    appendEntry(customType: string, data?: unknown) {
      sm.appendCustomEntry(customType, data);
    },
  };
}

function ctxFor(
  sm: SessionManagerLike,
  mode: string,
  opts?: { hasUI?: boolean },
) {
  return {
    cwd: "/tmp/run-track-test-cwd",
    mode,
    hasUI: opts?.hasUI ?? (mode === "tui" || mode === "rpc"),
    sessionManager: sm,
    ui: { setStatus() {}, notify() {}, theme: { fg: (_c: string, t: string) => t } },
    isIdle: () => true,
    hasPendingMessages: () => false,
  };
}

function customRunTrackData(branch: readonly any[]): any[] {
  return branch
    .filter((e) => e?.type === "custom" && e.customType === RUN_TRACK_ENTRY_TYPE)
    .map((e) => e.data);
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
  if ("events" in r || "evidenceByKey" in r || "content" in r || "body" in r || "raw" in r) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Fake host for non-SDK unit tests (mode gating)
// ---------------------------------------------------------------------------

function fakePi() {
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => unknown>> = {};
  const tools: Record<string, { name: string; execute: (...args: any[]) => Promise<any>; parameters?: unknown; description?: string }> = {};
  const commands: Record<
    string,
    { description?: string; handler: (args: string, ctx: unknown) => Promise<void> }
  > = {};
  return {
    handlers,
    tools,
    commands,
    entries: [] as any[],
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      (handlers[event] ??= []).push(handler);
    },
    registerTool(def: { name: string; execute: (...args: any[]) => Promise<any>; parameters?: unknown; description?: string }) {
      tools[def.name] = def;
    },
    // Real host method name — present so the extension installs the ack command.
    registerCommand(name: string, def: { description?: string; handler: (args: string, ctx: unknown) => Promise<void> }) {
      commands[name] = def;
    },
    appendEntry(type: string, data: unknown) {
      this.entries.push({ type: "custom", customType: type, data: structuredClone(data) });
    },
  };
}

function fakeCtx(pi: ReturnType<typeof fakePi>, mode: string, opts?: { hasUI?: boolean; sessionId?: string }) {
  const notifications: Array<{ message: string; level?: string }> = [];
  return {
    notifications,
    ctx: {
      cwd: process.cwd(),
      mode,
      hasUI: opts?.hasUI ?? false,
      isIdle: () => true,
      hasPendingMessages: () => false,
      sessionManager: {
        getBranch: () => pi.entries,
        getSessionId: () => opts?.sessionId ?? "session-ack-test",
        getEntries: () => {
          throw new Error("getEntries() must not be used for Run Track replay");
        },
      },
      ui: {
        setStatus() {},
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
        theme: { fg: (_: string, text: string) => text },
      },
    },
  };
}

function seedPausedTrack(pi: ReturnType<typeof fakePi>, ctx: ReturnType<typeof fakeCtx>["ctx"], action = "claim.complete") {
  const started = ensureRunTrackStarted(pi, ctx, {
    taskRef: "task/ack",
    trackId: "track-ack",
    sessionId: "session-ack-test",
  });
  assert.equal(started.ok, true);
  const ev = recordSelfAttestedEvidence(pi, ctx, {
    key: "tests",
    resolution: "resolved",
    fingerprint: FP_A,
  });
  assert.equal(ev.ok, true);
  const paused = consultEvidenceTransition(pi, ctx, { action, requiredKeys: ["tests"] });
  assert.equal(paused.plan.decision, "pause");
  assert.equal(paused.appendedKind, "guardrail.occurred");
  return paused;
}

// ===========================================================================
// Unit: operator acknowledgment mode gating (no SDK required)
// ===========================================================================

test("ack command name is stable and not exported as a model tool", () => {
  const pi = fakePi();
  runTrack(pi as never);
  assert.equal(RUN_TRACK_ACK_COMMAND, "run-track-ack");
  assert.ok(pi.commands[RUN_TRACK_ACK_COMMAND], "operator command registered");
  assert.equal(pi.tools[RUN_TRACK_ACK_COMMAND], undefined);
  assert.ok(pi.tools[RUN_TRACK_EVIDENCE_TOOL], "evidence tool still registered");
  // No tool whose name is an acknowledgment authority (avoid matching "track").
  for (const name of Object.keys(pi.tools)) {
    assert.equal(
      /(^|_)ack(nowledge)?(_|$)/i.test(name) || /acknowledge/i.test(name),
      false,
      `tool must not expose ack: ${name}`,
    );
  }
});

test("extension registers exactly one operator command (the ack command) and no more", () => {
  const pi = fakePi();
  runTrack(pi as never);
  // Surface guard (Spec-N1): the extension must not silently grow its command surface.
  assert.deepEqual(Object.keys(pi.commands), [RUN_TRACK_ACK_COMMAND]);
  const source = readFileSync(join(process.cwd(), "extensions/run-track.ts"), "utf8");
  const calls = source.match(/pi\.registerCommand\(/g) ?? [];
  assert.equal(calls.length, 1, "exactly one registerCommand call in the shipped extension");
});

test("ack seam fails closed on malformed branch and on no active track (tui mode)", () => {
  // Unhealthy projection: a malformed active-branch entry must block the ack seam
  // itself (not just the tool/consult seams), with no append.
  const badPi = fakePi();
  runTrack(badPi as never);
  const { ctx: badCtx } = fakeCtx(badPi, "tui", { hasUI: true });
  seedPausedTrack(badPi, badCtx);
  badPi.appendEntry(RUN_TRACK_ENTRY_TYPE, { kind: "evidence.recorded", bogus: true });
  const beforeBad = badPi.entries.length;
  const malformed = acknowledgeGuardrailOccurrence(badPi, badCtx, { action: "claim.complete" });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.appended, false);
  assert.match(malformed.error ?? "", /malformed/i);
  assert.equal(badPi.entries.length, beforeBad, "no append on unhealthy branch");

  // No active track: nothing to bind, refuse without append.
  const emptyPi = fakePi();
  runTrack(emptyPi as never);
  const { ctx: emptyCtx } = fakeCtx(emptyPi, "tui", { hasUI: true });
  const noTrack = acknowledgeGuardrailOccurrence(emptyPi, emptyCtx, { action: "claim.complete" });
  assert.equal(noTrack.ok, false);
  assert.equal(noTrack.appended, false);
  assert.match(noTrack.error ?? "", /no active run-track task/i);
  assert.equal(emptyPi.entries.length, 0);
});

test("mode gate: rpc/json/print/headless append nothing; tui appends one bound ack", () => {
  for (const mode of ["rpc", "json", "print", "headless", "unknown"] as const) {
    const pi = fakePi();
    runTrack(pi as never);
    const { ctx } = fakeCtx(pi, mode, { hasUI: mode === "rpc" }); // RPC has hasUI=true
    seedPausedTrack(pi, ctx);
    const before = pi.entries.length;

    const result = acknowledgeGuardrailOccurrence(pi, ctx, { action: "claim.complete" });
    assert.equal(result.ok, false, `mode=${mode} must reject`);
    assert.equal(result.appended, false);
    assert.equal(pi.entries.length, before, `mode=${mode} must not append`);
    assert.match(result.error ?? "", /tui/i);

    // Command path must also refuse.
    const cmdBefore = pi.entries.length;
    // Fire and forget — handler is async but work is sync underneath.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    void pi.commands[RUN_TRACK_ACK_COMMAND].handler("claim.complete", ctx);
    assert.equal(pi.entries.length, cmdBefore, `command mode=${mode} must not append`);
  }

  // Interactive TUI operator path succeeds.
  const pi = fakePi();
  runTrack(pi as never);
  const { ctx } = fakeCtx(pi, "tui", { hasUI: true });
  seedPausedTrack(pi, ctx);
  const occ = pi.entries.find((e) => e.data?.kind === "guardrail.occurred");
  assert.ok(occ);
  const before = pi.entries.length;
  const acked = acknowledgeGuardrailOccurrence(pi, ctx, { action: "claim.complete" });
  assert.equal(acked.ok, true);
  assert.equal(acked.appended, true);
  assert.equal(pi.entries.length, before + 1);
  const ackEntries = pi.entries.filter((e) => e.data?.kind === "guardrail.acknowledged");
  assert.equal(ackEntries.length, 1);
  assert.equal(ackEntries[0].data.origin, "operator-interactive");
  assert.equal(ackEntries[0].data.occurrenceId, occ.data.id);
  assert.equal(ackEntries[0].data.action, "claim.complete");
  assert.equal(ackEntries[0].data.policyVersion, RUN_TRACK_POLICY_VERSION);
  assert.equal(ackEntries[0].data.factsDigest, projectRunTrackContext(ctx).factsDigest);

  // After ack, consult yields degraded allow and preserves degraded in event+receipt.
  const allowed = consultEvidenceTransition(pi, ctx, {
    action: "claim.complete",
    requiredKeys: ["tests"],
  });
  assert.equal(allowed.plan.decision, "allow");
  assert.equal(allowed.plan.degraded, true);
  assert.equal(allowed.appendedKind, "task.transition-observed");
  assert.equal(allowed.receipt.degraded, true);
  assert.equal(isBoundedReceipt(allowed.receipt), true);
  const tr = pi.entries.find((e) => e.data?.kind === "task.transition-observed");
  assert.ok(tr);
  assert.equal(tr.data.degraded, true);
  assert.equal(tr.data.acknowledgmentId, acked.acknowledgmentId);
  assert.equal(projectRunTrackContext(ctx).transitions[0]?.degraded, true);
});

test("mode gate: hasUI=true alone (rpc) cannot acknowledge", () => {
  const pi = fakePi();
  runTrack(pi as never);
  const { ctx } = fakeCtx(pi, "rpc", { hasUI: true });
  seedPausedTrack(pi, ctx);
  const before = pi.entries.length;
  const result = acknowledgeGuardrailOccurrence(pi, ctx, { action: "claim.complete" });
  assert.equal(result.ok, false);
  assert.equal(result.appended, false);
  assert.equal(pi.entries.length, before);
  assert.equal(
    pi.entries.filter((e) => e.data?.kind === "guardrail.acknowledged").length,
    0,
  );
});

test("stale-facts acknowledgment is refused (binds current digest only)", () => {
  const pi = fakePi();
  runTrack(pi as never);
  const { ctx } = fakeCtx(pi, "tui", { hasUI: true });
  seedPausedTrack(pi, ctx);

  // Change facts after the pause occurrence → prior occurrence digest is stale.
  const changed = recordSelfAttestedEvidence(pi, ctx, {
    key: "review",
    resolution: "resolved",
    fingerprint: FP_B,
  });
  assert.equal(changed.ok, true);

  const before = pi.entries.length;
  const stale = acknowledgeGuardrailOccurrence(pi, ctx, { action: "claim.complete" });
  assert.equal(stale.ok, false);
  assert.equal(stale.appended, false);
  assert.equal(pi.entries.length, before);
  assert.match(stale.error ?? "", /no matching|facts/i);

  // Fresh pause on the new digest can be acknowledged.
  const pausedAgain = consultEvidenceTransition(pi, ctx, {
    action: "claim.complete",
    requiredKeys: ["tests"],
  });
  assert.equal(pausedAgain.plan.decision, "pause");
  assert.equal(pausedAgain.appendedKind, "guardrail.occurred");

  const acked = acknowledgeGuardrailOccurrence(pi, ctx, { action: "claim.complete" });
  assert.equal(acked.ok, true);
  assert.equal(acked.appended, true);
  const ack = pi.entries.filter((e) => e.data?.kind === "guardrail.acknowledged").at(-1);
  assert.ok(ack);
  assert.equal(ack.data.factsDigest, projectRunTrackContext(ctx).factsDigest);
});

test("nonexistent / mismatched occurrence fails closed without append", () => {
  const pi = fakePi();
  runTrack(pi as never);
  const { ctx } = fakeCtx(pi, "tui", { hasUI: true });
  seedPausedTrack(pi, ctx);
  const before = pi.entries.length;

  const missing = acknowledgeGuardrailOccurrence(pi, ctx, {
    action: "claim.complete",
    occurrenceId: "occ-does-not-exist",
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.appended, false);
  assert.equal(pi.entries.length, before);

  const wrongAction = acknowledgeGuardrailOccurrence(pi, ctx, {
    action: "claim.other",
  });
  assert.equal(wrongAction.ok, false);
  assert.equal(wrongAction.appended, false);
  assert.equal(pi.entries.length, before);
});

test("command handler in tui appends exactly one acknowledgment; crafted origin ignored", async () => {
  const pi = fakePi();
  runTrack(pi as never);
  const { ctx, notifications } = fakeCtx(pi, "tui", { hasUI: true });
  seedPausedTrack(pi, ctx);
  const occ = pi.entries.find((e) => e.data?.kind === "guardrail.occurred");
  assert.ok(occ);

  await pi.commands[RUN_TRACK_ACK_COMMAND].handler("claim.complete", ctx);
  const acks = pi.entries.filter((e) => e.data?.kind === "guardrail.acknowledged");
  assert.equal(acks.length, 1);
  assert.equal(acks[0].data.origin, "operator-interactive");
  assert.equal(acks[0].data.occurrenceId, occ.data.id);
  assert.ok(notifications.some((n) => /acknowledged/i.test(n.message)));

  // Direct seam ignores any elevated fields on the input object (structural build).
  const pi2 = fakePi();
  runTrack(pi2 as never);
  const { ctx: ctx2 } = fakeCtx(pi2, "tui", { hasUI: true, sessionId: "s2" });
  seedPausedTrack(pi2, ctx2);
  const forged = acknowledgeGuardrailOccurrence(pi2, ctx2, {
    action: "claim.complete",
    // @ts-expect-error intentional forged fields
    origin: "model-tool",
    trust: "operator-observed",
    factsDigest: "rt-eval-v1:" + "f".repeat(64),
  });
  assert.equal(forged.ok, true);
  const ack2 = pi2.entries.find((e) => e.data?.kind === "guardrail.acknowledged");
  assert.ok(ack2);
  assert.equal(ack2.data.origin, "operator-interactive");
  assert.equal(ack2.data.factsDigest, projectRunTrackContext(ctx2).factsDigest);
});

test("shipped extension surface has no test-only mode-bypass export", () => {
  const source = readFileSync(join(process.cwd(), "extensions/run-track.ts"), "utf8");
  assert.equal(source.includes("/tmp/run-track-v1-prototype"), false);
  assert.equal(/bypassMode|testOnly|__test__|skipModeGate/i.test(source), false);
  // Acknowledgment remains a command path, not a registerTool name.
  assert.match(source, new RegExp(RUN_TRACK_ACK_COMMAND));
  assert.equal(source.includes(`name: \"${RUN_TRACK_ACK_COMMAND}\"`), false);
  assert.equal(source.includes(`name: '${RUN_TRACK_ACK_COMMAND}'`), false);
});

// ===========================================================================
// Real isolated Pi SessionManager integration (skip if SDK unresolved)
// ===========================================================================

test("sdk integration: persisted resume projection is identical after reopen", async (t) => {
  const sdk = await loadPiSdk();
  if (!sdk) {
    t.skip("Pi SDK not resolvable — set PI_CODING_AGENT_ROOT or install @earendil-works/pi-coding-agent");
    return;
  }
  const { cwd, sessionDir, cleanup } = tempPair("resume");
  try {
    const sm = sdk.SessionManager.create(cwd, sessionDir);
    seedFlushableSession(sm);
    const pi = appendPiFor(sm);
    const ctx = ctxFor(sm, "headless");

    ensureRunTrackStarted(pi, ctx, { taskRef: "task/resume", trackId: "track-resume" });
    recordSelfAttestedEvidence(pi, ctx, {
      key: "tests",
      resolution: "resolved",
      fingerprint: FP_A,
    });
    const paused = consultEvidenceTransition(pi, ctx, {
      action: "claim.complete",
      requiredKeys: ["tests"],
    });
    assert.equal(paused.plan.decision, "pause");
    assert.equal(paused.appendedKind, "guardrail.occurred");

    const before = projectRunTrackContext(ctx);
    assert.equal(before.healthy, true);
    assert.ok(before.factsDigest);
    assert.equal(before.eventCount, 3);

    const sessionFile = sm.getSessionFile();
    assert.ok(sessionFile && existsSync(sessionFile), "session file must be flushed");

    const reopened = sdk.SessionManager.open(sessionFile!);
    const ctx2 = ctxFor(reopened, "headless");
    const after = projectRunTrackContext(ctx2);

    assert.equal(after.healthy, before.healthy);
    assert.equal(after.trackId, before.trackId);
    assert.equal(after.sessionId, before.sessionId);
    assert.equal(after.taskRef, before.taskRef);
    assert.equal(after.factsDigest, before.factsDigest);
    assert.equal(after.eventCount, before.eventCount);
    assert.deepEqual(Object.keys(after.evidenceByKey).sort(), Object.keys(before.evidenceByKey).sort());
    assert.equal(after.occurrences.length, before.occurrences.length);
    assert.equal(after.transitions.length, 0);
    // Zero transition-observed on pause.
    assert.equal(
      customRunTrackData(reopened.getBranch()).filter((d) => d?.kind === "task.transition-observed").length,
      0,
    );
    assert.equal(isBoundedReceipt(createRunTrackReceipt(after, paused.plan)), true);
  } finally {
    cleanup();
  }
});

test("sdk integration: active-tree sibling isolation (no factsDigest contamination)", async (t) => {
  const sdk = await loadPiSdk();
  if (!sdk) {
    t.skip("Pi SDK not resolvable — set PI_CODING_AGENT_ROOT or install @earendil-works/pi-coding-agent");
    return;
  }
  const { cwd, sessionDir, cleanup } = tempPair("sibling");
  try {
    const sm = sdk.SessionManager.create(cwd, sessionDir);
    seedFlushableSession(sm);
    const pi = appendPiFor(sm);
    const ctx = ctxFor(sm, "headless");

    ensureRunTrackStarted(pi, ctx, { taskRef: "task/sibling", trackId: "track-sibling" });
    // Common ancestor evidence.
    recordSelfAttestedEvidence(pi, ctx, {
      key: "tests",
      resolution: "resolved",
      fingerprint: FP_A,
    });
    const ancestorLeaf = sm.getLeafId();
    assert.ok(ancestorLeaf);

    // Branch A: add review evidence with FP_B
    recordSelfAttestedEvidence(pi, ctx, {
      key: "review",
      resolution: "resolved",
      fingerprint: FP_B,
    });
    const projA = projectRunTrackContext(ctx);
    assert.ok(projA.evidenceByKey.review);
    const digestA = projA.factsDigest;
    const leafA = sm.getLeafId();
    assert.ok(leafA);
    assert.ok(digestA);

    // Branch B from common ancestor (before review).
    sm.branch(ancestorLeaf!);
    // On sibling path, record different review fingerprint.
    recordSelfAttestedEvidence(pi, ctx, {
      key: "review",
      resolution: "resolved",
      fingerprint: "c".repeat(64),
    });
    const projB = projectRunTrackContext(ctx);
    const digestB = projB.factsDigest;
    assert.ok(digestB);
    assert.notEqual(digestA, digestB, "sibling branches must not share factsDigest");
    assert.equal(projB.evidenceByKey.review?.fingerprint, "c".repeat(64));
    assert.equal(projA.evidenceByKey.review?.fingerprint, FP_B);

    // Switch back to A — projection must restore A's facts, not B's.
    sm.branch(leafA!);
    const projA2 = projectRunTrackContext(ctx);
    assert.equal(projA2.factsDigest, digestA);
    assert.equal(projA2.evidenceByKey.review?.fingerprint, FP_B);
    assert.equal(
      customRunTrackData(sm.getBranch()).some((d) => d?.fingerprint === "c".repeat(64)),
      false,
      "branch A must not see sibling B events",
    );
  } finally {
    cleanup();
  }
});

test("sdk integration: clone/fork lineage via deriveRunTrackFork (idempotent, no caller parent authority)", async (t) => {
  const sdk = await loadPiSdk();
  if (!sdk) {
    t.skip("Pi SDK not resolvable — set PI_CODING_AGENT_ROOT or install @earendil-works/pi-coding-agent");
    return;
  }
  const { cwd, sessionDir, cleanup } = tempPair("fork");
  const child = tempPair("fork-child");
  try {
    const sm = sdk.SessionManager.create(cwd, sessionDir);
    seedFlushableSession(sm);
    const pi = appendPiFor(sm);
    const ctx = ctxFor(sm, "headless");

    ensureRunTrackStarted(pi, ctx, {
      taskRef: "task/fork",
      trackId: "track-fork-parent",
      sessionId: sm.getSessionId(),
    });
    recordSelfAttestedEvidence(pi, ctx, {
      key: "tests",
      resolution: "resolved",
      fingerprint: FP_A,
    });
    const parentProj = projectRunTrackContext(ctx);
    assert.equal(parentProj.healthy, true);
    assert.equal(parentProj.trackId, "track-fork-parent");
    assert.equal(parentProj.sessionId, sm.getSessionId());

    const sessionFile = sm.getSessionFile();
    assert.ok(sessionFile && existsSync(sessionFile));

    const forked = sdk.SessionManager.forkFrom(sessionFile!, child.cwd, child.sessionDir);
    assert.notEqual(forked.getSessionId(), sm.getSessionId());

    // Lineage is derived from inherited parent projection + runtime child session id.
    const first = deriveRunTrackFork({ parent: parentProj, childSessionId: forked.getSessionId() });
    const second = deriveRunTrackFork({ parent: parentProj, childSessionId: forked.getSessionId() });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.deepEqual(first.value, second.value, "deriveRunTrackFork must be idempotent");
    assert.equal(first.value.parentTrackId, parentProj.trackId);
    assert.equal(first.value.parentSessionId, parentProj.sessionId);
    assert.equal(first.value.rootTrackId, parentProj.trackId);
    assert.match(first.value.childTrackId, /^fork:[0-9a-f]{32}$/);

    // Caller cannot inject parent authority — only parent projection fields matter.
    const injected = deriveRunTrackFork({
      parent: parentProj,
      childSessionId: forked.getSessionId(),
      parentTrackId: "forged-parent",
      parentSessionId: "forged-session",
      rootTrackId: "forged-root",
      childTrackId: "forged-child",
    } as any);
    assert.equal(injected.ok, true);
    if (injected.ok) {
      assert.deepEqual(injected.value, first.value);
      assert.notEqual(injected.value.parentTrackId, "forged-parent");
      assert.notEqual(injected.value.childTrackId, "forged-child");
    }

    // Child session inherits custom entries from parent path (forkFrom full history).
    const childData = customRunTrackData(forked.getBranch());
    assert.ok(childData.some((d) => d?.kind === "task.started"));
    assert.ok(childData.some((d) => d?.kind === "evidence.recorded"));

    // Starting a child track with derived lineage (via validated event) is possible
    // by appending a new task.started — parent authority still comes from derivation.
    const childStarted = {
      v: RUN_TRACK_VERSION,
      ns: RUN_TRACK_NAMESPACE,
      kind: "task.started",
      id: "evt-child-start",
      ts: "2026-08-04T12:00:00.000Z",
      trackId: first.value.childTrackId,
      sessionId: forked.getSessionId(),
      taskRef: "task/fork-child",
      lineage: first.value,
    };
    forked.appendCustomEntry(RUN_TRACK_ENTRY_TYPE, childStarted);
    // Note: multiple task.started — projection uses first; for fork child sessions
    // the inherited parent started is on the branch. Validate derivation material only here.
    const otherChild = deriveRunTrackFork({ parent: parentProj, childSessionId: "other-session-id" });
    assert.equal(otherChild.ok, true);
    if (otherChild.ok) {
      assert.notEqual(otherChild.value.childTrackId, first.value.childTrackId);
    }
  } finally {
    cleanup();
    child.cleanup();
  }
});

test("sdk integration: zero transition on pause/block; malformed newest+older fail closed; compact receipts", async (t) => {
  const sdk = await loadPiSdk();
  if (!sdk) {
    t.skip("Pi SDK not resolvable — set PI_CODING_AGENT_ROOT or install @earendil-works/pi-coding-agent");
    return;
  }
  const { cwd, sessionDir, cleanup } = tempPair("failclosed");
  try {
    // --- pause/block: zero task.transition-observed
    const sm = sdk.SessionManager.inMemory(cwd);
    const pi = appendPiFor(sm);
    const ctx = ctxFor(sm, "headless");

    ensureRunTrackStarted(pi, ctx, { taskRef: "task/fc", trackId: "track-fc" });
    const blocked = consultEvidenceTransition(pi, ctx, {
      action: "claim.complete",
      requiredKeys: ["tests"],
    });
    assert.equal(blocked.plan.decision, "block");
    assert.equal(blocked.appendedKind, "guardrail.occurred");
    assert.equal(isBoundedReceipt(blocked.receipt), true);

    recordSelfAttestedEvidence(pi, ctx, {
      key: "tests",
      resolution: "resolved",
      fingerprint: FP_A,
    });
    const paused = consultEvidenceTransition(pi, ctx, {
      action: "claim.complete",
      requiredKeys: ["tests"],
    });
    assert.equal(paused.plan.decision, "pause");
    assert.equal(paused.appendedKind, "guardrail.occurred");
    assert.equal(isBoundedReceipt(paused.receipt), true);

    const kinds = customRunTrackData(sm.getBranch()).map((d) => d?.kind);
    assert.equal(kinds.filter((k) => k === "task.transition-observed").length, 0);
    assert.ok(kinds.includes("guardrail.occurred"));

    // --- malformed NEWEST fails closed
    const smNew = sdk.SessionManager.inMemory(cwd + "-new");
    const piNew = appendPiFor(smNew);
    const ctxNew = ctxFor(smNew, "headless");
    ensureRunTrackStarted(piNew, ctxNew, { taskRef: "task/new", trackId: "track-new" });
    smNew.appendCustomEntry(RUN_TRACK_ENTRY_TYPE, {
      v: 1,
      ns: RUN_TRACK_NAMESPACE,
      kind: "evidence.recorded",
      totally: "broken-newest",
    });
    const projNew = projectRunTrackContext(ctxNew);
    assert.equal(projNew.healthy, false);
    assert.ok(projNew.malformedCount >= 1);
    const planNew = planEvidenceTransition(projNew, { action: "claim.complete", requiredKeys: ["tests"] });
    assert.equal(planNew.decision, "block");
    assert.match(planNew.reason, /malformed/i);
    const consultedNew = consultEvidenceTransition(piNew, ctxNew, {
      action: "claim.complete",
      requiredKeys: ["tests"],
    });
    assert.equal(consultedNew.plan.decision, "block");
    assert.equal(
      customRunTrackData(smNew.getBranch()).filter((d) => d?.kind === "task.transition-observed").length,
      0,
    );
    // Malformed entry not skipped/repaired.
    assert.ok(customRunTrackData(smNew.getBranch()).some((d) => d?.totally === "broken-newest"));
    assert.equal(isBoundedReceipt(consultedNew.receipt), true);

    // --- malformed OLDER fails closed (not skipped)
    const smOld = sdk.SessionManager.inMemory(cwd + "-old");
    const piOld = appendPiFor(smOld);
    const ctxOld = ctxFor(smOld, "headless");
    smOld.appendCustomEntry(RUN_TRACK_ENTRY_TYPE, {
      v: 1,
      ns: RUN_TRACK_NAMESPACE,
      kind: "task.started",
      totally: "broken-older",
    });
    smOld.appendCustomEntry(RUN_TRACK_ENTRY_TYPE, {
      v: RUN_TRACK_VERSION,
      ns: RUN_TRACK_NAMESPACE,
      kind: "task.started",
      id: "evt-later-ok",
      ts: "2026-08-04T12:00:00.000Z",
      trackId: "track-old",
      sessionId: "session-old",
      taskRef: "task/old",
      lineage: null,
    });
    const projOld = projectRunTrackContext(ctxOld);
    assert.equal(projOld.healthy, false);
    assert.ok(projOld.malformedCount >= 1);
    const planOld = planEvidenceTransition(projOld, { action: "claim.complete", requiredKeys: ["tests"] });
    assert.equal(planOld.decision, "block");
    assert.match(planOld.reason, /malformed/i);
    // Older malformed still present.
    assert.ok(customRunTrackData(smOld.getBranch()).some((d) => d?.totally === "broken-older"));
    assert.equal(isBoundedReceipt(createRunTrackReceipt(projOld, planOld)), true);

    // extract helper stays branch-driven
    assert.deepEqual(
      extractRunTrackEventData(smOld.getBranch()),
      customRunTrackData(smOld.getBranch()),
    );
    // getEntries must not be required for projection (sanity on real manager).
    assert.ok(Array.isArray(smOld.getEntries()));
    assert.ok(smOld.getEntries().length >= smOld.getBranch().length);
  } finally {
    cleanup();
  }
});

test("sdk integration: tui ack on real SessionManager yields degraded allow", async (t) => {
  const sdk = await loadPiSdk();
  if (!sdk) {
    t.skip("Pi SDK not resolvable — set PI_CODING_AGENT_ROOT or install @earendil-works/pi-coding-agent");
    return;
  }
  const { cwd, sessionDir, cleanup } = tempPair("ack-sm");
  try {
    const sm = sdk.SessionManager.create(cwd, sessionDir);
    seedFlushableSession(sm);
    const pi = appendPiFor(sm);

    // Non-tui cannot ack even with real manager.
    const rpcCtx = ctxFor(sm, "rpc", { hasUI: true });
    ensureRunTrackStarted(pi, rpcCtx, { taskRef: "task/ack-sm", trackId: "track-ack-sm" });
    recordSelfAttestedEvidence(pi, rpcCtx, {
      key: "tests",
      resolution: "resolved",
      fingerprint: FP_A,
    });
    consultEvidenceTransition(pi, rpcCtx, { action: "claim.complete", requiredKeys: ["tests"] });
    const rpcAck = acknowledgeGuardrailOccurrence(pi, rpcCtx, { action: "claim.complete" });
    assert.equal(rpcAck.ok, false);
    assert.equal(rpcAck.appended, false);

    // TUI operator succeeds.
    const tuiCtx = ctxFor(sm, "tui", { hasUI: true });
    const acked = acknowledgeGuardrailOccurrence(pi, tuiCtx, { action: "claim.complete" });
    assert.equal(acked.ok, true);
    assert.equal(acked.appended, true);

    const allowed = consultEvidenceTransition(pi, tuiCtx, {
      action: "claim.complete",
      requiredKeys: ["tests"],
    });
    assert.equal(allowed.plan.decision, "allow");
    assert.equal(allowed.plan.degraded, true);
    assert.equal(allowed.receipt.degraded, true);
    assert.equal(isBoundedReceipt(allowed.receipt), true);
    const proj = projectRunTrackContext(tuiCtx);
    assert.equal(proj.transitions.length, 1);
    assert.equal(proj.transitions[0]?.degraded, true);
    assert.equal(proj.acknowledgments[0]?.origin, "operator-interactive");

    // Persisted resume still shows degraded transition.
    const file = sm.getSessionFile();
    assert.ok(file && existsSync(file));
    const reopened = sdk.SessionManager.open(file!);
    const resumed = projectRunTrackBranch(extractRunTrackEventData(reopened.getBranch()));
    assert.equal(resumed.healthy, true);
    assert.equal(resumed.transitions[0]?.degraded, true);
    assert.equal(resumed.acknowledgments.length, 1);
  } finally {
    cleanup();
  }
});
