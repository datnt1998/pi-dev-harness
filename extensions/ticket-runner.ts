import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { CONTINUATION_EVENT, continuationRegistry } from "../lib/continuation-event.ts";
import { manifestSource, parseImplementArgs } from "../lib/ticket-runner-input.ts";
import { analyzeBatch, fingerprint, isRunnable, parseTickets } from "../lib/ticket-readiness.ts";
import {
  applyOutcome,
  type BatchRunState,
  createRunState,
  deactivate,
  inProgressTicket,
  isBatchRunState,
  nextActionableTicket,
  recordContinuation,
  shouldContinue,
  startTicket,
  stopReason,
  summarize,
} from "../lib/ticket-runner-state.ts";

const STATE_ENTRY = "ticket-batch-state";
const STATUS_KEY = "ticket-batch";
let current: BatchRunState | undefined;
let continuationPending = false;

function resolvePath(ctx: ExtensionContext, path: string): string {
  return isAbsolute(path) ? path : resolve(ctx.cwd, path);
}

function readSource(ctx: ExtensionContext, path: string): string {
  return readFileSync(resolvePath(ctx, path), "utf8");
}

function repoScripts(ctx: ExtensionContext): string[] {
  try {
    const pkg = JSON.parse(readFileSync(resolve(ctx.cwd, "package.json"), "utf8"));
    return Object.keys(pkg.scripts ?? {}).map((s) => `npm run ${s}`);
  } catch {
    return [];
  }
}

function persist(pi: ExtensionAPI) {
  if (current) pi.appendEntry(STATE_ENTRY, current as unknown as Record<string, unknown>);
}

function reconstruct(ctx: ExtensionContext) {
  current = undefined;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "custom" && entry.customType === STATE_ENTRY && isBatchRunState(entry.data)) {
      current = entry.data;
    }
  }
}

function setStatus(ctx: ExtensionContext) {
  if (ctx.mode !== "tui") return;
  if (!current || !current.active) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  const s = summarize(current);
  const done = s.completed;
  const total = current.tickets.length;
  const active = nextActionableTicket(current)?.id ?? "—";
  ctx.ui.setStatus(
    STATUS_KEY,
    ctx.ui.theme.fg("accent", `batch ${done}/${total}`) + ctx.ui.theme.fg("dim", ` · ${active}`),
  );
}

function statusReport(state: BatchRunState, verbose = false): string {
  const s = summarize(state);
  const summary = `batch ${state.batchId} · ${s.completed}/${state.tickets.length} done · q${s.queued}/run${s.in_progress}/fail${s.failed}/block${s.blocked}/decision${s.needs_decision}/skip${s.skipped} · stop=${stopReason(state)} · commit=${state.commit}`;
  if (!verbose) return summary;
  return [
    summary,
    `source: ${state.source}`,
    `continuations ${state.continuationsUsed}/${state.maxContinuations}`,
    ...state.tickets.map((ticket) => `  ${ticket.id} ${ticket.status}${ticket.note ? ` — ${ticket.note}` : ""}`),
  ].join("\n");
}

function sourceIsCurrent(ctx: ExtensionContext, state: BatchRunState): boolean {
  try {
    return fingerprint(readSource(ctx, state.source)) === state.fingerprint;
  } catch {
    return false;
  }
}

function ticketRaw(ctx: ExtensionContext, state: BatchRunState, id: string): string {
  try {
    const tickets = parseTickets(readSource(ctx, state.source));
    return tickets.find((t) => t.id === id)?.raw ?? `(ticket ${id} not found in source)`;
  } catch {
    return `(unable to read source ${state.source})`;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    reconstruct(ctx);
    continuationPending = false;
    setStatus(ctx);
  });
  pi.on("session_tree", (_event, ctx) => {
    reconstruct(ctx);
    setStatus(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    continuationPending = false;
    try {
      pi.events.emit(CONTINUATION_EVENT, continuationRegistry.announce("ticket-runner", current?.batchId ?? "session", false));
    } catch {
      // Best-effort coordination cleanup.
    }
    if (ctx.mode === "tui") ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  // Guarded autonomous continuation: keep working the batch across turns without
  // per-ticket confirmation, but never loop past the guard or when work is blocked.
  pi.on("agent_settled", (_event, ctx) => {
    if (!current || !current.active) return;
    if (continuationPending) return;
    if (!ctx.isIdle()) return;
    if (typeof ctx.hasPendingMessages === "function" && ctx.hasPendingMessages()) return;

    const reason = stopReason(current);
    if (reason !== "running" || !shouldContinue(current)) {
      // If work remains but the continuation guard was hit, report it clearly
      // instead of the misleading "running".
      const effectiveReason = reason === "running" ? "max_continuations" : reason;
      current.active = false;
      persist(pi);
      setStatus(ctx);
      if (ctx.mode === "tui") {
        ctx.ui.notify(`Ticket batch stopped: ${effectiveReason}. Run /implementation-status.`, effectiveReason === "completed" ? "info" : "warning");
      }
      return;
    }

    recordContinuation(current);
    persist(pi);
    continuationPending = true;
    // Announce the planned follow-up synchronously so same-event consumers
    // (pi-memory) defer their own work (harness:continuation:v1).
    try {
      pi.events.emit(CONTINUATION_EVENT, continuationRegistry.announce("ticket-runner", current.batchId, true));
    } catch {
      // Coordination is best-effort; the runner must keep working without consumers.
    }
    pi.sendUserMessage(
      "/skill:batch-implementation continue the active ticket batch: call batch_next, implement one ticket with review/fix, then batch_report.",
      { deliverAs: "followUp" },
    );
  });

  pi.on("turn_start", () => {
    continuationPending = false;
    // Turn boundary: clear any planned-continuation announcement.
    try {
      pi.events.emit(CONTINUATION_EVENT, continuationRegistry.announce("ticket-runner", current?.batchId ?? "session", false));
    } catch {
      // Best-effort.
    }
  });

  pi.registerCommand("implement-all", {
    description: "Autonomously implement all runnable tickets from a readiness manifest or ticket file. Append --commit to allow per-ticket commits.",
    handler: async (args, ctx) => {
      const { path, commit } = parseImplementArgs(args);
      if (!path) {
        ctx.ui.notify("Usage: /implement-all <manifest-or-tickets-path> [--commit]", "error");
        return;
      }

      let sourcePath = path;
      let raw: string;
      try {
        raw = readSource(ctx, path);
      } catch (error) {
        ctx.ui.notify(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }

      // If given a manifest, resolve and re-fingerprint the underlying source.
      const declaredSource = manifestSource(raw);
      if (declaredSource) {
        sourcePath = declaredSource;
        try {
          raw = readSource(ctx, sourcePath);
        } catch (error) {
          ctx.ui.notify(`Manifest source ${sourcePath} unreadable: ${error instanceof Error ? error.message : String(error)}`, "error");
          return;
        }
      }

      const analysis = analyzeBatch(raw, { repoScripts: repoScripts(ctx) });
      if (analysis.warnings.length > 0) {
        ctx.ui.notify(`Ticket source malformed; batch not started:\n${analysis.warnings.join("\n")}`, "error");
        return;
      }
      const runnable = analysis.tickets.filter((t) => isRunnable(t.status));
      const notRunnable = analysis.tickets.filter((t) => !isRunnable(t.status));
      if (runnable.length === 0) {
        ctx.ui.notify("No runnable tickets. Run /prepare-tickets first to gate them.", "error");
        return;
      }
      // One invocation approves all runnable work. Gated tickets are excluded
      // without another confirmation; independent approved work should proceed.

      const runnableIds = new Set(runnable.map((t) => t.id));
      current = createRunState({
        batchId: `batch-${Date.now().toString(36)}`,
        source: sourcePath,
        fingerprint: fingerprint(raw),
        order: analysis.order.filter((id) => runnableIds.has(id)),
        tickets: runnable.map((t) => ({ id: t.id, dependencies: t.dependencies.filter((d) => runnableIds.has(d)) })),
        commit,
      });
      persist(pi);
      setStatus(ctx);
      ctx.ui.notify(
        `Batch started: ${runnable.length} runnable${notRunnable.length ? ` · ${notRunnable.length} gated` : ""} · commit=${commit}.`,
        notRunnable.length ? "warning" : "info",
      );

      try {
        pi.events.emit(CONTINUATION_EVENT, continuationRegistry.announce("ticket-runner", current.batchId, true));
      } catch {
        // Best-effort.
      }
      pi.sendUserMessage(
        `/skill:batch-implementation A pre-approved ticket batch is active (source ${sourcePath}, commit=${commit}). The parent is the sole writer: call batch_next, then implement and validate. If pi-subagents is available, run an async fresh-context review-only reviewer; otherwise run the skill's explicit structured self-review fallback and record that independent isolation was unavailable. Apply scoped fixes in the parent, then call batch_report with evidence. Continue until batch_next reports done or a decision is required. Do not ask for per-ticket confirmation.`,
        { deliverAs: ctx.isIdle() ? undefined : "followUp" },
      );
    },
  });

  pi.registerCommand("implementation-status", {
    description: "Show ticket batch status. Append --verbose for per-ticket detail.",
    handler: async (args, ctx) => {
      reconstruct(ctx);
      if (!current) {
        ctx.ui.notify("No ticket batch in this session.", "info");
        return;
      }
      const report = statusReport(current, args.trim() === "--verbose");
      pi.appendEntry("ticket-batch-report", { text: report, at: Date.now() });
      ctx.ui.notify(report, "info");
    },
  });

  pi.registerCommand("implement-all-stop", {
    description: "Stop and deactivate the current autonomous ticket batch.",
    handler: async (_args, ctx) => {
      if (!current) {
        ctx.ui.notify("No active ticket batch.", "info");
        return;
      }
      deactivate(current);
      persist(pi);
      setStatus(ctx);
      ctx.ui.notify("Ticket batch stopped.", "info");
    },
  });

  pi.registerTool({
    name: "batch_next",
    label: "Batch Next Ticket",
    description: "Return the next actionable ticket in the active pre-approved batch and mark it in progress. Reports done/blocked when nothing is actionable.",
    promptSnippet: "Get the next ticket to implement in the active ticket batch",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      reconstruct(ctx);
      if (!current || !current.active) {
        return { content: [{ type: "text", text: "No active ticket batch." }], details: {} };
      }
      if (!sourceIsCurrent(ctx, current)) {
        deactivate(current, "source_changed");
        persist(pi);
        setStatus(ctx);
        return { content: [{ type: "text", text: "Batch stopped: source changed; re-gate and restart." }], details: { stop: "source_changed" } };
      }
      // Resume a ticket already in progress instead of starting a new one.
      const resuming = inProgressTicket(current);
      if (resuming) {
        setStatus(ctx);
        return {
          content: [
            {
              type: "text",
              text: `Resume ticket ${resuming.id} (attempt ${resuming.attempts}). commit=${current.commit}.\n\n${ticketRaw(ctx, current, resuming.id)}\n\nAs the sole parent writer, finish implement/validate/fresh-review/scoped-fix, then call batch_report with evidence.`,
            },
          ],
          details: { id: resuming.id, attempt: resuming.attempts, commit: current.commit, resumed: true },
        };
      }
      const reason = stopReason(current);
      const next = nextActionableTicket(current);
      if (!next || reason !== "running") {
        return {
          content: [{ type: "text", text: `Batch not actionable (stop=${reason}).\n\n${statusReport(current)}` }],
          details: { stop: reason },
        };
      }
      startTicket(current, next.id);
      persist(pi);
      setStatus(ctx);
      return {
        content: [
          {
            type: "text",
            text: `Work ticket ${next.id} (attempt ${next.attempts}). commit=${current.commit}.\n\n${ticketRaw(ctx, current, next.id)}\n\nAs the sole parent writer, run implement/validate/fresh-review/scoped-fix, then call batch_report with evidence.`,
          },
        ],
        details: { id: next.id, attempt: next.attempts, commit: current.commit },
      };
    },
  });

  pi.registerTool({
    name: "batch_report",
    label: "Batch Report Outcome",
    description: "Report the terminal outcome of the current ticket. Use retry to re-attempt within the retry cap. Use needs_decision or blocked to escalate without guessing.",
    promptSnippet: "Report the outcome of a ticket in the active ticket batch",
    parameters: Type.Object({
      id: Type.String({ description: "Ticket id, e.g. T2" }),
      outcome: StringEnum(["completed", "retry", "failed", "blocked", "needs_decision"] as const),
      note: Type.Optional(Type.String({ description: "Evidence, blocker, or decision needed" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      reconstruct(ctx);
      if (!current || !current.active) {
        return { content: [{ type: "text", text: "No active ticket batch." }], details: {} };
      }
      const activeTicket = inProgressTicket(current);
      if (!activeTicket || activeTicket.id !== params.id) {
        return { content: [{ type: "text", text: `Outcome rejected: ${params.id} is not the active in-progress ticket.` }], details: { id: params.id, stop: "invalid_transition" } };
      }
      if (!sourceIsCurrent(ctx, current)) {
        deactivate(current, "source_changed");
        persist(pi);
        setStatus(ctx);
        return { content: [{ type: "text", text: "Batch stopped: source changed; result not recorded." }], details: { stop: "source_changed" } };
      }
      const ticket = applyOutcome(current, params.id, params.outcome, params.note);
      if (!ticket) {
        return { content: [{ type: "text", text: `Unknown ticket ${params.id}.` }], details: {}, };
      }
      const reason = stopReason(current);
      if (reason !== "running") current.active = false;
      persist(pi);
      setStatus(ctx);
      return {
        content: [{ type: "text", text: `Recorded ${params.id} → ${ticket.status}. stop=${reason}.\n\n${statusReport(current)}` }],
        details: { id: params.id, status: ticket.status, stop: reason },
      };
    },
  });
}
