/**
 * Extension tests for `extensions/session-gc.ts`, mirroring
 * `tests/autocompact-extension.test.ts`'s patterns: a fake `pi` +
 * fake/stale `ExtensionContext`, teardown-safety assertions, and a private
 * scratch cwd per test so settings persistence never leaks.
 *
 * Real fixtures live under a fresh scratch cwd (`.pi-subagents/artifacts`)
 * for the project-artifacts area. The subagent-temp area's real root
 * (`<tmpdir>/pi-subagents-uid-<uid>`) is live, shared, host-wide state used
 * by concurrently running subagent orchestration — tests must never scan or
 * delete inside it, so every subagent-temp test points
 * `SUBAGENT_TEMP_ROOT_OVERRIDE_ENV` at a private sandboxed directory instead.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  SUBAGENT_TEMP_ROOT_OVERRIDE_ENV,
  executeGcPlan,
  formatStatusText,
  gatherGcAreas,
  parseGcCommand,
} from "../extensions/session-gc.ts";
import sessionGc from "../extensions/session-gc.ts";
import { STALE_CTX_MARKER } from "../lib/autocompact-core.ts";
import type { GcAreaInput, GcPlan } from "../lib/gc-core.ts";

// The subagent-temp area's real root is live, shared, host-wide state used by
// concurrently running subagent orchestration. Disable it by default for every
// test in this file (point the override at a sandbox path that is never
// created, so `directoryExists` reports it missing and the area is skipped);
// only `withSandboxedSubagentTempRoot` re-points it, to a private mkdtemp
// directory, for the duration of a single test.
process.env[SUBAGENT_TEMP_ROOT_OVERRIDE_ENV] = join(tmpdir(), "session-gc-tests-disabled-subagent-temp-root");

function freshScratchCwd(): Promise<string> {
  return mktempWithPiDir();
}

async function mktempWithPiDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "session-gc-extension-test-"));
  await mkdir(join(dir, ".pi"), { recursive: true });
  return dir;
}

async function touchOld(path: string, ageDays: number): Promise<void> {
  const mtime = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  await utimes(path, mtime, mtime);
}

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

function makeFakePi() {
  const handlers: Record<string, Handler[]> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<unknown> }> = {};
  const pi = {
    on(event: string, handler: Handler) {
      (handlers[event] ??= []).push(handler);
    },
    registerCommand(name: string, def: { handler: (args: string, ctx: unknown) => Promise<unknown> }) {
      commands[name] = def;
    },
  };
  return { pi, handlers, commands };
}

function liveCtx(cwd: string, overrides: Record<string, unknown> = {}) {
  return {
    ui: { notify: () => {} },
    cwd,
    sessionManager: { getSessionFile: () => undefined },
    ...overrides,
  };
}

function notifyingCtx(cwd: string, notes: string[], overrides: Record<string, unknown> = {}) {
  return liveCtx(cwd, { ui: { notify: (message: string) => notes.push(message) }, ...overrides });
}

function staleCtx() {
  const throwStale = (): never => {
    throw new Error(`${STALE_CTX_MARKER}. Do not use a captured pi or command ctx after ctx.fork().`);
  };
  return {
    get ui() {
      return throwStale();
    },
    get cwd() {
      return throwStale();
    },
    get sessionManager() {
      return throwStale();
    },
  };
}

/** A private sandboxed stand-in for the real, shared subagent-temp root. */
async function withSandboxedSubagentTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "session-gc-subagent-temp-"));
  const previous = process.env[SUBAGENT_TEMP_ROOT_OVERRIDE_ENV];
  process.env[SUBAGENT_TEMP_ROOT_OVERRIDE_ENV] = root;
  try {
    return await fn(root);
  } finally {
    if (previous === undefined) delete process.env[SUBAGENT_TEMP_ROOT_OVERRIDE_ENV];
    else process.env[SUBAGENT_TEMP_ROOT_OVERRIDE_ENV] = previous;
    await rm(root, { recursive: true, force: true });
  }
}

test("dry-run lists an old artifact dir and protects a fresh one (backdated mtimes)", async () => {
  const { pi, handlers, commands } = makeFakePi();
  sessionGc(pi as never);

  const cwd = await freshScratchCwd();
  const artifactsDir = join(cwd, ".pi-subagents", "artifacts");
  const oldDir = join(artifactsDir, "old-run");
  const freshDir = join(artifactsDir, "fresh-run");
  await mkdir(join(oldDir, "logs"), { recursive: true });
  await writeFile(join(oldDir, "logs", "out.txt"), "x".repeat(500));
  await touchOld(oldDir, 30); // default artifactsDays = 7
  await mkdir(freshDir, { recursive: true }); // left at current mtime: fresh

  const ctx = liveCtx(cwd);
  for (const handler of handlers.session_start) await handler({}, ctx);

  const notes: string[] = [];
  await commands.gc.handler("dry-run", notifyingCtx(cwd, notes));
  const text = notes.join("\n");
  assert.match(text, new RegExp(oldDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(text, new RegExp(freshDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("run deletes exactly the plan candidates, reports reclaimed bytes, and leaves protected paths on disk", async () => {
  const { pi, handlers, commands } = makeFakePi();
  sessionGc(pi as never);

  const cwd = await freshScratchCwd();
  const artifactsDir = join(cwd, ".pi-subagents", "artifacts");
  const oldDir = join(artifactsDir, "old-run");
  const freshDir = join(artifactsDir, "fresh-run");
  await mkdir(oldDir, { recursive: true });
  await writeFile(join(oldDir, "out.txt"), "x".repeat(1234));
  await touchOld(oldDir, 30);
  await mkdir(freshDir, { recursive: true });

  const ctx = liveCtx(cwd);
  for (const handler of handlers.session_start) await handler({}, ctx);

  const notes: string[] = [];
  await commands.gc.handler("run", notifyingCtx(cwd, notes));
  const text = notes.join("\n");
  assert.match(text, /reclaimed \d+ bytes/);
  assert.match(text, /Total reclaimed: 1234 bytes/);
  assert.equal(existsSync(oldDir), false, "old candidate must be deleted");
  assert.equal(existsSync(freshDir), true, "protected fresh dir must survive");
});

test("an active (non-terminal status.json) run dir survives a run sweep; terminal+old is swept", async () => {
  await withSandboxedSubagentTempRoot(async (root) => {
    const runsDir = join(root, "async-subagent-runs");
    const activeDir = join(runsDir, "run-active");
    const terminalDir = join(runsDir, "run-terminal");
    await mkdir(activeDir, { recursive: true });
    await writeFile(join(activeDir, "status.json"), JSON.stringify({ state: "running" }));
    await mkdir(terminalDir, { recursive: true });
    await writeFile(join(terminalDir, "status.json"), JSON.stringify({ state: "completed" }));
    await touchOld(activeDir, 30);
    await touchOld(terminalDir, 30);

    const { pi, handlers, commands } = makeFakePi();
    sessionGc(pi as never);
    const cwd = await freshScratchCwd();
    const ctx = liveCtx(cwd);
    for (const handler of handlers.session_start) await handler({}, ctx);

    const notes: string[] = [];
    await commands.gc.handler("run", notifyingCtx(cwd, notes));

    assert.equal(existsSync(activeDir), true, "active run dir must survive the sweep");
    assert.equal(existsSync(terminalDir), false, "terminal + old run dir must be swept");
  });
});

test("auto sweep is off by default; enabled with a stale timestamp it sweeps once, persists the timestamp, and a same-day second session start does not sweep again", async () => {
  const { pi, handlers, commands } = makeFakePi();
  sessionGc(pi as never);

  const cwd = await freshScratchCwd();
  const artifactsDir = join(cwd, ".pi-subagents", "artifacts");
  const firstOld = join(artifactsDir, "first-old");
  await mkdir(firstOld, { recursive: true });
  await writeFile(join(firstOld, "f.txt"), "x".repeat(10));
  await touchOld(firstOld, 30);

  const ctx = liveCtx(cwd);

  // Auto is off by default: a session_start must not sweep.
  for (const handler of handlers.session_start) await handler({}, ctx);
  assert.equal(existsSync(firstOld), true, "auto off by default: no sweep");

  // Enable auto, then force a stale (2-day-old) last-sweep timestamp so the
  // next session_start is due for a sweep.
  await commands.gc.handler("auto on", ctx);
  await writeFile(
    join(cwd, ".pi", "session-gc.json"),
    JSON.stringify({ sessionsDays: 30, artifactsDays: 7, auto: true, lastSweepMs: Date.now() - 2 * 24 * 60 * 60 * 1000 }),
  );

  for (const handler of handlers.session_start) await handler({}, ctx);
  assert.equal(existsSync(firstOld), false, "stale timestamp: sweep runs once and deletes the old candidate");

  // A second old candidate appears; a same-day second session_start must not sweep it (throttled to once/day).
  const secondOld = join(artifactsDir, "second-old");
  await mkdir(secondOld, { recursive: true });
  await touchOld(secondOld, 30);

  for (const handler of handlers.session_start) await handler({}, ctx);
  assert.equal(existsSync(secondOld), true, "same-day second session_start must not sweep again");
});

test("a forged plan entry whose path is outside the resolved root is refused at delete time", async () => {
  const cwd = await freshScratchCwd();
  const root = join(cwd, ".pi-subagents", "artifacts");
  const outsideFile = join(cwd, "outside-root.txt");
  await mkdir(root, { recursive: true });
  await writeFile(outsideFile, "should not be deleted");

  const plan: GcPlan = {
    areas: [
      {
        kind: "project-artifacts",
        root,
        candidates: [{ path: outsideFile, ageDays: 999, sizeBytes: 100 }],
        protectedCount: 0,
        reclaimBytes: 100,
      },
    ],
    totalReclaimBytes: 100,
  };

  const report = await executeGcPlan(plan);
  assert.match(report, /refused/);
  assert.equal(existsSync(outsideFile), true, "a forged out-of-root candidate must never be deleted");
});

test("missing directories: gatherGcAreas returns an empty area list without throwing", async () => {
  const cwd = await freshScratchCwd(); // no .pi-subagents/artifacts, no sessions store
  const areas = await gatherGcAreas(cwd);
  assert.ok(Array.isArray(areas));
  for (const area of areas) assert.notEqual(area.kind, "project-artifacts");
  assert.doesNotThrow(() => formatStatusText(areas));
});

test("session_start and /gc command handlers no-op on a stale ctx without throwing or unhandled rejection", async () => {
  const { pi, handlers, commands } = makeFakePi();
  sessionGc(pi as never);

  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  try {
    const ctx = staleCtx();
    for (const handler of handlers.session_start) await handler({}, ctx);
    await commands.gc.handler("status", ctx);
    await commands.gc.handler("dry-run", ctx);
    await commands.gc.handler("run", ctx);
    await commands.gc.handler("auto on", ctx);
    await commands.gc.handler("days 10 3", ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(rejections.length, 0, `expected no unhandled rejections, got: ${String(rejections[0])}`);
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

test("throwing host/settings access never throws out of the extension: missing agent dir and unreadable settings", async () => {
  const { pi, handlers, commands } = makeFakePi();
  sessionGc(pi as never);

  const cwd = await mkdtemp(join(tmpdir(), "session-gc-no-pi-dir-"));
  // No `.pi/` directory here: persistSettings falls back to the global path,
  // and there is no settings file to read — both must no-op safely.
  const ctx = liveCtx(cwd);
  for (const handler of handlers.session_start) await handler({}, ctx);
  await assert.doesNotReject(commands.gc.handler("status", ctx));
  await assert.doesNotReject(commands.gc.handler("auto off", ctx));
});

test("parseGcCommand covers all subcommand forms including errors and unknown -> help", () => {
  assert.deepEqual(parseGcCommand(""), { kind: "status" });
  assert.deepEqual(parseGcCommand("status"), { kind: "status" });
  assert.deepEqual(parseGcCommand("dry-run"), { kind: "dry-run" });
  assert.deepEqual(parseGcCommand("run"), { kind: "run" });
  assert.deepEqual(parseGcCommand("help"), { kind: "help" });
  assert.deepEqual(parseGcCommand("auto on"), { kind: "auto", on: true });
  assert.deepEqual(parseGcCommand("auto off"), { kind: "auto", on: false });
  assert.equal(parseGcCommand("auto sideways").kind, "error");
  assert.deepEqual(parseGcCommand("days 10 3"), { kind: "days", sessionsDays: 10, artifactsDays: 3 });
  assert.equal(parseGcCommand("days abc 3").kind, "error");
  assert.equal(parseGcCommand("nonsense").kind, "help");
});

test("formatStatusText reports per-area child count and bytes over real fixture facts", async () => {
  const cwd = await freshScratchCwd();
  const artifactsDir = join(cwd, ".pi-subagents", "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(join(artifactsDir, "a.txt"), "12345");
  const areas: GcAreaInput[] = await gatherGcAreas(cwd);
  const text = formatStatusText(areas);
  assert.match(text, /project-artifacts/);
  assert.match(text, /1 item\(s\), 5 bytes/);
});

// --- Fix-round tests (review round deb44fc4: kill surviving mutations, pin symlink safety) ---

import { symlink, readFile as readFileP } from "node:fs/promises";
import { buildGcPlan } from "../lib/gc-core.ts";

const FIXROUND_POLICY = { nowMs: Date.now(), sessionsDays: 30, artifactsDays: 7 };

test("executeGcPlan with an empty plan reports the empty-plan short-circuit, not per-area lines", async () => {
  const cwd = await freshScratchCwd();
  const artifactsDir = join(cwd, ".pi-subagents", "artifacts");
  await mkdir(join(artifactsDir, "fresh-run"), { recursive: true });
  await writeFile(join(artifactsDir, "fresh-run", "log.txt"), "recent");
  const areas: GcAreaInput[] = await gatherGcAreas(cwd);
  const plan: GcPlan = buildGcPlan(areas, FIXROUND_POLICY);
  assert.equal(plan.totalReclaimBytes, 0);
  const report = await executeGcPlan(plan);
  assert.match(report, /nothing to reclaim \(plan is empty\)/);
  assert.doesNotMatch(report, /reclaimed \d+ bytes/);
  assert.ok(existsSync(join(artifactsDir, "fresh-run", "log.txt")));
});

test("an old subagent run dir with no status.json is protected (unknown, fail closed) and survives run", async () => {
  await withSandboxedSubagentTempRoot(async (root) => {
    const runsDir = join(root, "async-subagent-runs");
    const orphan = join(runsDir, "orphan-no-status");
    await mkdir(orphan, { recursive: true });
    await writeFile(join(orphan, "events.jsonl"), "{}");
    await touchOld(join(orphan, "events.jsonl"), 40);
    await touchOld(orphan, 40);
    const cwd = await freshScratchCwd();
    const areas = await gatherGcAreas(cwd);
    const plan = buildGcPlan(areas, FIXROUND_POLICY);
    const planned = plan.areas.flatMap((a) => a.candidates.map((c) => c.path));
    assert.ok(!planned.includes(orphan), "orphan run without status.json must never be a candidate");
    await executeGcPlan(plan);
    assert.ok(existsSync(orphan), "orphan run without status.json must survive a run sweep");
  });
});

test("deleting an old candidate dir unlinks internal symlinks without traversing into their targets", async () => {
  const victim = await mkdtemp(join(tmpdir(), "session-gc-symlink-victim-"));
  try {
    await writeFile(join(victim, "precious.txt"), "must survive");
    const cwd = await freshScratchCwd();
    const artifactsDir = join(cwd, ".pi-subagents", "artifacts");
    const oldRun = join(artifactsDir, "old-run-with-symlink");
    await mkdir(oldRun, { recursive: true });
    await writeFile(join(oldRun, "log.txt"), "old");
    await symlink(victim, join(oldRun, "escape-link"));
    await touchOld(join(oldRun, "log.txt"), 40);
    await touchOld(oldRun, 40);
    const areas = await gatherGcAreas(cwd);
    const plan = buildGcPlan(areas, FIXROUND_POLICY);
    const planned = plan.areas.flatMap((a) => a.candidates.map((c) => c.path));
    assert.ok(planned.includes(oldRun), "old artifact dir should be a candidate");
    const report = await executeGcPlan(plan);
    assert.match(report, /reclaimed \d+ bytes/);
    assert.ok(!existsSync(oldRun), "candidate dir should be removed");
    assert.equal(await readFileP(join(victim, "precious.txt"), "utf8"), "must survive");
  } finally {
    await rm(victim, { recursive: true, force: true });
  }
});
