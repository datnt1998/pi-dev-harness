import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTINUATION_EVENT,
  continuationRegistry,
  createContinuationRegistry,
  validateContinuationEvent,
} from "../lib/continuation-event.ts";

test("announce/clear cycle tracks planned continuations with monotonic generations", () => {
  const registry = createContinuationRegistry();
  assert.equal(registry.anyPlanned(), false);
  const announced = registry.announce("ticket-runner", "s1", true);
  assert.equal(announced.version, 1);
  assert.equal(announced.planned, true);
  assert.equal(registry.anyPlanned(), true);
  assert.deepEqual(registry.plannedBy(), ["ticket-runner"]);
  const cleared = registry.announce("ticket-runner", "s1", false);
  assert.ok(cleared.generation > announced.generation);
  assert.equal(registry.anyPlanned(), false);
  assert.throws(() => registry.announce("bad owner!", "s1", true), TypeError);
});

test("apply accepts only valid versioned events regardless of arrival order", () => {
  const registry = createContinuationRegistry();
  assert.equal(registry.apply({ version: 1, owner: "ticket-runner", sessionId: "s1", planned: true, generation: 7 }), true);
  assert.equal(registry.anyPlanned(), true);
  assert.ok(registry.generation() >= 7);
  assert.equal(registry.apply({ version: 2, owner: "x", sessionId: "s", planned: true, generation: 1 }), false);
  assert.equal(registry.apply({ version: 1, owner: "x", sessionId: "s", planned: true, generation: 1, extra: 1 }), false);
  assert.equal(registry.apply(undefined), false);
});

test("separate packaged registries coordinate through the event payload", () => {
  const producer = createContinuationRegistry();
  const consumer = createContinuationRegistry();
  const planned = producer.announce("ticket-runner", "s1", true);
  assert.equal(consumer.apply(planned), true);
  assert.equal(consumer.anyPlanned(), true);
  assert.equal(consumer.apply(producer.announce("ticket-runner", "s1", false)), true);
  assert.equal(consumer.anyPlanned(), false);
});

test("validateContinuationEvent is strict about shape", () => {
  assert.equal(validateContinuationEvent({ version: 1, owner: "memory", sessionId: "s", planned: false, generation: 0 }).ok, true);
  assert.equal(validateContinuationEvent({ version: 1, owner: "", sessionId: "s", planned: false, generation: 0 }).ok, false);
  assert.equal(validateContinuationEvent({ version: 1, owner: "m", sessionId: "s", planned: "no", generation: 0 }).ok, false);
  assert.equal(validateContinuationEvent({ version: 1, owner: "m", sessionId: "s", planned: true, generation: -1 }).ok, false);
  assert.equal(CONTINUATION_EVENT, "harness:continuation:v1");
});

test("module-level singleton is shared across importers (load-order independence)", () => {
  continuationRegistry.reset();
  continuationRegistry.announce("test-owner", "s1", true);
  assert.equal(continuationRegistry.anyPlanned(), true);
  continuationRegistry.announce("test-owner", "s1", false);
  assert.equal(continuationRegistry.anyPlanned(), false);
});
