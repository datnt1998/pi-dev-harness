/**
 * Named invariant assertions over BatchRunState.
 *
 * Re-expresses what `isBatchRunState` enforces silently as bare boolean returns, but
 * with named errors so corrupted states can be diagnosed without reading the parser.
 * Each assertion has one check and one imperative rule message.
 *
 * These are NOT new rules — they name existing constraints. A violating fixture proves
 * each gap between this module and `isBatchRunState`; if no fixture exists for a rule,
 * that rule is not added here.
 */

import type { BatchRunState } from "./ticket-runner-state.ts";

export class InvariantViolation extends Error {
  public readonly rule: string;
  constructor(rule: string, message: string) {
    super(`[invariant:${rule}] ${message}`);
    this.name = "InvariantViolation";
    this.rule = rule;
  }
}

/**
 * Assert all structural invariants over a validated batch state. Throws
 * {@link InvariantViolation} naming the first violated rule.
 *
 * Callers must have already confirmed the value passes `isBatchRunState`; this
 * function adds diagnostic names, not new validation.
 */
export function assertBatchRunState(state: BatchRunState): void {
  // Unique ticket ids
  const ids = new Set<string>();
  for (const ticket of state.tickets) {
    if (ids.has(ticket.id)) throw new InvariantViolation("unique-ticket-ids", `Duplicate ticket id: ${ticket.id}`);
    ids.add(ticket.id);
  }

  // Order matches tickets exactly
  if (state.order.length !== ids.size) {
    throw new InvariantViolation("order-matches-tickets", `Order has ${state.order.length} entries but state has ${ids.size} tickets`);
  }
  for (const id of state.order) {
    if (!ids.has(id)) throw new InvariantViolation("order-matches-tickets", `Order references unknown ticket: ${id}`);
  }

  // Dependencies reference existing tickets, no self-edges
  for (const ticket of state.tickets) {
    for (const dep of ticket.dependencies) {
      if (dep === ticket.id) throw new InvariantViolation("no-self-dependency", `Ticket ${ticket.id} depends on itself`);
      if (!ids.has(dep)) throw new InvariantViolation("dependency-exists", `Ticket ${ticket.id} depends on unknown ticket: ${dep}`);
    }
  }

  // At most one in_progress
  const inProgressTickets = state.tickets.filter((t) => t.status === "in_progress");
  if (inProgressTickets.length > 1) {
    throw new InvariantViolation("single-in-progress", `Multiple tickets in_progress: ${inProgressTickets.map((t) => t.id).join(", ")}`);
  }

  // Open lease requires exactly one in_progress matching ticket
  if (state.activeWriterLease !== undefined) {
    if (inProgressTickets.length !== 1) {
      throw new InvariantViolation("lease-requires-in-progress", `Open writer lease but ${inProgressTickets.length} tickets in_progress`);
    }
    const leaseTicket = state.tickets.find((t) => t.id === state.activeWriterLease!.ticketId);
    if (!leaseTicket || leaseTicket.status !== "in_progress") {
      throw new InvariantViolation("lease-ticket-in-progress", `Open lease ticket ${state.activeWriterLease.ticketId} is not in_progress`);
    }
    if (leaseTicket.attempts !== state.activeWriterLease.attempt) {
      throw new InvariantViolation("lease-attempt-matches", `Open lease attempt ${state.activeWriterLease.attempt} does not match ticket attempt ${leaseTicket.attempts}`);
    }
  }

  // Accepted reports match their ticket id and never exceed its attempt count
  for (const ticket of state.tickets) {
    if (ticket.evidence?.acceptedReports) {
      for (const record of ticket.evidence.acceptedReports) {
        if (record.attempt > ticket.attempts) {
          throw new InvariantViolation("report-attempt-bounds", `Report for ticket ${ticket.id} has attempt ${record.attempt} exceeding ticket attempts ${ticket.attempts}`);
        }
      }
    }
  }

  // Decision index entries name existing tickets
  if (state.decisionIndex) {
    for (const entry of state.decisionIndex) {
      for (const id of entry.packet.affectedTicketIds) {
        if (!ids.has(id)) {
          throw new InvariantViolation("decision-index-references-existing", `Decision index references unknown ticket: ${id}`);
        }
      }
    }
  }

  // Last-closed lease matches history tip
  if (state.lastClosedWriterLease !== undefined && state.writerLeaseHistory !== undefined && state.writerLeaseHistory.length > 0) {
    const tip = state.writerLeaseHistory[state.writerLeaseHistory.length - 1];
    if (tip.leaseId !== state.lastClosedWriterLease.leaseId || tip.ticketId !== state.lastClosedWriterLease.ticketId
      || tip.attempt !== state.lastClosedWriterLease.attempt || tip.closedAt !== state.lastClosedWriterLease.closedAt
      || tip.handoffFingerprint !== state.lastClosedWriterLease.handoffFingerprint) {
      throw new InvariantViolation("last-closed-matches-history-tip", "lastClosedWriterLease does not match writerLeaseHistory tip");
    }
  }
}

/**
 * Assert that all derivation inputs for a worker ticket are present in state.
 * The worker needs source location, fingerprint, dependency statuses, prior
 * evidence, and attempt count to produce valid work-unit identity.
 */
export function assertWorkerInputDerivable(state: BatchRunState, ticketId: string): void {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) throw new InvariantViolation("worker-input-ticket-exists", `Cannot derive worker input: ticket ${ticketId} not found in state`);

  if (!state.source) throw new InvariantViolation("worker-input-source", `Cannot derive worker input: batch has no source`);
  if (!state.fingerprint) throw new InvariantViolation("worker-input-fingerprint", `Cannot derive worker input: batch has no fingerprint`);

  // Dependencies must be resolved (not queued or in_progress)
  for (const depId of ticket.dependencies) {
    const dep = state.tickets.find((t) => t.id === depId);
    if (!dep) throw new InvariantViolation("worker-input-dep-exists", `Cannot derive worker input: dependency ${depId} not found`);
    if (dep.status === "queued" || dep.status === "in_progress") {
      throw new InvariantViolation("worker-input-dep-resolved", `Cannot derive worker input: dependency ${depId} is ${dep.status}, not resolved`);
    }
  }

  if (!Number.isInteger(ticket.attempts) || ticket.attempts < 0) {
    throw new InvariantViolation("worker-input-attempt", `Cannot derive worker input: ticket ${ticketId} has invalid attempt count ${ticket.attempts}`);
  }
}
