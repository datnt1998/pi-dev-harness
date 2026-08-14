import assert from "node:assert/strict";
import test from "node:test";
import { brand, unbrand, type BatchId, type Branded, type EventId, type LeaseId, type TicketId } from "../lib/brand.ts";

test("brand/unbrand round-trip preserves the original string", () => {
  const raw = "T-42";
  const branded = brand<TicketId>(raw);
  assert.equal(unbrand(branded), raw);
  // Runtime value is still a plain string
  assert.equal(typeof branded, "string");
});

test("two brands over the same string are not interchangeable at the type level", () => {
  const ticket = brand<TicketId>("shared-id");
  const lease = brand<LeaseId>("shared-id");

  // Compile-time assertion fixtures: these assignments must fail under tsc --noEmit.
  // We keep them as comments to document the intent; runtime equality holds because
  // brands erase to strings. The type-checker gate is the real contract.
  // @ts-expect-error TicketId is not assignable to LeaseId
  const _leaseFromTicket: LeaseId = ticket;
  // @ts-expect-error LeaseId is not assignable to TicketId
  const _ticketFromLease: TicketId = lease;

  // At runtime they are equal (brands erase), but the compiler prevents cross-family use.
  assert.equal(ticket as string, lease as string);
});

test("structuredClone of a branded state serializes identically to an unbranded clone", () => {
  const brandedState = {
    version: 1 as const,
    batchId: brand<BatchId>("batch-abc"),
    tickets: [
      { id: brand<TicketId>("T1"), status: "queued" },
      { id: brand<TicketId>("T2"), status: "in_progress" },
    ],
    events: [
      { id: brand<EventId>("evt:0001"), kind: "task.started" },
    ],
  };

  const unbrandedState = {
    version: 1 as const,
    batchId: "batch-abc",
    tickets: [
      { id: "T1", status: "queued" },
      { id: "T2", status: "in_progress" },
    ],
    events: [
      { id: "evt:0001", kind: "task.started" },
    ],
  };

  assert.deepEqual(
    structuredClone(brandedState),
    structuredClone(unbrandedState),
    "branded and unbranded states must serialize identically",
  );
  assert.equal(
    JSON.stringify(structuredClone(brandedState)),
    JSON.stringify(structuredClone(unbrandedState)),
    "JSON output must be byte-identical",
  );
});

test("Branded type erases to string at runtime for all id families", () => {
  const ids: Array<{ label: string; value: Branded<string> }> = [
    { label: "TicketId", value: brand<TicketId>("T1") },
    { label: "BatchId", value: brand<BatchId>("batch-x") },
    { label: "LeaseId", value: brand<LeaseId>("lease-y") },
    { label: "EventId", value: brand<EventId>("evt:z") },
  ];
  for (const entry of ids) {
    assert.equal(typeof entry.value, "string", `${entry.label} must erase to string`);
    assert.strictEqual(entry.value.includes("__tag" as never), false, `${entry.label} must not carry runtime tag`);
  }
});
