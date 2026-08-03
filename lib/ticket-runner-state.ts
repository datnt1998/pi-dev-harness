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
  parseTeamOrchestrationEnvelope,
  type RequestedOutcome,
  type TeamOrchestrationEnvelopeV1,
} from "./team-orchestration-protocol.ts";

export type AcceptedReportRecord = {
  attempt: number;
  outcome: Exclude<TicketOutcome, "needs_decision">;
  report: TeamOrchestrationEnvelopeV1;
};

export type TicketEvidenceState = {
  /** Accepted reports are append-only provenance for interrupted/resumed work. */
  acceptedReports: AcceptedReportRecord[];
  /** A retry leaves its failed/incomplete evidence available to the next attempt. */
  pendingEvidence?: TeamOrchestrationEnvelopeV1;
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
          || !["completed", "retry", "failed", "blocked"].includes(record.outcome)) return false;
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
    }
    if (ticket.status === "in_progress") inProgress += 1;
    ids.add(ticket.id);
  }
  if (inProgress > 1 || state.order.length !== ids.size || !state.order.every((id) => ids.has(id))) return false;
  return state.tickets.every((ticket) => ticket.dependencies.every((id) => id !== ticket.id && ids.has(id)));
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

/** The next queued ticket, in order, whose dependencies are all completed. */
export function nextActionableTicket(state: BatchRunState): RunTicket | undefined {
  propagateSkips(state);
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
  | "needs-decision-requires-t3"
  | "invalid-transition";

export type EvidencedOutcomeResult =
  | { ok: true; ticket: RunTicket }
  | { ok: false; error: { code: EvidencedOutcomeFailureCode; message: string } };

function runRouteFact(label: string, run: TeamOrchestrationEnvelopeV1["runs"][number] | undefined): string {
  if (!run) return `${label}=unknown (fallback unknown; thinking unknown)`;
  const model = run.provider.model ? `/${run.provider.model}` : "";
  return `${label}=${run.provider.provider}${model} (fallback ${run.provider.fallback ? "yes" : "no"}; thinking ${run.provider.effectiveThinking ?? "unknown"})`;
}

function reportNote(report: TeamOrchestrationEnvelopeV1): string {
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
  if (report.requestedOutcome === "needs_decision") return { ok: false, error: { code: "needs-decision-requires-t3", message: "Structured needs_decision reporting requires T3 decision-packet support." } };
  if (expectedOutcome !== undefined && expectedOutcome !== report.requestedOutcome) return { ok: false, error: { code: "wrong-outcome", message: "Requested outcome does not match the structured report." } };
  const outcome: Exclude<RequestedOutcome, "needs_decision"> = report.requestedOutcome;
  let problem: string | undefined;
  if (outcome === "completed") problem = completionFailure(report);
  else if (outcome === "retry") problem = retryFailure(report);
  else problem = failureEvidenceFailure(report);
  if (problem) return { ok: false, error: { code: outcome === "completed" ? "completed-evidence-incomplete" : outcome === "retry" ? "retry-evidence-incomplete" : "failure-evidence-incomplete", message: problem } };

  // Build defensive provenance first, but do not commit it unless the status
  // transition succeeds. Keep prior pending retry evidence through later reports.
  const record: AcceptedReportRecord = { attempt: ticket.attempts, outcome, report: structuredClone(report) };
  const prior = ticket.evidence ?? { acceptedReports: [] };
  const evidence: TicketEvidenceState = {
    acceptedReports: [...prior.acceptedReports.map((accepted) => structuredClone(accepted)), record],
    pendingEvidence: outcome === "retry" ? structuredClone(report) : prior.pendingEvidence && structuredClone(prior.pendingEvidence),
  };
  const transitioned = applyOutcome(state, id, outcome, reportNote(report));
  if (!transitioned) return { ok: false, error: { code: "invalid-transition", message: "Ticket could not transition." } };
  transitioned.evidence = evidence;
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
  state.updatedAt = Date.now();
}
