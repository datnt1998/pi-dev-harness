import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOutcome,
  createRunState,
  isBatchRunState,
  isTerminal,
  nextActionableTicket,
  propagateSkips,
  recordContinuation,
  shouldContinue,
  startTicket,
  stopReason,
  summarize,
} from "../lib/ticket-runner-state.ts";

function baseState(commit = false) {
  return createRunState({
    batchId: "b1",
    source: "tickets.md",
    fingerprint: "fp",
    order: ["T1", "T2", "T3"],
    tickets: [
      { id: "T1", dependencies: [] },
      { id: "T2", dependencies: ["T1"] },
      { id: "T3", dependencies: ["T2"] },
    ],
    commit,
    now: 1,
  });
}

test("createRunState drops self and unknown dependencies and defaults", () => {
  const state = createRunState({
    batchId: "b",
    source: "s",
    fingerprint: "f",
    order: ["T1"],
    tickets: [{ id: "T1", dependencies: ["T1", "T9"] }],
  });
  assert.deepEqual(state.tickets[0].dependencies, []);
  assert.equal(state.maxAttempts, 3);
  assert.equal(state.active, true);
  assert.equal(state.commit, false);
});

test("persisted state validation rejects malformed entries", () => {
  assert.equal(isBatchRunState(baseState()), true);
  assert.equal(isBatchRunState({ ...baseState(), version: 2 }), false);
  assert.equal(isBatchRunState({ ...baseState(), maxAttempts: -1 }), false);
  assert.equal(isBatchRunState({ ...baseState(), maxContinuations: -1 }), false);
  assert.equal(isBatchRunState({ ...baseState(), order: ["T1", "unknown"] }), false);
  assert.equal(isBatchRunState({ ...baseState(), tickets: [{ id: "T1", dependencies: ["unknown"], status: "queued", attempts: 0 }] }), false);
  assert.equal(isBatchRunState({ ...baseState(), tickets: [{ id: "T1", status: "bogus" }] }), false);
  assert.equal(isBatchRunState(undefined), false);
});

test("outcomes apply only to the in-progress ticket", () => {
  const state = baseState();
  assert.equal(applyOutcome(state, "T1", "completed"), undefined);
  startTicket(state, "T1");
  assert.equal(applyOutcome(state, "T2", "completed"), undefined);
  assert.equal(applyOutcome(state, "T1", "completed")?.status, "completed");
  assert.equal(applyOutcome(state, "T1", "failed"), undefined);
});

test("actionable ticket respects dependency order", () => {
  const state = baseState();
  assert.equal(nextActionableTicket(state)?.id, "T1");
  startTicket(state, "T1");
  assert.equal(nextActionableTicket(state), undefined); // T2 waits on T1
  applyOutcome(state, "T1", "completed");
  assert.equal(nextActionableTicket(state)?.id, "T2");
});

test("retry re-queues until maxAttempts then fails", () => {
  const state = baseState();
  startTicket(state, "T1"); // attempt 1
  applyOutcome(state, "T1", "retry");
  assert.equal(state.tickets[0].status, "queued");
  startTicket(state, "T1"); // attempt 2
  applyOutcome(state, "T1", "retry");
  startTicket(state, "T1"); // attempt 3
  applyOutcome(state, "T1", "retry");
  assert.equal(state.tickets[0].status, "failed");
  assert.equal(state.tickets[0].attempts, 3);
});

test("failed dependency skips descendants transitively", () => {
  const state = baseState();
  startTicket(state, "T1");
  applyOutcome(state, "T1", "failed");
  propagateSkips(state);
  const s = summarize(state);
  assert.equal(state.tickets.find((t) => t.id === "T2")?.status, "skipped");
  assert.equal(state.tickets.find((t) => t.id === "T3")?.status, "skipped");
  assert.equal(s.skipped, 2);
  assert.equal(isTerminal(state), true);
  assert.equal(stopReason(state), "blocked");
});

test("independent tickets keep running when one needs a decision", () => {
  const state = createRunState({
    batchId: "b",
    source: "s",
    fingerprint: "f",
    order: ["T1", "T2"],
    tickets: [
      { id: "T1", dependencies: [] },
      { id: "T2", dependencies: [] },
    ],
    now: 1,
  });
  startTicket(state, "T1");
  applyOutcome(state, "T1", "needs_decision", "which API?");
  // T2 is independent and still actionable
  assert.equal(nextActionableTicket(state)?.id, "T2");
  assert.equal(shouldContinue(state), true);
  startTicket(state, "T2");
  applyOutcome(state, "T2", "completed");
  assert.equal(isTerminal(state), true);
  assert.equal(stopReason(state), "needs_decision");
});

test("completed batch reports completed", () => {
  const state = baseState();
  for (const id of ["T1", "T2", "T3"]) {
    startTicket(state, id);
    applyOutcome(state, id, "completed");
  }
  assert.equal(isTerminal(state), true);
  assert.equal(stopReason(state), "completed");
  assert.equal(summarize(state).completed, 3);
});

test("an in-progress ticket keeps the batch running across turns", () => {
  const state = baseState();
  startTicket(state, "T1");
  // Agent settled mid-ticket without reporting: still resumable, not stopped.
  assert.equal(stopReason(state), "running");
  assert.equal(shouldContinue(state), true);
});

test("continuation guard stops runaway loops", () => {
  const state = baseState();
  state.maxContinuations = 2;
  assert.equal(shouldContinue(state), true);
  recordContinuation(state);
  recordContinuation(state);
  assert.equal(shouldContinue(state), false);
  assert.equal(stopReason(state), "max_continuations");
});
