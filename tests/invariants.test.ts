import assert from "node:assert/strict";
import test from "node:test";
import { brand, type TicketId } from "../lib/brand.ts";
import { InvariantViolation } from "../lib/invariant-registry.ts";
import { assertBatchRunState, assertWorkerInputDerivable } from "../lib/invariants.ts";
import type { BatchRunState, RunTicket } from "../lib/ticket-runner-state.ts";

/** Minimal valid state for mutation in fixtures. */
function validState(overrides?: Partial<BatchRunState>): BatchRunState {
  return {
    version: 1,
    batchId: brand("batch-1") as any,
    source: "tickets.md",
    fingerprint: "fp-1",
    commit: false,
    active: true,
    maxAttempts: 3,
    maxContinuations: 40,
    continuationsUsed: 0,
    order: [brand<TicketId>("T1"), brand<TicketId>("T2")] as any,
    tickets: [
      { id: brand<TicketId>("T1"), dependencies: [], status: "queued", attempts: 0 },
      { id: brand<TicketId>("T2"), dependencies: [brand<TicketId>("T1")], status: "queued", attempts: 0 },
    ] as RunTicket[],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

test("valid state passes all assertions", () => {
  assert.doesNotThrow(() => assertBatchRunState(validState()));
});

test("unique-ticket-ids: duplicate ticket id throws", () => {
  const state = validState();
  state.tickets.push({ id: brand<TicketId>("T1"), dependencies: [], status: "queued", attempts: 0 } as RunTicket);
  assert.throws(() => assertBatchRunState(state), (err: InvariantViolation) => err.rule === "unique-ticket-ids");
});

test("order-matches-tickets: order length mismatch throws", () => {
  const state = validState({ order: [brand<TicketId>("T1")] as any });
  assert.throws(() => assertBatchRunState(state), (err: InvariantViolation) => err.rule === "order-matches-tickets");
});

test("no-self-dependency: self-edge throws", () => {
  const state = validState();
  state.tickets[0].dependencies = [brand<TicketId>("T1")];
  assert.throws(() => assertBatchRunState(state), (err: InvariantViolation) => err.rule === "no-self-dependency");
});

test("dependency-exists: unknown dependency throws", () => {
  const state = validState();
  state.tickets[0].dependencies = [brand<TicketId>("T99")];
  assert.throws(() => assertBatchRunState(state), (err: InvariantViolation) => err.rule === "dependency-exists");
});

test("single-in-progress: multiple in_progress throws", () => {
  const state = validState();
  state.tickets[0].status = "in_progress";
  state.tickets[1].status = "in_progress";
  assert.throws(() => assertBatchRunState(state), (err: InvariantViolation) => err.rule === "single-in-progress");
});

test("lease-requires-in-progress: open lease without in_progress throws", () => {
  const state = validState({
    activeWriterLease: {
      leaseId: brand("l1") as any, worktreeKey: "active", owner: "w", ownerRole: "parent",
      phase: "implementation", ticketId: brand<TicketId>("T1"), attempt: 1,
      allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01",
    } as any,
  });
  assert.throws(() => assertBatchRunState(state), (err: InvariantViolation) => err.rule === "lease-requires-in-progress");
});

test("report-attempt-bounds: report exceeding ticket attempts throws", () => {
  const state = validState();
  state.tickets[0].attempts = 1;
  state.tickets[0].evidence = {
    acceptedReports: [{ attempt: 5, outcome: "completed", report: {} as any }],
  };
  assert.throws(() => assertBatchRunState(state), (err: InvariantViolation) => err.rule === "report-attempt-bounds");
});

test("decision-index-references-existing: unknown ticket in decision index throws", () => {
  const state = validState({
    decisionIndex: [{
      key: "k",
      packet: {
        affectedWorkUnitIds: ["T99"], affectedTicketIds: [brand<TicketId>("T99")] as any,
        affectedFiles: [], locatorOrGlob: "x", searchedScope: "x", exclusions: [],
        pattern: "p", patternKind: "code-shape", occurrences: 0, representativeLocators: [],
        question: "?", safeDefault: "s", consequences: "c", replayCommand: "r",
        disconfirmProcedure: "d", blockedStage: "implementation", unrelatedWorkSafe: true,
      } as any,
    }],
  });
  assert.throws(() => assertBatchRunState(state), (err: InvariantViolation) => err.rule === "decision-index-references-existing");
});

test("last-closed-matches-history-tip: mismatched tip throws", () => {
  const state = validState({
    lastClosedWriterLease: {
      leaseId: brand("l1") as any, ticketId: brand<TicketId>("T1"), attempt: 1,
      worktreeKey: "active", owner: "w", ownerRole: "parent", phase: "closed",
      allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", closedAt: "2026-01-01",
      handoffFingerprint: "fp",
    } as any,
    writerLeaseHistory: [{
      leaseId: brand("l2") as any, ticketId: brand<TicketId>("T1"), attempt: 1,
      worktreeKey: "active", owner: "w", ownerRole: "parent", phase: "closed",
      allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", closedAt: "2026-01-01",
      handoffFingerprint: "fp",
    } as any],
  });
  assert.throws(() => assertBatchRunState(state), (err: InvariantViolation) => err.rule === "last-closed-matches-history-tip");
});

// --- Worker input derivation ---

test("worker-input-ticket-exists: missing ticket throws", () => {
  const state = validState();
  assert.throws(() => assertWorkerInputDerivable(state, "T99"), (err: InvariantViolation) => err.rule === "worker-input-ticket-exists");
});

test("worker-input-dep-resolved: unresolved dependency throws", () => {
  const state = validState();
  state.tickets[1].status = "in_progress"; // T2 depends on T1 which is queued
  assert.throws(() => assertWorkerInputDerivable(state, "T2"), (err: InvariantViolation) => err.rule === "worker-input-dep-resolved");
});

test("worker-input succeeds for a derivable ticket", () => {
  const state = validState();
  state.tickets[0].status = "completed";
  assert.doesNotThrow(() => assertWorkerInputDerivable(state, "T2"));
});
