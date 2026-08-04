import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { CONTINUATION_EVENT, continuationRegistry } from "../lib/continuation-event.ts";
import { manifestSource, parseImplementArgs } from "../lib/ticket-runner-input.ts";
import { analyzeBatch, fingerprint, isRunnable, parseTickets } from "../lib/ticket-readiness.ts";
import type { ActiveWriterLease, FixBriefEvidence, FindingDispositionEvidence } from "../lib/team-orchestration-protocol.ts";
import { effectiveWriterLane, renderPilotReport, renderPilotStatus } from "../lib/team-orchestration-pilot.ts";
import {
  acquireBatchWriterLease,
  applyEvidencedOutcome,
  assertBatchReviewAllowed,
  type BatchRunState,
  closeBatchWriterLease,
  createRunState,
  deactivate,
  inProgressTicket,
  isBatchRunState,
  nextActionableTicket,
  reconcileBatchWriterLease,
  recordContinuation,
  recoveryGuidance,
  shouldContinue,
  startTicket,
  stopReason,
  summarize,
} from "../lib/ticket-runner-state.ts";

const STATE_ENTRY = "ticket-batch-state";
const STATUS_KEY = "ticket-batch";

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

function statusReport(state: BatchRunState, verbose = false): string {
  const s = summarize(state);
  const summary = `batch ${state.batchId} · ${s.completed}/${state.tickets.length} done · q${s.queued}/run${s.in_progress}/fail${s.failed}/block${s.blocked}/decision${s.needs_decision}/skip${s.skipped} · stop=${stopReason(state)} · commit=${state.commit}`;
  const pilot = state.pilotLedger ? `\n${verbose ? renderPilotReport(state.pilotLedger, state.workerLaneControl) : renderPilotStatus(state.pilotLedger, state.workerLaneControl)}` : "";
  if (!verbose) return summary + pilot;
  return [
    summary,
    `source: ${state.source}`,
    `continuations ${state.continuationsUsed}/${state.maxContinuations}`,
    ...state.tickets.map((ticket) => `  ${ticket.id} ${ticket.status}${ticket.note ? ` — ${ticket.note}` : ""}${recoveryGuidance(ticket) ? ` — ${recoveryGuidance(ticket)}` : ""}`),
    state.pilotLedger ? renderPilotReport(state.pilotLedger, state.workerLaneControl) : "",
  ].filter(Boolean).join("\n");
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

function leaseCoaching(resumed: boolean): string {
  const lead = resumed
    ? "Preserve eligibility and the exclusive writer lease for this worktree."
    : "Record explicit eligibility and acquire one exclusive writer lease via batch_writer_lease.";
  return `${lead} Implement and parent-validate under that lease, close the stable writer handoff with batch_writer_lease before review, confirm review_allowed, collect separate fresh sealed Standards and Spec evidence with actual provenance and any required pre-stage degradation acknowledgment, parent-dispose findings, allow at most one bounded fix-worker round with revalidation/focused re-review when substantial, then call batch_report with evidence matching the recorded lease lifecycle.`;
}

export default function (pi: ExtensionAPI) {
  // State belongs to this extension instance; module-level state would leak
  // batches across multiple hosts or test instances.
  let current: BatchRunState | undefined;
  let continuationPending = false;

  function persist() {
    if (current) pi.appendEntry(STATE_ENTRY, structuredClone(current) as unknown as Record<string, unknown>);
  }

  function reconstruct(ctx: ExtensionContext) {
    current = undefined;
    const snapshots = ctx.sessionManager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === STATE_ENTRY);
    if (snapshots.length === 0) return;
    const latest = snapshots.at(-1)!;
    if (!isBatchRunState(latest.data)) {
      // Persisted authority is append-only: never roll back past a corrupt newest snapshot.
      const candidate = latest.data as Partial<BatchRunState>;
      if (candidate && typeof candidate === "object" && candidate.version === 1 && typeof candidate.batchId === "string") {
        current = createRunState({
          batchId: candidate.batchId,
          source: typeof candidate.source === "string" ? candidate.source : "invalid-state",
          fingerprint: typeof candidate.fingerprint === "string" ? candidate.fingerprint : "invalid-state",
          order: [],
          tickets: [],
        });
        current.active = false;
      }
      return;
    }
    current = structuredClone(latest.data);
    const lease = reconcileBatchWriterLease(current);
    if (!lease.ok) deactivate(current, `lease_${lease.error.code}`);
  }

  function setStatus(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;
    if (!current || !current.active) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const s = summarize(current);
    const active = nextActionableTicket(current)?.id ?? "—";
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", `batch ${s.completed}/${current.tickets.length}`) + ctx.ui.theme.fg("dim", ` · ${active}`));
  }

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
      persist();
      setStatus(ctx);
      if (ctx.mode === "tui") {
        ctx.ui.notify(`Ticket batch stopped: ${effectiveReason}. Run /implementation-status.`, effectiveReason === "completed" ? "info" : "warning");
      }
      return;
    }

    recordContinuation(current);
    persist();
    continuationPending = true;
    // Announce the planned follow-up synchronously so same-event consumers
    // (pi-memory) defer their own work (harness:continuation:v1).
    try {
      pi.events.emit(CONTINUATION_EVENT, continuationRegistry.announce("ticket-runner", current.batchId, true));
    } catch {
      // Coordination is best-effort; the runner must keep working without consumers.
    }
    pi.sendUserMessage(
      "/skill:batch-implementation continue the active ticket batch: call batch_next, record eligibility, acquire/close the exclusive writer lease through batch_writer_lease, implement one ticket, collect separate sealed Standards and Spec review axes only after review_allowed, parent-dispose findings, allow at most one bounded fix-worker round, then batch_report.",
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
      persist();
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
        `/skill:batch-implementation A pre-approved ticket batch is active (source ${sourcePath}, commit=${commit}). Record an explicit parent eligibility decision and acquire one exclusive writer lease via batch_writer_lease for the active worktree (parent lane by default; worker lane only for frozen, reversible, explicitly scoped pilot work with a parent-known falsifiable bar). Call batch_next, then implement and validate under that lease. If pi-subagents is available, use it only within that exclusive lease and never as a second concurrent writer. Close the writer handoff through batch_writer_lease and record one stable implementation fingerprint before review—use batch_writer_lease action review_allowed; reviewers never acquire mutation authority. Require separate fresh Standards and Spec review calls against that fingerprint; each must prove read-only capability sealing or serialized pre/post mutation fingerprints. Before an affected review stage, compare the target with configured/resolved provenance. Record actual provider/model, fallback, effective-model, and effective-thinking confidence—not requested routes. For provider overlap, fallback, or unknown effective model/thinking, display the complete degraded-topology warning and require an explicit operator continue acknowledgment before launch; persist and repeat it in terminal evidence, and never call it independent or clean pilot evidence. If sealed subagents are unavailable, a structured self-review fallback may aid diagnosis but cannot authorize high-risk/package-policy completion or independence. Missing, combined, self, stale, unsealed, or mutated reviews fail closed. Parent-dispose every finding with replay evidence before any fix lease; permit at most one bounded fix-worker round via batch_writer_lease, then parent-revalidate and focused re-review when substantial. A second substantial fix, repeated finding, or semantic conflict escalates. Parent implementation after delegation must be explicit rework/strong-route evidence. Then call batch_report with structured evidence that matches the recorded lease lifecycle—self-asserted closed leases are rejected. Continue until batch_next reports done or a decision is required. Do not ask for per-ticket confirmation.`,
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
      persist();
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
        persist();
        setStatus(ctx);
        return { content: [{ type: "text", text: "Batch stopped: source changed; re-gate and restart." }], details: { stop: "source_changed" } };
      }
      const lease = reconcileBatchWriterLease(current);
      if (!lease.ok) {
        deactivate(current, `lease_${lease.error.code}`);
        persist();
        setStatus(ctx);
        return { content: [{ type: "text", text: `Batch stopped: writer lease ${lease.error.code}; ${lease.error.message}` }], details: { stop: "lease_conflict", code: lease.error.code } };
      }
      // Resume a ticket already in progress instead of starting a new one.
      const resuming = inProgressTicket(current);
      if (resuming) {
        setStatus(ctx);
        return {
          content: [
            {
              type: "text",
              text: `Resume ticket ${resuming.id} (attempt ${resuming.attempts}). commit=${current.commit}.\n\n${ticketRaw(ctx, current, resuming.id)}\n\n${leaseCoaching(true)}`,
            },
          ],
          details: { id: resuming.id, attempt: resuming.attempts, commit: current.commit, resumed: true, activeWriterLease: current.activeWriterLease },
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
      persist();
      setStatus(ctx);
      return {
        content: [
          {
            type: "text",
            text: `Work ticket ${next.id} (attempt ${next.attempts}). commit=${current.commit}.\n\n${ticketRaw(ctx, current, next.id)}\n\n${leaseCoaching(false)}`,
          },
        ],
        details: { id: next.id, attempt: next.attempts, commit: current.commit },
      };
    },
  });

  // Provider-agnostic lease seam: acquire, close/handoff, reconcile, review guard.
  pi.registerTool({
    name: "batch_writer_lease",
    label: "Batch Writer Lease",
    description: "Acquire, close/handoff, reconcile, or check review_allowed for the exclusive active-worktree writer lease. Reviewers never acquire mutation authority.",
    promptSnippet: "Manage the exclusive writer lease for the active ticket batch",
    parameters: Type.Object({
      action: StringEnum(["acquire", "close", "reconcile", "review_allowed"] as const),
      leaseId: Type.Optional(Type.String({ description: "Lease id for acquire/close" })),
      owner: Type.Optional(Type.String({ description: "Lease owner actor id" })),
      ownerRole: Type.Optional(StringEnum(["parent", "worker", "fix-writer"] as const)),
      phase: Type.Optional(StringEnum(["implementation", "fix"] as const)),
      worktreeKey: Type.Optional(Type.String({ description: "Exclusive worktree/mutation domain key" })),
      allowedPaths: Type.Optional(Type.Array(Type.String(), { description: "Paths the writer may mutate" })),
      openedAt: Type.Optional(Type.String({ description: "ISO timestamp when the lease opened" })),
      closedAt: Type.Optional(Type.String({ description: "ISO timestamp when the lease closed" })),
      handoffFingerprint: Type.Optional(Type.String({ description: "Parent-observed stable implementation fingerprint at close" })),
      fixBriefId: Type.Optional(Type.String({ description: "Parent fix brief id when phase is fix" })),
      implementationScopePaths: Type.Optional(Type.Array(Type.String(), { description: "Eligibility/allowed implementation scope containing lease paths" })),
      dispositions: Type.Optional(Type.Any({ description: "Parent finding dispositions required before a fix lease" })),
      fixBrief: Type.Optional(Type.Any({ description: "Parent fix brief required before a fix lease" })),
      priorFixRounds: Type.Optional(Type.Number({ description: "Prior ordinary fix rounds already consumed" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      reconstruct(ctx);
      if (!current || !current.active) {
        return { content: [{ type: "text", text: "No active ticket batch." }], details: {} };
      }
      if (!sourceIsCurrent(ctx, current)) {
        deactivate(current, "source_changed");
        persist();
        setStatus(ctx);
        return { content: [{ type: "text", text: "Batch stopped: source changed; lease not mutated." }], details: { stop: "source_changed" } };
      }

      if (params.action === "reconcile") {
        const result = reconcileBatchWriterLease(current);
        if (!result.ok) {
          deactivate(current, `lease_${result.error.code}`);
          persist();
          setStatus(ctx);
          return { content: [{ type: "text", text: `Lease reconcile failed: ${result.error.code}: ${result.error.message}` }], details: { ok: false, code: result.error.code } };
        }
        return {
          content: [{ type: "text", text: result.lease ? `Active writer lease ${result.lease.leaseId} (${result.lease.ownerRole}/${result.lease.phase}).` : "No active writer lease." }],
          details: { ok: true, activeWriterLease: result.lease, lastClosedWriterLease: current.lastClosedWriterLease, writerLeaseHistory: current.writerLeaseHistory ?? [] },
        };
      }

      if (params.action === "review_allowed") {
        const result = assertBatchReviewAllowed(current);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Review not allowed: ${result.error.message}` }], details: { ok: false, code: result.error.code } };
        }
        return { content: [{ type: "text", text: "Review allowed: no open writer lease." }], details: { ok: true } };
      }

      if (params.action === "acquire") {
        if (!params.leaseId || !params.owner || !params.ownerRole || !params.phase || !params.worktreeKey || !params.allowedPaths?.length || !params.openedAt) {
          return { content: [{ type: "text", text: "Lease acquire rejected: leaseId, owner, ownerRole, phase, worktreeKey, allowedPaths, and openedAt are required." }], details: { ok: false, code: "invalid-request" } };
        }
        const active = inProgressTicket(current);
        if (!active) {
          return { content: [{ type: "text", text: "Lease acquire rejected: no in-progress ticket." }], details: { ok: false, code: "invalid-transition" } };
        }
        const request: ActiveWriterLease = {
          leaseId: params.leaseId,
          worktreeKey: params.worktreeKey,
          owner: params.owner,
          ownerRole: params.ownerRole,
          phase: params.phase,
          ticketId: active.id,
          attempt: active.attempts,
          allowedPaths: params.allowedPaths,
          openedAt: params.openedAt,
          ...(params.fixBriefId ? { fixBriefId: params.fixBriefId } : {}),
        };
        const result = acquireBatchWriterLease(current, request, {
          dispositions: params.dispositions as FindingDispositionEvidence[] | undefined,
          fixBrief: params.fixBrief as FixBriefEvidence | undefined,
          priorFixRounds: params.priorFixRounds,
          implementationScopePaths: params.implementationScopePaths,
        });
        if (!result.ok) {
          return { content: [{ type: "text", text: `Lease acquire rejected: ${result.error.code}: ${result.error.message}` }], details: { ok: false, code: result.error.code } };
        }
        persist();
        setStatus(ctx);
        return {
          content: [{ type: "text", text: `Acquired writer lease ${result.lease!.leaseId} for ${active.id} (${result.lease!.ownerRole}/${result.lease!.phase}).` }],
          details: { ok: true, lease: result.lease },
        };
      }

      if (params.action === "close") {
        if (!params.leaseId || !params.owner || !params.closedAt || !params.handoffFingerprint) {
          return { content: [{ type: "text", text: "Lease close rejected: leaseId, owner, closedAt, and handoffFingerprint are required." }], details: { ok: false, code: "invalid-request" } };
        }
        const result = closeBatchWriterLease(current, {
          leaseId: params.leaseId,
          owner: params.owner,
          closedAt: params.closedAt,
          handoffFingerprint: params.handoffFingerprint,
        });
        if (!result.ok) {
          return { content: [{ type: "text", text: `Lease close rejected: ${result.error.code}: ${result.error.message}` }], details: { ok: false, code: result.error.code } };
        }
        persist();
        setStatus(ctx);
        return {
          content: [{ type: "text", text: `Closed writer lease ${result.closed!.leaseId}; handoff ${result.closed!.handoffFingerprint}.` }],
          details: { ok: true, closed: result.closed, writerLeaseHistory: current.writerLeaseHistory ?? [] },
        };
      }

      return { content: [{ type: "text", text: "Unknown lease action." }], details: { ok: false, code: "invalid-request" } };
    },
  });

  pi.registerTool({
    name: "batch_worker_lane",
    label: "Batch Worker Lane Control",
    description: "Show or set generic worker-writer lane control. Demoted/disabled selection returns to the parent writer while evidence and review gates remain active.",
    parameters: Type.Object({ mode: Type.Optional(StringEnum(["enabled", "demoted", "disabled"] as const)), reason: Type.Optional(Type.String()), locator: Type.Optional(Type.String()) }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      reconstruct(ctx);
      if (!current) return { content: [{ type: "text", text: "No active ticket batch." }], details: {} };
      if (params.mode === "enabled") current.workerLaneControl = { mode: "enabled" };
      else if (params.mode) {
        if (!params.reason || !params.locator) return { content: [{ type: "text", text: "Worker lane change rejected: demoted/disabled requires reason and locator; operator consequence is recorded explicitly." }], details: { ok: false, code: "invalid-request" } };
        current.workerLaneControl = {
          mode: params.mode,
          reason: params.reason,
          locator: params.locator,
          operatorConsequence: "Select the parent writer for this role while evidence protocol, decision packets, sealed reviews, and degradation reporting remain active.",
        };
      }
      persist(); setStatus(ctx);
      const control = current.workerLaneControl ?? { mode: "enabled" as const };
      return { content: [{ type: "text", text: `Worker lane ${control.mode}; requested worker resolves to ${effectiveWriterLane(control, "worker")}.` }], details: { control } };
    },
  });

  pi.registerTool({
    name: "batch_report",
    label: "Batch Report Outcome",
    description: "Report a structured completed, retry, failed, blocked, or needs_decision outcome for the current ticket. needs_decision requires a complete replayable decision packet. Use retry to re-attempt within the retry cap.",
    promptSnippet: "Report the outcome of a ticket in the active ticket batch",
    parameters: Type.Object({
      id: Type.String({ description: "Ticket id, e.g. T2" }),
      outcome: StringEnum(["completed", "retry", "failed", "blocked", "needs_decision"] as const),
      report: Type.Any({ description: "Required version-1 structured team-orchestration evidence envelope; prose notes cannot authorize an outcome." }),
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
        persist();
        setStatus(ctx);
        return { content: [{ type: "text", text: "Batch stopped: source changed; result not recorded." }], details: { stop: "source_changed" } };
      }
      const result = applyEvidencedOutcome(current, params.id, params.report, params.outcome);
      if (!result.ok) {
        return { content: [{ type: "text", text: `Outcome rejected: ${result.error.message}` }], details: { id: params.id, stop: "invalid_evidence", code: result.error.code } };
      }
      const ticket = result.ticket;
      const reason = stopReason(current);
      if (reason !== "running") current.active = false;
      persist();
      setStatus(ctx);
      return {
        content: [{ type: "text", text: `Recorded ${params.id} → ${ticket.status}. stop=${reason}.\n\n${statusReport(current)}` }],
        details: { id: params.id, status: ticket.status, stop: reason },
      };
    },
  });
}
