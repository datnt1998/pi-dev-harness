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

export type RunTicket = {
  id: string;
  dependencies: string[];
  status: TicketRunStatus;
  attempts: number;
  note?: string;
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
    if (ticket.status === "in_progress") inProgress += 1;
    ids.add(ticket.id);
  }
  if (inProgress > 1 || state.order.length !== ids.size || !state.order.every((id) => ids.has(id))) return false;
  return state.tickets.every((ticket) => ticket.dependencies.every((id) => id !== ticket.id && ids.has(id)));
}

export function createRunState(input: CreateRunInput): BatchRunState {
  const now = input.now ?? Date.now();
  const ids = new Set(input.tickets.map((t) => t.id));
  const tickets: RunTicket[] = input.tickets.map((t) => ({
    id: t.id,
    dependencies: t.dependencies.filter((d) => ids.has(d) && d !== t.id),
    status: "queued",
    attempts: 0,
  }));
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
    order: input.order.filter((id) => ids.has(id)),
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
