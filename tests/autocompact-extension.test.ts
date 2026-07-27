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
import test from "node:test";
import autocompact from "../extensions/autocompact.ts";
import { STALE_CTX_MARKER } from "../lib/autocompact-core.ts";

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
