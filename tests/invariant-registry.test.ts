import assert from "node:assert/strict";
import test from "node:test";
import { InvariantRegistry, InvariantError, InvariantViolation } from "../lib/invariant-registry.ts";
import { defaultRegistry, installTicketRunnerState } from "../lib/invariants.ts";
import type { BatchRunState, RunTicket } from "../lib/ticket-runner-state.ts";
import { brand, type TicketId } from "../lib/brand.ts";

/** Minimal valid state for mutation in fixtures. */
function validState(overrides?: Partial<BatchRunState>): BatchRunState {
  return {
    version: 1,
    batchId: brand("batch-1") as never,
    source: "tickets.md",
    fingerprint: "fp-1",
    commit: false,
    active: true,
    maxAttempts: 3,
    maxContinuations: 40,
    continuationsUsed: 0,
    order: [brand<TicketId>("T1"), brand<TicketId>("T2")] as never,
    tickets: [
      { id: brand<TicketId>("T1"), dependencies: [], status: "queued", attempts: 0 },
      { id: brand<TicketId>("T2"), dependencies: [brand<TicketId>("T1")], status: "queued", attempts: 0 },
    ] as RunTicket[],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// --- Registry isolation and enable/disable ---

test("registry skips modules not in enabledModules", () => {
  const registry = new InvariantRegistry({ enabledModules: new Set(["a"]) });
  let aRan = false;
  let bRan = false;
  registry.register("a", (fail) => { aRan = true; });
  registry.register("b", (fail) => { bRan = true; });
  registry.check("a");
  // "b" was silently skipped at registration; checking it throws unknown-module
  assert.ok(aRan);
  assert.ok(!bRan);
  assert.throws(() => registry.check("b"), /unknown-module/);
});

test("registry runs all modules when enabledModules is omitted", () => {
  const registry = new InvariantRegistry();
  const ran: string[] = [];
  registry.register("x", () => { ran.push("x"); });
  registry.register("y", () => { ran.push("y"); });
  registry.check("x");
  registry.check("y");
  assert.deepEqual(ran, ["x", "y"]);
});

// --- Attributed error message ---

test("InvariantError carries module name prefix in message", () => {
  const registry = new InvariantRegistry();
  registry.register("my-module", (fail) => {
    fail("some-rule", "something went wrong");
  });
  try {
    registry.check("my-module");
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof InvariantError);
    assert.equal((err as InvariantError).moduleName, "my-module");
    assert.match((err as Error).message, /invariant violated by "my-module"/);
    assert.match((err as Error).message, /some-rule/);
    assert.match((err as Error).message, /something went wrong/);
  }
});

// --- Duplicate registration ---

test("duplicate registration of an enabled module throws", () => {
  const registry = new InvariantRegistry();
  registry.register("dup", () => {});
  assert.throws(() => registry.register("dup", () => {}), /already registered/);
});

// --- Unknown module check ---

test("checking an unregistered module throws attributed error", () => {
  const registry = new InvariantRegistry();
  assert.throws(() => registry.check("nope"), (err: InvariantError) => {
    return err.moduleName === "nope" && err.rule === "unknown-module";
  });
});

// --- Migration backward compatibility ---

test("defaultRegistry ships with ticket-runner-state pre-installed", () => {
  assert.ok(defaultRegistry.has("ticket-runner-state"));
});

test("assertBatchRunState wrapper still catches duplicate ticket ids via registry", () => {
  const state = validState();
  state.tickets.push({ id: brand<TicketId>("T1"), dependencies: [], status: "queued", attempts: 0 } as RunTicket);
  assert.throws(() => defaultRegistry.check("ticket-runner-state", state), (err: InvariantError) => {
    return err.moduleName === "ticket-runner-state" && err.rule === "unique-ticket-ids";
  });
});

// --- Installer portability ---

test("installTicketRunnerState works on a fresh registry instance", () => {
  const fresh = new InvariantRegistry();
  fresh.register("ticket-runner-state", installTicketRunnerState);
  const state = validState();
  state.order = [brand<TicketId>("T1")] as never; // mismatch: 1 order entry, 2 tickets
  assert.throws(() => fresh.check("ticket-runner-state", state), (err: InvariantError) => {
    return err.moduleName === "ticket-runner-state" && err.rule === "order-matches-tickets";
  });
});
