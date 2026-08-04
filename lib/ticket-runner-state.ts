export type TicketRunStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "blocked"
  | "needs_decision"
  | "skipped";

export type TicketOutcome =
  | "completed"
  | "retry"
  | "failed"
  | "blocked"
  | "needs_decision";

import {
  acquireExclusiveWriterLease,
  canStartReviewAgainstLease,
  closeExclusiveWriterLease,
  decisionPacketEquivalenceKey,
  inspectPersistedWriterLease,
  isDecisionPacket,
  parseTeamOrchestrationEnvelope,
  type ActiveWriterLease,
  type DecisionPacket,
  type FixBriefEvidence,
  type FindingDispositionEvidence,
  type LeaseOpFailureCode,
  type RequestedOutcome,
  type TeamOrchestrationEnvelopeV1,
  type WriterLeaseEvidence,
} from "./team-orchestration-protocol.ts";
import { createPilotLedger, derivePilotRow, isPilotLedger, isWorkerLaneControl, recordPilotRow, type PilotLedger, type WorkerLaneControl } from "./team-orchestration-pilot.ts";

export type AcceptedReportRecord = {
  attempt: number;
  outcome: TicketOutcome;
  report: TeamOrchestrationEnvelopeV1;
};

export type TicketEvidenceState = {
  /** Accepted reports are append-only provenance for interrupted/resumed work. */
  acceptedReports: AcceptedReportRecord[];
  /** A retry leaves its failed/incomplete evidence available to the next attempt. */
  pendingEvidence?: TeamOrchestrationEnvelopeV1;
  /** The accepted escalation evidence for this ticket, if it needs an owner decision. */
  pendingDecision?: DecisionPacket;
};

export type DecisionIndexEntry = {
  key: string;
  packet: DecisionPacket;
};

export type RunTicket = {
  id: string;
  dependencies: string[];
  status: TicketRunStatus;
  attempts: number;
  note?: string;
  evidence?: TicketEvidenceState;
};

export type BatchRunState = {
  version: 1;
  batchId: string;
  source: string;
  fingerprint: string;
  commit: boolean;
  active: boolean;
  maxAttempts: number;
  maxContinuations: number;
  continuationsUsed: number;
  order: string[];
  tickets: RunTicket[];
  /** Canonical replayable owner decisions, deduplicated by structural evidence. */
  decisionIndex?: DecisionIndexEntry[];
  /** At most one exclusive open writer lease for the active worktree. */
  activeWriterLease?: ActiveWriterLease;
  /** Closed handoff evidence retained across resume until the next acquire. */
  lastClosedWriterLease?: WriterLeaseEvidence;
  /**
   * Append-only closed lease handoffs for the batch. Preserves implementation then
   * at most one fix phase proof across resume/reconstruction.
   */
  writerLeaseHistory?: WriterLeaseEvidence[];
  /** Generic persisted pilot observations; incomplete rows are retained by the pilot module. */
  pilotLedger?: PilotLedger;
  /** Disabling or demoting affects only worker writer selection. */
  workerLaneControl?: WorkerLaneControl;
  createdAt: number;
  updatedAt: number;
};

export type StopReason =
  | "running"
  | "completed"
  | "needs_decision"
  | "blocked"
  | "max_continuations"
  | "inactive";

export type CreateRunInput = {
  batchId: string;
  source: string;
  fingerprint: string;
  order: string[];
  tickets: Array<{ id: string; dependencies: string[] }>;
  commit?: boolean;
  maxAttempts?: number;
  maxContinuations?: number;
  now?: number;
};

const TERMINAL_BAD: TicketRunStatus[] = ["failed", "blocked", "needs_decision", "skipped"];
const RUN_STATUSES = new Set<TicketRunStatus>(["queued", "in_progress", "completed", "failed", "blocked", "needs_decision", "skipped"]);

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum;
}

export function isBatchRunState(value: unknown): value is BatchRunState {
  // Session entries are untrusted persisted data. A malformed index must never
  // make reconstruction throw or prevent recovery from an earlier snapshot.
  try {
    return isBatchRunStateUnchecked(value);
  } catch {
    return false;
  }
}

function isBatchRunStateUnchecked(value: unknown): value is BatchRunState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<BatchRunState>;
  if (state.version !== 1 || typeof state.batchId !== "string" || typeof state.source !== "string" || typeof state.fingerprint !== "string") return false;
  if (typeof state.commit !== "boolean" || typeof state.active !== "boolean") return false;
  if (!isIntegerAtLeast(state.maxAttempts, 1)) return false;
  if (!isIntegerAtLeast(state.maxContinuations, 0)) return false;
  if (!isIntegerAtLeast(state.continuationsUsed, 0) || state.continuationsUsed > state.maxContinuations) return false;
  if (![state.createdAt, state.updatedAt].every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0)) return false;
  if (!Array.isArray(state.order) || !state.order.every((id) => typeof id === "string") || new Set(state.order).size !== state.order.length) return false;
  if (!Array.isArray(state.tickets)) return false;
  const ids = new Set<string>();
  let inProgress = 0;
  for (const ticket of state.tickets) {
    if (!ticket || typeof ticket !== "object" || typeof ticket.id !== "string" || ids.has(ticket.id)) return false;
    if (!Array.isArray(ticket.dependencies) || !ticket.dependencies.every((id) => typeof id === "string")) return false;
    if (!RUN_STATUSES.has(ticket.status) || !Number.isInteger(ticket.attempts) || ticket.attempts < 0) return false;
    if (ticket.note !== undefined && typeof ticket.note !== "string") return false;
    if (ticket.evidence !== undefined) {
      if (!ticket.evidence || typeof ticket.evidence !== "object" || !Array.isArray(ticket.evidence.acceptedReports)) return false;
      for (const record of ticket.evidence.acceptedReports) {
        if (!record || typeof record !== "object" || !isIntegerAtLeast(record.attempt, 1)
          || !["completed", "retry", "failed", "blocked", "needs_decision"].includes(record.outcome)) return false;
        const parsed = parseTeamOrchestrationEnvelope(record.report);
        if (!parsed.ok || record.attempt > ticket.attempts || parsed.value.workUnit.ticketId !== ticket.id
          || parsed.value.workUnit.source !== state.source || parsed.value.workUnit.sourceFingerprint !== state.fingerprint
          || parsed.value.workUnit.attempt !== record.attempt || parsed.value.requestedOutcome !== record.outcome) return false;
      }
      if (ticket.evidence.pendingEvidence !== undefined) {
        const pending = parseTeamOrchestrationEnvelope(ticket.evidence.pendingEvidence);
        if (!pending.ok || pending.value.requestedOutcome !== "retry" || pending.value.workUnit.ticketId !== ticket.id
          || pending.value.workUnit.source !== state.source || pending.value.workUnit.sourceFingerprint !== state.fingerprint
          || pending.value.workUnit.attempt > ticket.attempts) return false;
      }
      if (ticket.evidence.pendingDecision !== undefined && (!isDecisionPacket(ticket.evidence.pendingDecision)
        || !ticket.evidence.pendingDecision.affectedTicketIds.includes(ticket.id))) return false;
    }
    if (ticket.status === "in_progress") inProgress += 1;
    ids.add(ticket.id);
  }
  if (inProgress > 1 || state.order.length !== ids.size || !state.order.every((id) => ids.has(id))) return false;
  if (state.activeWriterLease !== undefined) {
    const lease = state.activeWriterLease;
    if (!lease || typeof lease !== "object" || typeof lease.leaseId !== "string" || typeof lease.worktreeKey !== "string"
      || typeof lease.owner !== "string" || !["parent", "worker", "fix-writer"].includes(lease.ownerRole)
      || !["implementation", "fix"].includes(lease.phase) || typeof lease.ticketId !== "string" || !ids.has(lease.ticketId)
      || !Number.isInteger(lease.attempt) || lease.attempt < 1
      || !Array.isArray(lease.allowedPaths) || !lease.allowedPaths.every((path) => typeof path === "string" && path.trim().length > 0)
      || lease.allowedPaths.length === 0 || typeof lease.openedAt !== "string"
      || (lease.fixBriefId !== undefined && typeof lease.fixBriefId !== "string")) return false;
    // Orphaned/contradictory open leases fail closed before reconstruction/scheduling.
    const ticket = state.tickets.find((item) => item.id === lease.ticketId);
    if (!ticket || ticket.status !== "in_progress" || ticket.attempts !== lease.attempt) return false;
    if (inProgress !== 1) return false;
  }
  if (state.lastClosedWriterLease !== undefined) {
    const lease = state.lastClosedWriterLease;
    if (!isClosedLeaseEvidence(lease)) return false;
  }
  if (state.writerLeaseHistory !== undefined) {
    if (!Array.isArray(state.writerLeaseHistory) || !state.writerLeaseHistory.every(isClosedLeaseEvidence)) return false;
    if (state.lastClosedWriterLease !== undefined) {
      const tip = state.writerLeaseHistory[state.writerLeaseHistory.length - 1];
      if (!tip || tip.leaseId !== state.lastClosedWriterLease.leaseId || tip.ticketId !== state.lastClosedWriterLease.ticketId
        || tip.attempt !== state.lastClosedWriterLease.attempt || tip.closedAt !== state.lastClosedWriterLease.closedAt
        || tip.handoffFingerprint !== state.lastClosedWriterLease.handoffFingerprint) return false;
    }
    const fixRoundsByAttempt = new Map<string, number>();
    for (const lease of state.writerLeaseHistory.filter((entry) => entry.ownerRole === "fix-writer")) {
      const key = `${lease.ticketId}:${lease.attempt}`;
      const count = (fixRoundsByAttempt.get(key) ?? 0) + 1;
      if (count > 1) return false;
      fixRoundsByAttempt.set(key, count);
    }
  }
  if (state.pilotLedger !== undefined && !isPilotLedger(state.pilotLedger)) return false;
  if (state.workerLaneControl !== undefined && !isWorkerLaneControl(state.workerLaneControl)) return false;
  if (state.decisionIndex !== undefined) {
    if (!Array.isArray(state.decisionIndex)) return false;
    const indexedPackets = new Map<string, DecisionPacket>();
    for (const entry of state.decisionIndex) {
      if (!entry || typeof entry !== "object" || typeof entry.key !== "string" || !entry.packet || !isDecisionPacket(entry.packet)
        || entry.key !== decisionPacketEquivalenceKey(entry.packet) || indexedPackets.has(entry.key)
        || !entry.packet.affectedTicketIds.every((id) => ids.has(id))
        || !entry.packet.affectedWorkUnitIds.every((id) => ids.has(id))) return false;
      indexedPackets.set(entry.key, entry.packet);
    }
    for (const ticket of state.tickets) {
      const pending = ticket.evidence?.pendingDecision;
      if (pending !== undefined) {
        const canonical = indexedPackets.get(decisionPacketEquivalenceKey(pending));
        // A pending packet is a persisted denormalization of its index entry;
        // require exact canonical reconstruction rather than merely a matching key.
        if (!canonical || JSON.stringify(pending) !== JSON.stringify(canonical)) return false;
      }
    }
  }
  return state.tickets.every((ticket) => ticket.dependencies.every((id) => id !== ticket.id && ids.has(id)));
}

function isClosedLeaseEvidence(lease: unknown): lease is WriterLeaseEvidence {
  return !!lease && typeof lease === "object" && typeof (lease as WriterLeaseEvidence).leaseId === "string"
    && typeof (lease as WriterLeaseEvidence).ticketId === "string"
    && Number.isInteger((lease as WriterLeaseEvidence).attempt) && (lease as WriterLeaseEvidence).attempt > 0
    && typeof (lease as WriterLeaseEvidence).worktreeKey === "string"
    && typeof (lease as WriterLeaseEvidence).owner === "string"
    && ["parent", "worker", "fix-writer"].includes((lease as WriterLeaseEvidence).ownerRole)
    && (lease as WriterLeaseEvidence).phase === "closed"
    && Array.isArray((lease as WriterLeaseEvidence).allowedPaths)
    && (lease as WriterLeaseEvidence).allowedPaths.every((path) => typeof path === "string" && path.trim().length > 0)
    && (lease as WriterLeaseEvidence).allowedPaths.length > 0
    && typeof (lease as WriterLeaseEvidence).openedAt === "string"
    && typeof (lease as WriterLeaseEvidence).closedAt === "string"
    && typeof (lease as WriterLeaseEvidence).handoffFingerprint === "string"
    && ((lease as WriterLeaseEvidence).fixBriefId === undefined || typeof (lease as WriterLeaseEvidence).fixBriefId === "string");
}

function closedLeaseMatches(reportLease: WriterLeaseEvidence, recorded: WriterLeaseEvidence): boolean {
  return recorded.leaseId === reportLease.leaseId
    && recorded.ticketId === reportLease.ticketId
    && recorded.attempt === reportLease.attempt
    && recorded.owner === reportLease.owner
    && recorded.ownerRole === reportLease.ownerRole
    && recorded.worktreeKey === reportLease.worktreeKey
    && recorded.handoffFingerprint === reportLease.handoffFingerprint
    && recorded.closedAt === reportLease.closedAt
    && recorded.fixBriefId === reportLease.fixBriefId;
}

function appendClosedLeaseHistory(state: BatchRunState, closed: WriterLeaseEvidence): void {
  const history = [...(state.writerLeaseHistory ?? [])];
  const already = history.some((entry) => entry.leaseId === closed.leaseId && entry.ticketId === closed.ticketId && entry.attempt === closed.attempt
    && entry.closedAt === closed.closedAt && entry.handoffFingerprint === closed.handoffFingerprint);
  if (!already) history.push(structuredClone(closed));
  state.writerLeaseHistory = history;
  state.lastClosedWriterLease = structuredClone(closed);
}

export function createRunState(input: CreateRunInput): BatchRunState {
  const now = input.now ?? Date.now();
  // Persisted order must be reconstructable even when callers provide a partial
  // or duplicate requested order. Keep first ticket definitions deterministically.
  const ticketInputs = input.tickets.filter((ticket, index, all) => all.findIndex((candidate) => candidate.id === ticket.id) === index);
  const ids = new Set(ticketInputs.map((t) => t.id));
  const tickets: RunTicket[] = ticketInputs.map((t) => ({
    id: t.id,
    dependencies: [...new Set(t.dependencies.filter((d) => ids.has(d) && d !== t.id))],
    status: "queued",
    attempts: 0,
  }));
  const requestedOrder = input.order.filter((id, index, all) => ids.has(id) && all.indexOf(id) === index);
  const order = [...requestedOrder, ...ticketInputs.map((ticket) => ticket.id).filter((id) => !requestedOrder.includes(id))];
  return {
    version: 1,
    batchId: input.batchId,
    source: input.source,
    fingerprint: input.fingerprint,
    commit: input.commit ?? false,
    active: true,
    maxAttempts: Math.max(1, input.maxAttempts ?? 3),
    maxContinuations: Math.max(1, input.maxContinuations ?? 40),
    continuationsUsed: 0,
    order,
    tickets,
    decisionIndex: [],
    createdAt: now,
    updatedAt: now,
  };
}

function byId(state: BatchRunState, id: string): RunTicket | undefined {
  return state.tickets.find((t) => t.id === id);
}

function depsSatisfied(state: BatchRunState, ticket: RunTicket): boolean {
  return ticket.dependencies.every((dep) => byId(state, dep)?.status === "completed");
}

function depsUnrecoverable(state: BatchRunState, ticket: RunTicket): boolean {
  return ticket.dependencies.some((dep) => {
    const d = byId(state, dep);
    return !!d && TERMINAL_BAD.includes(d.status);
  });
}

/** Mark tickets whose dependencies can never complete as skipped. Returns changed. */
export function propagateSkips(state: BatchRunState): boolean {
  let changed = false;
  let loop = true;
  while (loop) {
    loop = false;
    for (const ticket of state.tickets) {
      if (ticket.status !== "queued") continue;
      if (depsUnrecoverable(state, ticket)) {
        ticket.status = "skipped";
        ticket.note = "Skipped because a dependency did not complete.";
        changed = true;
        loop = true;
      }
    }
  }
  if (changed) state.updatedAt = Date.now();
  return changed;
}

function hasUnsafePendingDecision(state: BatchRunState): boolean {
  return state.tickets.some((ticket) => ticket.status === "needs_decision" && ticket.evidence?.pendingDecision?.unrelatedWorkSafe === false);
}

/** The next queued ticket, in order, whose dependencies are all completed. */
export function nextActionableTicket(state: BatchRunState): RunTicket | undefined {
  propagateSkips(state);
  if (hasUnsafePendingDecision(state)) return undefined;
  for (const id of state.order) {
    const ticket = byId(state, id);
    if (ticket && ticket.status === "queued" && depsSatisfied(state, ticket)) return ticket;
  }
  return undefined;
}

export function startTicket(state: BatchRunState, id: string): RunTicket | undefined {
  const ticket = byId(state, id);
  if (!ticket || ticket.status !== "queued") return undefined;
  ticket.status = "in_progress";
  ticket.attempts += 1;
  state.updatedAt = Date.now();
  return ticket;
}

export type EvidencedOutcomeFailureCode =
  | "invalid-report"
  | "wrong-work-unit"
  | "wrong-outcome"
  | "completed-evidence-incomplete"
  | "retry-evidence-incomplete"
  | "failure-evidence-incomplete"
  | "needs-decision-evidence-incomplete"
  | "invalid-transition";

export type EvidencedOutcomeResult =
  | { ok: true; ticket: RunTicket }
  | { ok: false; error: { code: EvidencedOutcomeFailureCode; message: string } };

function runRouteFact(label: string, run: TeamOrchestrationEnvelopeV1["runs"][number] | undefined): string {
  if (!run) return `${label}=unknown (fallback unknown; thinking unknown)`;
  const model = run.provider.model ? `/${run.provider.model}` : "";
  return `${label}=${run.provider.provider}${model} (fallback ${run.provider.fallback ? "yes" : "no"}; thinking ${run.provider.effectiveThinking ?? "unknown"})`;
}

function decisionNote(packet: DecisionPacket): string {
  return `NEEDS_DECISION: ${packet.question} Safe default: ${packet.safeDefault}. Consequences: ${packet.consequences}. Replay: ${packet.replayCommand}`;
}

function reportNote(report: TeamOrchestrationEnvelopeV1): string {
  if (report.requestedOutcome === "needs_decision") return decisionNote(report.decisionPacket!);
  const summary = `Evidence accepted: ${report.requestedOutcome}; parent gate ${report.parentGate.action}; validations ${report.parentValidation.filter((item) => item.outcome === "passed").length}/${report.parentValidation.length} passed.`;
  if (!report.diversity.degraded) return summary;
  const warning = report.diversity.warning!;
  const acknowledgment = report.diversity.acknowledgment!;
  const producer = report.runs.find((run) => run.role === "producer");
  const standards = report.reviews.find((review) => review.axis === "standards")?.run;
  const spec = report.reviews.find((review) => review.axis === "spec")?.run;
  const actualTopology = [runRouteFact("producer", producer), runRouteFact("Standards", standards), runRouteFact("Spec", spec)].join("; ");
  return `${summary} DEGRADED ${report.diversity.achievedIndependence}: target ${warning.targetTopology}; configured ${warning.configuredProviders.join(", ")}; actual ${actualTopology}; missing/overlap ${warning.missingOrOverlapping}; consequence ${warning.qualityConsequence}; guidance ${warning.configurationGuidance}; acknowledgment ${acknowledgment.actor} ${acknowledgment.decision} at ${acknowledgment.at} because ${acknowledgment.reason}.`;
}

function sameAxes(reviews: TeamOrchestrationEnvelopeV1["reviews"], fingerprint: string): boolean {
  return reviews.length === 2 && new Set(reviews.map((review) => review.axis)).size === 2
    && reviews.every((review) => review.reviewedFingerprint === fingerprint);
}

export type WriterLeaseMutationResult =
  | { ok: true; state: BatchRunState; lease?: ActiveWriterLease; closed?: WriterLeaseEvidence }
  | { ok: false; error: { code: LeaseOpFailureCode | "invalid-transition"; message: string } };

/** Acquire the exclusive worktree writer lease for the in-progress ticket. */
export function acquireBatchWriterLease(
  state: BatchRunState,
  request: ActiveWriterLease,
  context: {
    dispositions?: FindingDispositionEvidence[];
    fixBrief?: FixBriefEvidence;
    priorFixRounds?: number;
    implementationScopePaths?: string[];
  } = {},
): WriterLeaseMutationResult {
  const active = inProgressTicket(state);
  if (!active) return { ok: false, error: { code: "invalid-transition", message: "A writer lease requires an in-progress ticket." } };
  if (request.ownerRole === "worker" && state.workerLaneControl && state.workerLaneControl.mode !== "enabled") {
    return { ok: false, error: { code: "invalid-request", message: "Worker lane is demoted or disabled; select the parent writer." } };
  }
  const inspection = inspectPersistedWriterLease(state.activeWriterLease, {
    ticketStatuses: Object.fromEntries(state.tickets.map((ticket) => [ticket.id, ticket.status])),
    inProgressTicketId: active.id,
  });
  if (!inspection.ok) return { ok: false, error: inspection.error };
  const priorFixRounds = context.priorFixRounds ?? (state.writerLeaseHistory ?? []).filter((lease) => lease.ownerRole === "fix-writer" && lease.ticketId === active.id && lease.attempt === active.attempts).length;
  const acquired = acquireExclusiveWriterLease(state.activeWriterLease, { ...request, ticketId: request.ticketId || active.id, attempt: request.attempt || active.attempts }, {
    inProgressTicketId: active.id,
    dispositions: context.dispositions,
    fixBrief: context.fixBrief,
    priorFixRounds,
    implementationScopePaths: context.implementationScopePaths,
  });
  if (!acquired.ok) return { ok: false, error: acquired.error };
  if (acquired.value.ticketId !== active.id) return { ok: false, error: { code: "stale", message: "Lease ticket does not match the active in-progress work unit." } };
  state.activeWriterLease = acquired.value;
  state.updatedAt = Date.now();
  return { ok: true, state, lease: acquired.value };
}

/** Close/handoff the exclusive lease and retain closed evidence for resume. */
export function closeBatchWriterLease(
  state: BatchRunState,
  input: { leaseId: string; owner: string; closedAt: string; handoffFingerprint: string },
): WriterLeaseMutationResult {
  const closed = closeExclusiveWriterLease(state.activeWriterLease, input);
  if (!closed.ok) return { ok: false, error: closed.error };
  appendClosedLeaseHistory(state, closed.value);
  delete state.activeWriterLease;
  state.updatedAt = Date.now();
  return { ok: true, state, closed: closed.value };
}

/** Review is prohibited while any writer lease is open. */
export function assertBatchReviewAllowed(state: BatchRunState): { ok: true } | { ok: false; error: { code: LeaseOpFailureCode; message: string } } {
  const allowed = canStartReviewAgainstLease(state.activeWriterLease);
  if (!allowed.ok) return { ok: false, error: { code: allowed.code, message: allowed.message } };
  return { ok: true };
}

/** Fail closed when a resumed lease is orphaned or contradicts ticket progress. */
export function reconcileBatchWriterLease(state: BatchRunState): { ok: true; lease?: ActiveWriterLease } | { ok: false; error: { code: LeaseOpFailureCode; message: string } } {
  const active = inProgressTicket(state);
  const inspection = inspectPersistedWriterLease(state.activeWriterLease, {
    ticketStatuses: Object.fromEntries(state.tickets.map((ticket) => [ticket.id, ticket.status])),
    inProgressTicketId: active?.id,
  });
  if (!inspection.ok) return { ok: false, error: inspection.error };
  return { ok: true, lease: inspection.value };
}

function completionFailure(report: TeamOrchestrationEnvelopeV1): string | undefined {
  const fingerprint = report.implementation.fingerprint;
  if (report.writerLease.phase !== "closed" || !report.writerLease.closedAt) return "writer lease is not closed";
  if (report.parentGate.action !== "accepted" || report.parentGate.observedFingerprint !== fingerprint) return "parent accepted gate does not match final implementation";
  if (report.parentValidation.length === 0 || report.parentValidation.some((item) => item.outcome !== "passed" || item.observedFingerprint !== fingerprint)) return "parent validations must all pass against the final implementation";
  if (!sameAxes(report.reviews, fingerprint)) return "exactly separate Standards and Spec reviews must match the final implementation";
  if (report.reviews.some((review) => review.verdict === "unable-to-review"
    || (review.verdict === "no-findings" && review.findings.length !== 0)
    || (review.verdict === "findings" && review.findings.length === 0))) return "review verdicts must be usable and consistent with their findings";
  const findings = report.reviews.flatMap((review) => review.findings).map((finding) => finding.id);
  if (new Set(findings).size !== findings.length || findings.some((id) => !report.dispositions.some((disposition) => disposition.findingId === id))) return "every review finding requires a parent disposition";
  if (report.dispositions.some((disposition) => !findings.includes(disposition.findingId))) return "finding disposition has no reviewed finding";
  if (report.fixAndRereview.fixApplied && (!report.fixAndRereview.fixValidation?.length || report.fixAndRereview.fixValidation.some((item) => item.outcome !== "passed" || item.observedFingerprint !== fingerprint) || !report.fixAndRereview.focusedRereview || !sameAxes(report.fixAndRereview.focusedRereview, fingerprint))) return "applied fixes require final validation and focused separate re-review";
  if (Object.values(report.completionFidelity.criteria).some((criterion) => criterion === "unverified") || report.completionFidelity.claims.some((claim) => claim.verifiedBy !== "parent")) return "C1-C7 and claims must be parent verified or not applicable";
  if (["axis-missing", "combined", "self-review"].includes(report.diversity.achievedIndependence)) return "missing, combined, or self review cannot be degraded into completion";
  if (report.diversity.degraded && (!report.diversity.warning || report.diversity.acknowledgment?.decision !== "continue")) return "degraded completion requires a warning and continue acknowledgment";
  return undefined;
}

function nonPassingParentValidation(report: TeamOrchestrationEnvelopeV1): boolean {
  return report.parentValidation.some((validation) => validation.outcome !== "passed" && validation.observedFingerprint === report.implementation.fingerprint);
}

function replayableFailedStageObservation(report: TeamOrchestrationEnvelopeV1): boolean {
  return report.producerObservations.some((observation) => observation.summary.trim().length > 0
    && observation.locators.some((locator) => locator.trim().length > 0)
    && observation.replayCommands.some((command) => command.trim().length > 0));
}

function rejectedOrEscalatedParentGate(report: TeamOrchestrationEnvelopeV1): boolean {
  return ["rejected", "escalated"].includes(report.parentGate.action)
    && report.parentGate.observedFingerprint === report.implementation.fingerprint;
}

function retryFailure(report: TeamOrchestrationEnvelopeV1): string | undefined {
  const hasNextAttemptEvidence = report.implementation.changedPaths.some((path) => path.trim().length > 0)
    && report.residualRisks.some((risk) => risk.trim().length > 0);
  return rejectedOrEscalatedParentGate(report) && nonPassingParentValidation(report) && replayableFailedStageObservation(report) && hasNextAttemptEvidence
    ? undefined
    : "retry requires a rejected/escalated parent gate, final-fingerprint non-passing validation, replayable failed-stage observation, and explicit change/safety residual evidence";
}

function failureEvidenceFailure(report: TeamOrchestrationEnvelopeV1): string | undefined {
  const retrySafetyEvidence = report.residualRisks.some((risk) => risk.trim().length > 0);
  return rejectedOrEscalatedParentGate(report) && nonPassingParentValidation(report) && replayableFailedStageObservation(report) && retrySafetyEvidence
    ? undefined
    : "failed/blocked requires a rejected/escalated parent gate, final-fingerprint non-passing validation, replayable failed-stage observation, and explicit retry-safety residual evidence";
}

function decisionFailure(state: BatchRunState, report: TeamOrchestrationEnvelopeV1, activeTicket: RunTicket): string | undefined {
  const packet = report.decisionPacket;
  const knownIds = new Set(state.tickets.map((ticket) => ticket.id));
  return packet && packet.affectedTicketIds.includes(activeTicket.id) && packet.affectedWorkUnitIds.includes(activeTicket.id)
    && packet.affectedTicketIds.every((id) => knownIds.has(id)) && packet.affectedWorkUnitIds.every((id) => knownIds.has(id))
    && rejectedOrEscalatedParentGate(report)
    ? undefined
    : "needs_decision requires a complete packet tied only to known batch work units and a parent rejected/escalated gate";
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function combineText(existing: string, incoming: string): string {
  // Values produced by an earlier merge are delimiter-separated procedures;
  // split them again so repeated merges are associative and order-independent.
  return sortedUnique([existing, incoming].flatMap((value) => value.split("; then "))).join("; then ");
}

/**
 * Additive canonicalization for structurally equivalent owner decisions.
 * `occurrences` uses max: reports may search overlapping scopes, so summing
 * would over-count. A reliable count takes precedence over not-counted detail.
 */
function mergeDecisionPackets(existing: DecisionPacket, incoming: DecisionPacket): DecisionPacket {
  const counts = [existing.occurrences, incoming.occurrences].filter((value): value is number => typeof value === "number");
  const merged: DecisionPacket = {
    ...existing,
    affectedWorkUnitIds: sortedUnique([...existing.affectedWorkUnitIds, ...incoming.affectedWorkUnitIds]),
    affectedTicketIds: sortedUnique([...existing.affectedTicketIds, ...incoming.affectedTicketIds]),
    affectedFiles: sortedUnique([...existing.affectedFiles, ...incoming.affectedFiles]),
    representativeLocators: sortedUnique([...existing.representativeLocators, ...incoming.representativeLocators]),
    replayCommand: combineText(existing.replayCommand, incoming.replayCommand),
    disconfirmProcedure: combineText(existing.disconfirmProcedure, incoming.disconfirmProcedure),
    consequences: combineText(existing.consequences, incoming.consequences),
    unrelatedWorkSafe: existing.unrelatedWorkSafe && incoming.unrelatedWorkSafe,
  };
  if (counts.length > 0) {
    merged.occurrences = Math.max(...counts);
    delete merged.notCountedReason;
  } else {
    delete merged.occurrences;
    merged.notCountedReason = combineText(existing.notCountedReason!, incoming.notCountedReason!);
  }
  return merged;
}

/**
 * Parses and gates a report before mutating state.  This is deliberately the
 * extension-facing transition: applyOutcome remains the basic state-machine seam.
 */
export function applyEvidencedOutcome(state: BatchRunState, id: string, reportValue: unknown, expectedOutcome?: TicketOutcome): EvidencedOutcomeResult {
  const ticket = byId(state, id);
  if (!ticket || ticket.status !== "in_progress") return { ok: false, error: { code: "invalid-transition", message: "Only the active in-progress ticket can report." } };
  const parsed = parseTeamOrchestrationEnvelope(reportValue);
  if (!parsed.ok) return { ok: false, error: { code: "invalid-report", message: `${parsed.error.code}: ${parsed.error.message}` } };
  const report = parsed.value;
  if (report.workUnit.ticketId !== ticket.id || report.workUnit.source !== state.source || report.workUnit.sourceFingerprint !== state.fingerprint || report.workUnit.attempt !== ticket.attempts) return { ok: false, error: { code: "wrong-work-unit", message: "Report work-unit ticket, source fingerprint, or attempt does not match active state." } };
  if (expectedOutcome !== undefined && expectedOutcome !== report.requestedOutcome) return { ok: false, error: { code: "wrong-outcome", message: "Requested outcome does not match the structured report." } };
  const outcome: RequestedOutcome = report.requestedOutcome;
  let problem: string | undefined;
  if (outcome === "completed") problem = completionFailure(report);
  else if (outcome === "retry") problem = retryFailure(report);
  else if (outcome === "needs_decision") problem = decisionFailure(state, report, ticket);
  else problem = failureEvidenceFailure(report);
  if (problem) return { ok: false, error: { code: outcome === "completed" ? "completed-evidence-incomplete" : outcome === "retry" ? "retry-evidence-incomplete" : outcome === "needs_decision" ? "needs-decision-evidence-incomplete" : "failure-evidence-incomplete", message: problem } };

  // Leaving in_progress with an open lease would orphan mutation authority.
  // Non-completed outcomes therefore require a safe closed handoff when a lease is open,
  // and completed outcomes require a matching recorded lease (no self-asserted close).
  let closedHandoff: WriterLeaseEvidence | undefined;
  if (state.activeWriterLease) {
    const leaseCheck = reconcileBatchWriterLease(state);
    if (!leaseCheck.ok) return { ok: false, error: { code: "invalid-transition", message: `${leaseCheck.error.code}: ${leaseCheck.error.message}` } };
    if (report.writerLease.phase !== "closed") {
      return { ok: false, error: {
        code: outcome === "completed" ? "completed-evidence-incomplete" : "invalid-transition",
        message: "An open writer lease must be closed before the ticket leaves in_progress.",
      } };
    }
    if (report.writerLease.leaseId !== state.activeWriterLease.leaseId || report.writerLease.owner !== state.activeWriterLease.owner) {
      return { ok: false, error: { code: "invalid-report", message: "Report writer lease contradicts the active batch lease." } };
    }
    const closed = closeExclusiveWriterLease(state.activeWriterLease, {
      leaseId: report.writerLease.leaseId,
      owner: report.writerLease.owner,
      closedAt: report.writerLease.closedAt!,
      handoffFingerprint: report.writerLease.handoffFingerprint ?? report.implementation.fingerprint,
    });
    if (!closed.ok) return { ok: false, error: { code: "invalid-report", message: `${closed.error.code}: ${closed.error.message}` } };
    if (report.writerLease.handoffFingerprint && report.writerLease.handoffFingerprint !== closed.value.handoffFingerprint) {
      return { ok: false, error: { code: "invalid-report", message: "Report handoff fingerprint contradicts the closed lease handoff." } };
    }
    closedHandoff = closed.value;
  } else if (report.writerLease.phase === "closed") {
    const history = (state.writerLeaseHistory ?? (state.lastClosedWriterLease ? [state.lastClosedWriterLease] : []))
      .filter((entry) => entry.ticketId === ticket.id && entry.attempt === ticket.attempts);
    const match = history.find((entry) => closedLeaseMatches(report.writerLease, entry))
      ?? (state.lastClosedWriterLease && closedLeaseMatches(report.writerLease, state.lastClosedWriterLease) ? state.lastClosedWriterLease : undefined);
    if (match) {
      closedHandoff = structuredClone(match);
    } else if (outcome === "completed") {
      // Completion cannot invent a closed handoff the runtime never recorded.
      return { ok: false, error: {
        code: "completed-evidence-incomplete",
        message: "Self-asserted closed writer lease is not recorded in the batch lease lifecycle.",
      } };
    }
  } else if (outcome === "completed") {
    return { ok: false, error: { code: "completed-evidence-incomplete", message: "writer lease is not closed" } };
  }

  if (outcome === "completed" && report.fixAndRereview.fixApplied) {
    const history = (state.writerLeaseHistory ?? []).filter((entry) => entry.ticketId === ticket.id && entry.attempt === ticket.attempts);
    if (closedHandoff && !history.some((entry) => closedLeaseMatches(closedHandoff, entry))) history.push(closedHandoff);
    const fixLease = report.fixAndRereview.fixLease;
    if (!fixLease || !history.some((entry) => closedLeaseMatches(fixLease, entry))) {
      return { ok: false, error: { code: "completed-evidence-incomplete", message: "fixApplied requires a recorded closed fix-writer lease tied to the fix brief." } };
    }
    const implementationClosed = history.some((entry) => entry.ownerRole !== "fix-writer" && entry.phase === "closed");
    const fixClosedCount = history.filter((entry) => entry.ownerRole === "fix-writer" && entry.ticketId === ticket.id && entry.attempt === ticket.attempts).length;
    if (!implementationClosed || fixClosedCount !== 1) {
      return { ok: false, error: { code: "completed-evidence-incomplete", message: "Fix completion requires lease history proving implementation then exactly one fix round." } };
    }
  }

  // Build defensive provenance first, but do not commit it unless the status
  // transition succeeds. Keep prior pending retry evidence through later reports.
  const record: AcceptedReportRecord = { attempt: ticket.attempts, outcome, report: structuredClone(report) };
  const prior = ticket.evidence ?? { acceptedReports: [] };
  const packet = report.decisionPacket;
  const existing = packet && state.decisionIndex?.find((entry) => entry.key === decisionPacketEquivalenceKey(packet));
  const mergedPacket = packet && (existing ? mergeDecisionPackets(existing.packet, packet) : structuredClone(packet));
  const nextIndex = packet ? [
    ...(state.decisionIndex ?? []).filter((entry) => entry.key !== decisionPacketEquivalenceKey(packet)).map((entry) => structuredClone(entry)),
    { key: decisionPacketEquivalenceKey(packet), packet: mergedPacket! },
  ] : state.decisionIndex;
  const evidence: TicketEvidenceState = {
    acceptedReports: [...prior.acceptedReports.map((accepted) => structuredClone(accepted)), record],
    pendingEvidence: outcome === "retry" ? structuredClone(report) : prior.pendingEvidence && structuredClone(prior.pendingEvidence),
    pendingDecision: outcome === "needs_decision" ? structuredClone(mergedPacket!) : prior.pendingDecision && structuredClone(prior.pendingDecision),
  };
  let nextPilotLedger = state.pilotLedger;
  if (report.eligibility.lane === "worker" && report.eligibility.pilotMember) {
    try {
      nextPilotLedger = recordPilotRow(state.pilotLedger ?? createPilotLedger(), derivePilotRow(report, report.pilotMetrics));
    } catch {
      return { ok: false, error: { code: "invalid-report", message: "Pilot evidence could not be retained safely." } };
    }
  }
  const transitioned = applyOutcome(state, id, outcome, reportNote({ ...report, decisionPacket: mergedPacket }));
  if (!transitioned) return { ok: false, error: { code: "invalid-transition", message: "Ticket could not transition." } };
  transitioned.evidence = evidence;
  // A pilot-member worker report always becomes a retained row. Missing metrics
  // deliberately derive an incomplete/non-clean row rather than fake telemetry.
  state.pilotLedger = nextPilotLedger;
  state.decisionIndex = nextIndex;
  if (closedHandoff) {
    appendClosedLeaseHistory(state, closedHandoff);
    delete state.activeWriterLease;
  }
  if (mergedPacket) {
    const key = decisionPacketEquivalenceKey(mergedPacket);
    // Earlier escalations retain their original accepted envelopes, but their
    // derived presentation and pending canonical packet must converge.
    for (const affected of state.tickets) {
      if (affected.evidence?.pendingDecision && decisionPacketEquivalenceKey(affected.evidence.pendingDecision) === key) {
        affected.evidence.pendingDecision = structuredClone(mergedPacket);
        affected.note = decisionNote(mergedPacket);
      }
    }
  }
  return { ok: true, ticket: transitioned };
}

/** Deterministic recovery guidance for legacy entries that have no V1 evidence. */
export function recoveryGuidance(ticket: RunTicket): string | undefined {
  if (ticket.evidence) return undefined;
  return "Legacy batch entry has no version-1 evidence: re-gate, revalidate, and re-review before terminal reporting.";
}

export function applyOutcome(
  state: BatchRunState,
  id: string,
  outcome: TicketOutcome,
  note?: string,
): RunTicket | undefined {
  const ticket = byId(state, id);
  if (!ticket || ticket.status !== "in_progress") return undefined;
  ticket.note = note;
  switch (outcome) {
    case "completed":
      ticket.status = "completed";
      break;
    case "retry":
      ticket.status = ticket.attempts >= state.maxAttempts ? "failed" : "queued";
      if (ticket.status === "failed") ticket.note = note ?? "Exhausted retry attempts.";
      break;
    case "failed":
      ticket.status = "failed";
      break;
    case "blocked":
      ticket.status = "blocked";
      break;
    case "needs_decision":
      ticket.status = "needs_decision";
      break;
  }
  state.updatedAt = Date.now();
  propagateSkips(state);
  return ticket;
}

export function summarize(state: BatchRunState): Record<TicketRunStatus, number> {
  const summary: Record<TicketRunStatus, number> = {
    queued: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
    needs_decision: 0,
    skipped: 0,
  };
  for (const t of state.tickets) summary[t.status] += 1;
  return summary;
}

export function isTerminal(state: BatchRunState): boolean {
  propagateSkips(state);
  return !state.tickets.some((t) => t.status === "queued" || t.status === "in_progress");
}

export function inProgressTicket(state: BatchRunState): RunTicket | undefined {
  return state.tickets.find((t) => t.status === "in_progress");
}

export function stopReason(state: BatchRunState): StopReason {
  if (!state.active) return "inactive";
  if (isTerminal(state)) {
    if (state.tickets.some((t) => t.status === "needs_decision")) return "needs_decision";
    if (state.tickets.some((t) => t.status === "blocked" || t.status === "failed")) return "blocked";
    return "completed";
  }
  // A ticket still in progress means the agent should keep working it.
  if (inProgressTicket(state)) return "running";
  if (state.continuationsUsed >= state.maxContinuations) return "max_continuations";
  // Non-terminal, nothing in progress, nothing actionable: everything left waits
  // on a decision/blocker. Surface that instead of looping forever.
  if (!nextActionableTicket(state)) {
    if (state.tickets.some((t) => t.status === "needs_decision")) return "needs_decision";
    return "blocked";
  }
  return "running";
}

export function shouldContinue(state: BatchRunState): boolean {
  if (!state.active || state.continuationsUsed >= state.maxContinuations) return false;
  return !!inProgressTicket(state) || !!nextActionableTicket(state);
}

export function recordContinuation(state: BatchRunState): void {
  state.continuationsUsed += 1;
  state.updatedAt = Date.now();
}

export function deactivate(state: BatchRunState, reason?: string): void {
  state.active = false;
  if (reason) {
    for (const t of state.tickets) {
      if (t.status === "in_progress" || t.status === "queued") {
        t.status = t.status === "in_progress" ? "queued" : t.status;
      }
    }
  }
  // Source-change/stop paths must explicitly revoke mutation authority rather than
  // leave an open lease orphaned against a non-in_progress ticket.
  if (state.activeWriterLease) {
    delete state.activeWriterLease;
  }
  state.updatedAt = Date.now();
}
