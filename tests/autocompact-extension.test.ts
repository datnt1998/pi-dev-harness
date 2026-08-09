/**
 * Regression tests for the autocompact extension's teardown path.
 *
 * Every `ExtensionContext` getter/method calls the SDK's `assertActive`, which
 * THROWS once a session is replaced/forked/reloaded. `syncNativeReserve` is
 * async and awaits `directoryExists` before touching `ctx.getContextUsage()`;
 * a fork across that await used to throw, and because `turn_end` fired it
 * fire-and-forget (`void syncNativeReserve(ctx)`), the rejection was unhandled
 * and killed every forked subagent run with exit code 1 at teardown.
 *
 * The extension only uses `import type` from the SDK, so it imports cleanly
 * under `node --experimental-strip-types` and we can drive its real handlers
 * with a fake `pi` + a fake ctx whose getters throw the exact stale-ctx error.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import autocompact from "../extensions/autocompact.ts";
import { STALE_CTX_MARKER } from "../lib/autocompact-core.ts";

// Any command that changes settings persists to `<cwd>/.pi/` (project scope)
// or the real global `~/.pi/agent/autocompact.json` when no project `.pi/`
// exists. Tests must never touch the latter: give every live ctx its OWN
// private scratch cwd with a `.pi/` directory so persistence stays sandboxed
// and no settings leak between tests.
function freshScratchCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "autocompact-extension-test-"));
  mkdirSync(join(dir, ".pi"), { recursive: true });
  return dir;
}

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

function makeFakePi() {
  const handlers: Record<string, Handler[]> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<unknown> }> = {};
  const sentMessages: Array<{ text: string; opts?: unknown }> = [];
  const pi = {
    on(event: string, handler: Handler) {
      (handlers[event] ??= []).push(handler);
    },
    registerCommand(name: string, def: { handler: (args: string, ctx: unknown) => Promise<unknown> }) {
      commands[name] = def;
    },
    sendUserMessage(text: string, opts?: unknown) {
      sentMessages.push({ text, opts });
    },
  };
  return { pi, handlers, commands, sentMessages };
}

/** A ctx whose every getter/method throws the SDK's exact stale-ctx error. */
function staleCtx() {
  const throwStale = (): never => {
    throw new Error(`${STALE_CTX_MARKER}. Do not use a captured pi or command ctx after ctx.fork().`);
  };
  return {
    get ui() {
      return throwStale();
    },
    get mode() {
      return throwStale();
    },
    get hasUI() {
      return throwStale();
    },
    get cwd() {
      return throwStale();
    },
    get model() {
      return throwStale();
    },
    getContextUsage: throwStale,
    isIdle: throwStale,
    hasPendingMessages: throwStale,
    compact: throwStale,
    waitForIdle: throwStale,
    sessionManager: {
      getBranch: throwStale,
    },
  };
}

/** A live ctx (non-stale) whose branch grows as the caller mutates `entries`. */
function liveCtx(entries: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    ui: {
      notify: () => {},
      setStatus: () => {},
      setWidget: () => {},
      theme: { fg: (_role: string, text: string) => text },
    },
    mode: "tui",
    hasUI: true,
    cwd: freshScratchCwd(),
    model: { contextWindow: 200_000 },
    getContextUsage: () => ({ tokens: null, contextWindow: null }),
    isIdle: () => true,
    hasPendingMessages: () => false,
    compact: () => {},
    waitForIdle: async () => {},
    sessionManager: {
      getBranch: () => entries,
    },
    ...overrides,
  };
}

function skillMessageEntry(text: string) {
  return { type: "message", id: "u", parentId: null, timestamp: "t", message: { role: "user", content: text, timestamp: 0 } };
}

function effortToolCallEntry(path: string) {
  return {
    type: "message",
    id: "a",
    parentId: null,
    timestamp: "t",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "c", name: "read", arguments: { path } }],
      api: "messages",
      provider: "anthropic",
      model: "m",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "toolUse",
      timestamp: 0,
    },
  };
}

/** Flush pending microtasks + a timer tick so any stray rejection surfaces. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

test("turn_end + session_start no-op on a stale ctx without throwing or unhandled rejection", async () => {
  const { pi, handlers } = makeFakePi();
  autocompact(pi as never);
  assert.ok(handlers.turn_end?.length, "turn_end handler registered");
  assert.ok(handlers.session_start?.length, "session_start handler registered");

  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  try {
    const ctx = staleCtx();
    // turn_end is synchronous: it must not throw even though every ctx getter does.
    for (const handler of handlers.turn_end) handler({}, ctx);
    // session_start is async: it must resolve (silent no-op), not reject.
    for (const handler of handlers.session_start) await handler({}, ctx);
    // Let the fire-and-forget syncNativeReserve promise + microtasks settle.
    await flush();
    assert.equal(rejections.length, 0, `expected no unhandled rejections, got: ${String(rejections[0])}`);
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

test("session_shutdown and /autocompact handler no-op on a stale ctx without throwing", async () => {
  const { pi, handlers, commands } = makeFakePi();
  autocompact(pi as never);

  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  try {
    const ctx = staleCtx();
    for (const handler of handlers.session_shutdown) handler({}, ctx);
    // status reads ctx.getContextUsage(); a settings change would await persist+sync.
    await commands.autocompact.handler("status", ctx);
    await commands.autocompact.handler("at 80", ctx);
    await flush();
    assert.equal(rejections.length, 0, `expected no unhandled rejections, got: ${String(rejections[0])}`);
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

test("agent_settled + session_compact + session_before_compact no-op on a stale ctx", async () => {
  const { pi, handlers } = makeFakePi();
  autocompact(pi as never);

  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  try {
    const ctx = staleCtx();
    // agent_settled evaluates ctx.isIdle()/hasPendingMessages() as ARGUMENTS,
    // i.e. before evaluate()'s own guard runs.
    for (const handler of handlers.agent_settled) handler({}, ctx);
    for (const handler of handlers.session_compact) {
      handler({ reason: "manual", compactionEntry: { tokensBefore: 1000 } }, ctx);
    }
    for (const handler of handlers.session_before_compact) handler({ reason: "overflow" }, ctx);
    await flush();
    assert.equal(rejections.length, 0, `expected no unhandled rejections, got: ${String(rejections[0])}`);
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

test("compaction onError no-ops when the ctx went stale mid-compaction", async () => {
  const { pi, commands } = makeFakePi();
  autocompact(pi as never);

  // Pi runs onError inside a void-ed IIFE's catch block, so a throw there is a
  // DETACHED rejection -> exit code 1. Model the real timeline: the ctx is live
  // when compaction starts, and stale by the time compaction fails.
  let stale = false;
  const throwIfStale = () => {
    if (stale) throw new Error(`${STALE_CTX_MARKER}. Do not use a captured ctx after ctx.fork().`);
  };
  let captured: { onError?: (error: Error) => void } | undefined;
  const ctx = {
    get ui() {
      throwIfStale();
      return { notify: () => {} };
    },
    get mode() {
      throwIfStale();
      return "tui";
    },
    get hasUI() {
      throwIfStale();
      return true;
    },
    isIdle: () => {
      throwIfStale();
      return true;
    },
    getContextUsage: () => {
      throwIfStale();
      return { tokens: 1000, contextWindow: 200000 };
    },
    compact: (options: { onError?: (error: Error) => void }) => {
      throwIfStale();
      captured = options;
    },
  };

  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  try {
    await commands.autocompact.handler("now", ctx);
    assert.ok(captured?.onError, "compaction started and captured an onError callback");

    stale = true; // a fork lands while compaction is in flight
    assert.doesNotThrow(
      () => captured?.onError?.(new Error("compaction failed")),
      "onError must not throw on a stale ctx (it would be an unhandled rejection in Pi)",
    );
    await flush();
    assert.equal(rejections.length, 0, `expected no unhandled rejections, got: ${String(rejections[0])}`);
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

test("compaction onError still surfaces a NON-stale failure to the user", async () => {
  const { pi, commands } = makeFakePi();
  autocompact(pi as never);

  const notes: string[] = [];
  let captured: { onError?: (error: Error) => void } | undefined;
  const ctx = {
    ui: { notify: (message: string) => notes.push(message) },
    mode: "tui",
    hasUI: true,
    isIdle: () => true,
    getContextUsage: () => ({ tokens: 1000, contextWindow: 200000 }),
    compact: (options: { onError?: (error: Error) => void }) => {
      captured = options;
    },
  };

  await commands.autocompact.handler("now", ctx);
  captured?.onError?.(new Error("provider exploded"));
  assert.ok(
    notes.some((note) => note.includes("provider exploded")),
    `a genuine compaction failure must still be reported, got: ${JSON.stringify(notes)}`,
  );
});

test("turn_end still surfaces a NON-stale ctx error (no silent swallowing)", () => {
  const { pi, handlers } = makeFakePi();
  autocompact(pi as never);

  const ctx = {
    sessionManager: { getBranch: () => [] },
    getContextUsage(): never {
      throw new Error("boom: genuine getContextUsage failure");
    },
  };
  assert.throws(
    () => {
      for (const handler of handlers.turn_end) handler({}, ctx);
    },
    /genuine getContextUsage failure/,
    "a non-stale error must propagate, not be swallowed by the stale-ctx guard",
  );
});

// --- Compaction context recovery (R2/R3/R5 wiring) ---

test("session_start scans the branch, turn_end scans incrementally, session_compact sends exactly one re-orientation follow-up", async () => {
  const { pi, handlers, sentMessages } = makeFakePi();
  autocompact(pi as never);

  const entries: unknown[] = [];
  const ctx = liveCtx(entries);

  for (const handler of handlers.session_start) await handler({}, ctx);

  entries.push(skillMessageEntry("/skill:batch-implementation continue the work"));
  entries.push(effortToolCallEntry(".scratch/compaction-recovery/tickets.md"));
  for (const handler of handlers.turn_end) handler({}, ctx);

  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 5000 } }, ctx);
  }

  assert.equal(sentMessages.length, 1, "exactly one follow-up sent for the compaction event");
  assert.equal(sentMessages[0].opts && (sentMessages[0].opts as { deliverAs?: string }).deliverAs, "followUp");
  assert.match(sentMessages[0].text, /batch-implementation/);
  assert.match(sentMessages[0].text, /\.scratch\/compaction-recovery\//);
});

test("no follow-up is sent when no observations were made", async () => {
  const { pi, handlers, sentMessages } = makeFakePi();
  autocompact(pi as never);

  const entries: unknown[] = [];
  const ctx = liveCtx(entries);
  for (const handler of handlers.session_start) await handler({}, ctx);
  for (const handler of handlers.turn_end) handler({}, ctx); // nothing new to scan
  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 5000 } }, ctx);
  }

  assert.equal(sentMessages.length, 0, "no observations means no follow-up");
});

test("no follow-up is sent when reorient is off, even with observations", async () => {
  const { pi, handlers, commands, sentMessages } = makeFakePi();
  autocompact(pi as never);

  const entries: unknown[] = [];
  const ctx = liveCtx(entries);
  for (const handler of handlers.session_start) await handler({}, ctx);

  await commands.autocompact.handler("reorient off", ctx);

  entries.push(skillMessageEntry("/skill:batch-implementation continue"));
  entries.push(effortToolCallEntry(".scratch/compaction-recovery/tickets.md"));
  for (const handler of handlers.turn_end) handler({}, ctx);

  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 5000 } }, ctx);
  }

  assert.equal(sentMessages.length, 0, "reorient off suppresses the follow-up");
});

test("observations are WINDOWED per compaction: no re-announcement without new activity; stale skills age out", async () => {
  const { pi, handlers, sentMessages } = makeFakePi();
  autocompact(pi as never);

  const entries: unknown[] = [];
  const ctx = liveCtx(entries);
  for (const handler of handlers.session_start) await handler({}, ctx);

  entries.push(skillMessageEntry("/skill:batch-implementation continue"));
  for (const handler of handlers.turn_end) handler({}, ctx);
  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 5000 } }, ctx);
  }
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /batch-implementation/);

  // Second compaction with NO new activity: the window is empty, so no follow-up
  // re-announces a stale skill (token discipline: stale context ages out).
  for (const handler of handlers.turn_end) handler({}, ctx); // nothing new since cursor reset
  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 3000 } }, ctx);
  }
  assert.equal(sentMessages.length, 1, "no new activity means no second follow-up");

  // A skill used again (e.g. the agent's own lazy re-read) re-enters the window.
  entries.push(effortToolCallEntry("skills/batch-implementation/SKILL.md"));
  for (const handler of handlers.turn_end) handler({}, ctx);
  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 2000 } }, ctx);
  }
  assert.equal(sentMessages.length, 2, "renewed activity re-orients on the next compaction");
  assert.match(sentMessages[1].text, /batch-implementation/);
});

test("explicit `now <instructions>` forwards that exact text to ctx.compact — never the auto preserve block", async () => {
  const { pi, handlers, commands } = makeFakePi();
  autocompact(pi as never);

  const entries: unknown[] = [];
  let captured: { customInstructions?: string } | undefined;
  const ctx = liveCtx(entries, {
    compact: (options: { customInstructions?: string }) => {
      captured = options;
    },
  });
  for (const handler of handlers.session_start) await handler({}, ctx);

  // Observations exist, so the auto block WOULD be generated on the auto path.
  entries.push(skillMessageEntry("/skill:batch-implementation continue"));
  for (const handler of handlers.turn_end) handler({}, ctx);

  await commands.autocompact.handler("now ship the release notes", ctx);
  assert.equal(captured?.customInstructions, "ship the release notes", "explicit instructions must win unchanged");
});

test("auto-path compaction (no explicit instructions) forwards the generated preserve block", async () => {
  const { pi, handlers, commands } = makeFakePi();
  autocompact(pi as never);

  const entries: unknown[] = [];
  let captured: { customInstructions?: string } | undefined;
  const ctx = liveCtx(entries, {
    compact: (options: { customInstructions?: string }) => {
      captured = options;
    },
  });
  for (const handler of handlers.session_start) await handler({}, ctx);

  entries.push(skillMessageEntry("/skill:batch-implementation continue"));
  entries.push(effortToolCallEntry(".scratch/compaction-recovery/tickets.md"));
  for (const handler of handlers.turn_end) handler({}, ctx);

  await commands.autocompact.handler("now", ctx);
  assert.ok(captured, "compaction ran");
  assert.match(captured.customInstructions ?? "", /Preserve in the summary:/);
  assert.match(captured.customInstructions ?? "", /batch-implementation/);
  assert.match(captured.customInstructions ?? "", /\.scratch\/compaction-recovery\//);
});

test("activity after a compaction that REPLACES the branch with a shorter one is still detected", async () => {
  const { pi, handlers, sentMessages } = makeFakePi();
  autocompact(pi as never);

  const entries: unknown[] = [];
  const ctx = liveCtx(entries);
  for (const handler of handlers.session_start) await handler({}, ctx);

  // Three entries scanned -> cursor = 3.
  entries.push(skillMessageEntry("/skill:batch-implementation continue"));
  entries.push(skillMessageEntry("plain user message"));
  entries.push(skillMessageEntry("another plain message"));
  for (const handler of handlers.turn_end) handler({}, ctx);

  // Compaction replaces the branch with a single summary entry (length 1 < old cursor 3).
  entries.length = 0;
  entries.push(skillMessageEntry("summary of prior work"));
  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 5000 } }, ctx);
  }
  assert.equal(sentMessages.length, 1);

  // New activity lands BELOW the old cursor length; a missing cursor reset would skip it.
  entries.push(skillMessageEntry("/skill:git-rules commit checkpoint"));
  for (const handler of handlers.turn_end) handler({}, ctx);
  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 3000 } }, ctx);
  }
  assert.equal(sentMessages.length, 2);
  assert.match(sentMessages[1].text, /git-rules/, "post-compaction activity on the shorter branch must be observed");
  assert.doesNotMatch(sentMessages[1].text, /batch-implementation/, "skills from before the previous compaction are not re-announced");
});

test("the extension's own follow-up landing on the branch never re-seeds the next window", async () => {
  const { pi, handlers, sentMessages } = makeFakePi();
  autocompact(pi as never);

  const entries: unknown[] = [];
  const ctx = liveCtx(entries);
  for (const handler of handlers.session_start) await handler({}, ctx);

  entries.push(skillMessageEntry("/skill:batch-implementation continue"));
  for (const handler of handlers.turn_end) handler({}, ctx);
  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 5000 } }, ctx);
  }
  assert.equal(sentMessages.length, 1);

  // The sent follow-up lands on the branch as a user message (it names skill
  // paths and effort dirs) and gets scanned on the next turn boundary.
  entries.push(skillMessageEntry(sentMessages[0].text));
  for (const handler of handlers.turn_end) handler({}, ctx);
  for (const handler of handlers.session_compact) {
    handler({ reason: "manual", compactionEntry: { tokensBefore: 3000 } }, ctx);
  }
  assert.equal(sentMessages.length, 1, "a follow-up must never count as activity for the next window");
});

test("session_start + turn_end + session_compact no-op on a stale ctx (sendUserMessage never called)", async () => {
  const { pi, handlers, sentMessages } = makeFakePi();
  autocompact(pi as never);

  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  try {
    const ctx = staleCtx();
    for (const handler of handlers.session_start) await handler({}, ctx);
    for (const handler of handlers.turn_end) handler({}, ctx);
    for (const handler of handlers.session_compact) {
      handler({ reason: "manual", compactionEntry: { tokensBefore: 1000 } }, ctx);
    }
    await flush();
    assert.equal(rejections.length, 0, `expected no unhandled rejections, got: ${String(rejections[0])}`);
    assert.equal(sentMessages.length, 0, "a stale ctx must never observe activity, so no follow-up is sent");
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});
