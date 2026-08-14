/**
 * Run Track v1 — internal Pi journal adapter + self-attested evidence tool.
 *
 * Durable events are namespaced custom session entries. Projection is restored
 * only from `ctx.sessionManager.getBranch()` on session_start/session_tree.
 * This extension is not a lifecycle authority: it records evidence metadata and
 * evaluates prospective evidence-transition claims for opt-in domain adapters.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomBytes } from "node:crypto";
import { Type } from "typebox";
import { brand, type EventId } from "../lib/brand.ts";
import {
  RUN_TRACK_NAMESPACE,
  RUN_TRACK_POLICY_VERSION,
  RUN_TRACK_VERSION,
  createRunTrackReceipt,
  parseRunTrackEvent,
  planEvidenceTransition,
  projectRunTrackBranch,
  type EvidenceResolution,
  type EvidenceTransitionPlan,
  type EvidenceTransitionRequest,
  type RunTrackEvent,
  type RunTrackProjection,
  type RunTrackReceipt,
  type TaskStartedEvent,
} from "../lib/run-track-v1.ts";

// Re-export policy constant for adapter consumers / tests without reaching into core paths.
export { RUN_TRACK_POLICY_VERSION };

/** Custom session entry type — approved journal namespace. */
export const RUN_TRACK_ENTRY_TYPE = RUN_TRACK_NAMESPACE;

/** Model-callable tool name (self-attested evidence only). */
export const RUN_TRACK_EVIDENCE_TOOL = "run_track_record_evidence";

/**
 * Operator-only interactive acknowledgment command (NOT a model tool).
 * Slash form: `/run-track-ack <action> [occurrenceId]`
 */
export const RUN_TRACK_ACK_COMMAND = "run-track-ack";

type AppendPi = { appendEntry: (customType: string, data?: unknown) => void };
type BranchCtx = { sessionManager: { getBranch: () => readonly unknown[]; getSessionId?: () => string } };

/** Context needed for operator-gated acknowledgment (mode is authoritative). */
export type OperatorAckContext = BranchCtx & {
  mode?: string;
  hasUI?: boolean;
  ui?: { notify?: (message: string, level?: "info" | "warning" | "error") => void };
};

export type RunTrackToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: RunTrackReceipt;
};

export type EnsureRunTrackStartedInput = {
  taskRef: string;
  /** Runtime session id; defaults to sessionManager.getSessionId() when present. */
  sessionId?: string;
  trackId?: string;
};

export type RecordSelfAttestedEvidenceInput = {
  key: string;
  resolution: EvidenceResolution;
  /** Content fingerprint only (64 lowercase hex). Never raw evidence bytes. */
  fingerprint: string;
  /** Required when no active track exists on the branch. */
  taskRef?: string;
  evidenceId?: string;
};

export type ConsultEvidenceTransitionResult = {
  ok: boolean;
  plan: EvidenceTransitionPlan;
  receipt: RunTrackReceipt;
  projection: RunTrackProjection;
  /** Kind appended this call, if any. */
  appendedKind: "guardrail.occurred" | "task.transition-observed" | null;
  error?: string;
};

export type AcknowledgeGuardrailInput = {
  /** Evidence-transition action bound on the pause occurrence. */
  action: string;
  /** Optional explicit occurrence id; otherwise the latest matching pause is used. */
  occurrenceId?: string;
};

export type AcknowledgeGuardrailResult = {
  ok: boolean;
  /** True only when a durable guardrail.acknowledged event was appended. */
  appended: boolean;
  projection: RunTrackProjection;
  receipt: RunTrackReceipt;
  acknowledgmentId?: string;
  error?: string;
};

function newToken(prefix: string): string {
  return `${prefix}:${randomBytes(12).toString("hex")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isCustomRunTrackEntry(entry: unknown): entry is { type: "custom"; customType: string; data: unknown } {
  if (typeof entry !== "object" || entry === null) return false;
  const value = entry as { type?: unknown; customType?: unknown };
  return value.type === "custom" && value.customType === RUN_TRACK_ENTRY_TYPE;
}

/** Pull Run Track event payloads from an active-branch entry list. */
export function extractRunTrackEventData(branch: readonly unknown[]): unknown[] {
  const events: unknown[] = [];
  for (const entry of branch) {
    if (isCustomRunTrackEntry(entry)) {
      events.push(entry.data);
    }
  }
  return events;
}

/**
 * Reconstruct projection from the active branch only.
 * Callers must never substitute getEntries()/buildContextEntries().
 */
export function projectRunTrackContext(ctx: BranchCtx): RunTrackProjection {
  const branch = ctx.sessionManager.getBranch();
  return projectRunTrackBranch(extractRunTrackEventData(branch));
}

function appendRunTrackEvent(pi: AppendPi, event: unknown): { ok: true; event: RunTrackEvent } | { ok: false; error: string } {
  const parsed = parseRunTrackEvent(event);
  if (!parsed.ok) return parsed;
  pi.appendEntry(RUN_TRACK_ENTRY_TYPE, parsed.value);
  return { ok: true, event: parsed.value };
}

function receiptText(prefix: string, receipt: RunTrackReceipt): string {
  const decision = receipt.decision ?? "n/a";
  const track = receipt.trackId ?? "none";
  const healthy = receipt.healthy ? "healthy" : "unhealthy";
  const degraded = receipt.degraded ? " degraded" : "";
  const reason = receipt.reason ? ` — ${receipt.reason}` : "";
  return `${prefix} track=${track} ${healthy} decision=${decision}${degraded} events=${receipt.eventCount}${reason}`;
}

function toolResult(prefix: string, receipt: RunTrackReceipt): RunTrackToolResult {
  return {
    content: [{ type: "text", text: receiptText(prefix, receipt) }],
    details: receipt,
  };
}

/**
 * Ensure a task.started event exists on the active branch.
 * Parent lineage cannot be supplied by callers — always null at this seam
 * (fork derivation is a later ticket / runtime path).
 */
export function ensureRunTrackStarted(
  pi: AppendPi,
  ctx: BranchCtx,
  input: EnsureRunTrackStartedInput,
): { ok: true; projection: RunTrackProjection; started: boolean; receipt: RunTrackReceipt } | { ok: false; error: string; projection: RunTrackProjection; receipt: RunTrackReceipt } {
  const projection = projectRunTrackContext(ctx);
  const baseReceipt = createRunTrackReceipt(projection);

  if (!projection.healthy) {
    return {
      ok: false,
      error: "active branch contains malformed run-track events",
      projection,
      receipt: baseReceipt,
    };
  }

  if (projection.trackId !== null) {
    return { ok: true, projection, started: false, receipt: baseReceipt };
  }

  const sessionId =
    (typeof input.sessionId === "string" && input.sessionId.length > 0
      ? input.sessionId
      : undefined) ??
    (typeof ctx.sessionManager.getSessionId === "function" ? ctx.sessionManager.getSessionId() : undefined) ??
    newToken("session");

  const startedEvent: TaskStartedEvent = {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "task.started",
    id: brand<EventId>(newToken("evt")),
    ts: nowIso(),
    trackId: typeof input.trackId === "string" && input.trackId.length > 0 ? input.trackId : newToken("track"),
    sessionId,
    taskRef: input.taskRef,
    // Callers cannot mint parent lineage through this adapter.
    lineage: null,
  };

  const appended = appendRunTrackEvent(pi, startedEvent);
  if (!appended.ok) {
    return { ok: false, error: appended.error, projection, receipt: baseReceipt };
  }

  const next = projectRunTrackContext(ctx);
  return {
    ok: true,
    projection: next,
    started: true,
    receipt: createRunTrackReceipt(next),
  };
}

/**
 * Record self-attested evidence only. Trust is hard-coded; caller fields for
 * trust, acknowledgment, or lineage are ignored even if present on the raw object.
 */
export function recordSelfAttestedEvidence(
  pi: AppendPi,
  ctx: BranchCtx,
  input: RecordSelfAttestedEvidenceInput,
  _rawParams?: Record<string, unknown>,
): { ok: true; projection: RunTrackProjection; receipt: RunTrackReceipt } | { ok: false; error: string; projection: RunTrackProjection; receipt: RunTrackReceipt } {
  // Trust/ack/lineage are never read from caller args. The appended event below
  // is built field-by-field with a hard-coded `trust: "self-attested"` and no
  // lineage/ack fields, and is then re-validated by parseRunTrackEvent whose
  // exactKeys allowlist rejects any stray field — so elevated caller fields
  // cannot reach a durable event through any path (structural, not advisory).
  let projection = projectRunTrackContext(ctx);

  if (!projection.healthy) {
    const receipt = createRunTrackReceipt(projection);
    return {
      ok: false,
      error: "active branch contains malformed run-track events",
      projection,
      receipt,
    };
  }

  if (projection.trackId === null) {
    const taskRef = input.taskRef;
    if (typeof taskRef !== "string" || taskRef.length === 0) {
      const receipt = createRunTrackReceipt(projection);
      return {
        ok: false,
        error: "no active run-track task; provide taskRef to start one",
        projection,
        receipt,
      };
    }
    const started = ensureRunTrackStarted(pi, ctx, { taskRef });
    if (!started.ok) return started;
    projection = started.projection;
  }

  if (projection.trackId === null) {
    const receipt = createRunTrackReceipt(projection);
    return { ok: false, error: "failed to establish run-track task", projection, receipt };
  }

  const event = {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "evidence.recorded" as const,
    id: brand<EventId>(newToken("evt")),
    ts: nowIso(),
    trackId: projection.trackId,
    evidenceId: typeof input.evidenceId === "string" && input.evidenceId.length > 0 ? input.evidenceId : newToken("ev"),
    key: input.key,
    // Hard-coded: model path cannot mint operator-observed trust.
    trust: "self-attested" as const,
    resolution: input.resolution,
    fingerprint: input.fingerprint,
  };

  const appended = appendRunTrackEvent(pi, event);
  if (!appended.ok) {
    const receipt = createRunTrackReceipt(projection);
    return { ok: false, error: appended.error, projection, receipt };
  }

  const next = projectRunTrackContext(ctx);
  return {
    ok: true,
    projection: next,
    receipt: createRunTrackReceipt(next),
  };
}

/**
 * Internal query/decision seam for later opt-in domain adapters.
 * Evaluates before append. Pause/block → guardrail.occurred only.
 * Allow → exactly one task.transition-observed (degraded preserved).
 * Does not mutate foreign subsystem lifecycle state.
 */
export function consultEvidenceTransition(
  pi: AppendPi,
  ctx: BranchCtx,
  request: EvidenceTransitionRequest,
): ConsultEvidenceTransitionResult {
  const projection = projectRunTrackContext(ctx);
  const plan = planEvidenceTransition(projection, request);

  if (plan.decision === "allow" && plan.transitionProposal) {
    if (projection.trackId === null) {
      const receipt = createRunTrackReceipt(projection, plan);
      return {
        ok: false,
        plan,
        receipt,
        projection,
        appendedKind: null,
        error: "no active run-track task on branch",
      };
    }
    const event = {
      v: RUN_TRACK_VERSION,
      ns: RUN_TRACK_NAMESPACE,
      kind: "task.transition-observed" as const,
      id: brand<EventId>(newToken("evt")),
      ts: nowIso(),
      trackId: projection.trackId,
      action: plan.transitionProposal.action,
      factsDigest: plan.transitionProposal.factsDigest,
      degraded: plan.transitionProposal.degraded,
      acknowledgmentId: plan.transitionProposal.acknowledgmentId,
    };
    const appended = appendRunTrackEvent(pi, event);
    if (!appended.ok) {
      return {
        ok: false,
        plan,
        receipt: createRunTrackReceipt(projection, plan),
        projection,
        appendedKind: null,
        error: appended.error,
      };
    }
    const next = projectRunTrackContext(ctx);
    return {
      ok: true,
      plan,
      receipt: createRunTrackReceipt(next, plan),
      projection: next,
      appendedKind: "task.transition-observed",
    };
  }

  if (plan.occurrenceProposal) {
    // Without an active task there is nothing durable to bind; return the plan
    // only so callers can surface the decision without inventing lineage/task.
    if (projection.trackId === null) {
      return {
        ok: false,
        plan,
        receipt: createRunTrackReceipt(projection, plan),
        projection,
        appendedKind: null,
        error: plan.reason || "no active run-track task on branch",
      };
    }
    // Idempotency: a durable occurrence already bound to this exact
    // action + decision + facts digest is not re-appended. This keeps a
    // per-turn consult loop (T3/T4 seam) from growing the journal unboundedly.
    const duplicate = projection.occurrences.find(
      (occ) =>
        occ.action === plan.occurrenceProposal!.action &&
        occ.decision === plan.occurrenceProposal!.decision &&
        occ.policyVersion === plan.occurrenceProposal!.policyVersion &&
        occ.factsDigest === plan.occurrenceProposal!.factsDigest,
    );
    if (duplicate) {
      return {
        ok: true,
        plan,
        receipt: createRunTrackReceipt(projection, plan),
        projection,
        appendedKind: null,
      };
    }
    const event = {
      v: RUN_TRACK_VERSION,
      ns: RUN_TRACK_NAMESPACE,
      kind: "guardrail.occurred" as const,
      id: brand<EventId>(newToken("evt")),
      ts: nowIso(),
      trackId: projection.trackId,
      action: plan.occurrenceProposal.action,
      decision: plan.occurrenceProposal.decision,
      reason: plan.occurrenceProposal.reason,
      policyVersion: plan.occurrenceProposal.policyVersion,
      factsDigest: plan.occurrenceProposal.factsDigest,
    };
    const appended = appendRunTrackEvent(pi, event);
    if (!appended.ok) {
      return {
        ok: false,
        plan,
        receipt: createRunTrackReceipt(projection, plan),
        projection,
        appendedKind: null,
        error: appended.error,
      };
    }
    const next = projectRunTrackContext(ctx);
    return {
      ok: true,
      plan,
      receipt: createRunTrackReceipt(next, plan),
      projection: next,
      appendedKind: "guardrail.occurred",
    };
  }

  // Defensive: plan without proposal (should not happen for pause/block/allow).
  return {
    ok: false,
    plan,
    receipt: createRunTrackReceipt(projection, plan),
    projection,
    appendedKind: null,
    error: plan.reason || "no appendable proposal",
  };
}

function parseAckCommandArgs(args: string): { action: string; occurrenceId?: string } | { error: string } {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { error: `usage: /${RUN_TRACK_ACK_COMMAND} <action> [occurrenceId]` };
  }
  if (parts.length > 2) {
    return { error: `usage: /${RUN_TRACK_ACK_COMMAND} <action> [occurrenceId]` };
  }
  const action = parts[0]!;
  const occurrenceId = parts[1];
  return occurrenceId ? { action, occurrenceId } : { action };
}

/**
 * Operator-interactive acknowledgment path (internal seam + command handler).
 *
 * Hard gates:
 * - Only `ctx.mode === "tui"` may append. RPC/JSON/print/headless/unattended are
 *   rejected with no journal mutation. `hasUI` alone is NOT operator identity
 *   (RPC reports hasUI=true).
 * - Binds to an existing pause `guardrail.occurred` on the active branch with
 *   exact action, policyVersion, and CURRENT factsDigest. Changed facts make a
 *   prior occurrence/ack binding stale.
 * - Origin is hard-coded `operator-interactive`. Callers cannot mint origin,
 *   trust, or lineage through this seam. Not exposed as a model tool.
 */
export function acknowledgeGuardrailOccurrence(
  pi: AppendPi,
  ctx: OperatorAckContext,
  input: AcknowledgeGuardrailInput,
): AcknowledgeGuardrailResult {
  // Mode is the sole operator-identity gate. Do not trust hasUI or caller fields.
  if (ctx.mode !== "tui") {
    const projection = projectRunTrackContext(ctx);
    return {
      ok: false,
      appended: false,
      projection,
      receipt: createRunTrackReceipt(projection),
      error: `operator acknowledgment requires interactive tui mode (got ${String(ctx.mode ?? "unknown")})`,
    };
  }

  const projection = projectRunTrackContext(ctx);
  const baseReceipt = createRunTrackReceipt(projection);

  if (!projection.healthy) {
    return {
      ok: false,
      appended: false,
      projection,
      receipt: baseReceipt,
      error: "active branch contains malformed run-track events",
    };
  }

  if (projection.trackId === null || projection.factsDigest === null) {
    return {
      ok: false,
      appended: false,
      projection,
      receipt: baseReceipt,
      error: "no active run-track task on branch",
    };
  }

  if (typeof input.action !== "string" || input.action.length === 0) {
    return {
      ok: false,
      appended: false,
      projection,
      receipt: baseReceipt,
      error: "acknowledgment action is required",
    };
  }

  const currentDigest = projection.factsDigest;
  const matches = projection.occurrences.filter((occ) => {
    if (occ.action !== input.action) return false;
    if (occ.policyVersion !== RUN_TRACK_POLICY_VERSION) return false;
    // Bind to CURRENT facts only — changed facts stale any prior occurrence.
    if (occ.factsDigest !== currentDigest) return false;
    // Only soft pauses are acknowledgeable (core planEvidenceTransition rule).
    if (occ.decision !== "pause") return false;
    if (typeof input.occurrenceId === "string" && input.occurrenceId.length > 0) {
      return occ.occurrenceId === input.occurrenceId;
    }
    return true;
  });

  if (matches.length === 0) {
    return {
      ok: false,
      appended: false,
      projection,
      receipt: baseReceipt,
      error:
        typeof input.occurrenceId === "string" && input.occurrenceId.length > 0
          ? "no matching guardrail.occurred pause for action/occurrence/policy/current facts"
          : "no matching guardrail.occurred pause for action/policy/current facts",
    };
  }

  // Latest matching occurrence preserves pre-transition ordering by construction
  // (ack is appended after the occurrence already on the branch).
  const occurrence = matches[matches.length - 1]!;

  const event = {
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    kind: "guardrail.acknowledged" as const,
    id: brand<EventId>(newToken("evt")),
    ts: nowIso(),
    trackId: projection.trackId,
    occurrenceId: occurrence.occurrenceId,
    action: occurrence.action,
    policyVersion: occurrence.policyVersion,
    factsDigest: currentDigest,
    // Hard-coded: no model tool / RPC args can mint a different origin.
    origin: "operator-interactive" as const,
  };

  const appended = appendRunTrackEvent(pi, event);
  if (!appended.ok) {
    return {
      ok: false,
      appended: false,
      projection,
      receipt: baseReceipt,
      error: appended.error,
    };
  }

  const next = projectRunTrackContext(ctx);
  return {
    ok: true,
    appended: true,
    projection: next,
    receipt: createRunTrackReceipt(next),
    acknowledgmentId: appended.event.id,
  };
}

/**
 * Install the operator acknowledgment slash command when the host supports it.
 * Feature-detected so unit-test fakes that only implement tool registration
 * still load; real hosts register the interactive operator command.
 */
function installOperatorAckCommand(pi: ExtensionAPI): void {
  if (typeof pi.registerCommand !== "function") return;

  pi.registerCommand(RUN_TRACK_ACK_COMMAND, {
    description:
      "Acknowledge a paused Run Track guardrail occurrence (interactive TUI operator only). Usage: <action> [occurrenceId]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const parsed = parseAckCommandArgs(args);
      if ("error" in parsed) {
        try {
          ctx.ui.notify(parsed.error, "error");
        } catch {
          // Stale ctx — ignore.
        }
        return;
      }

      reconstruct(ctx);
      const result = acknowledgeGuardrailOccurrence(pi, ctx, parsed);
      setStatus(ctx, result.projection);

      try {
        if (!result.ok) {
          ctx.ui.notify(`Run Track ack rejected: ${result.error}`, "error");
          return;
        }
        ctx.ui.notify(
          receiptText("Run Track guardrail acknowledged.", result.receipt),
          "info",
        );
      } catch {
        // Stale ctx after fork/reload — ignore.
      }
    },
  });
}

function setStatus(ctx: ExtensionContext, projection: RunTrackProjection): void {
  if (ctx.mode !== "tui") return;
  try {
    if (!projection.trackId && projection.eventCount === 0 && projection.healthy) {
      ctx.ui.setStatus("run-track", undefined);
      return;
    }
    const label = projection.healthy
      ? `rt ${projection.eventCount}·${Object.keys(projection.evidenceByKey).length}ev`
      : `rt UNHEALTHY·${projection.malformedCount}`;
    ctx.ui.setStatus("run-track", label);
  } catch {
    // Stale ctx after fork/reload — ignore.
  }
}

function reconstruct(ctx: ExtensionContext): RunTrackProjection {
  const projection = projectRunTrackContext(ctx);
  setStatus(ctx, projection);
  return projection;
}

export default function runTrack(pi: ExtensionAPI): void {
  // Replay ONLY from getBranch on both lifecycle hooks (never getEntries).
  pi.on("session_start", (_event, ctx) => {
    reconstruct(ctx);
  });
  pi.on("session_tree", (_event, ctx) => {
    reconstruct(ctx);
  });

  // Operator-only acknowledgment command (not a model-callable tool).
  installOperatorAckCommand(pi);

  pi.registerTool({
    name: RUN_TRACK_EVIDENCE_TOOL,
    label: "Run Track Evidence",
    description:
      "Record self-attested evidence metadata on the active Run Track journal. Trust is always self-attested; this tool cannot mint operator-observed trust, acknowledgments, or parent lineage. Pass a content fingerprint only — never raw logs or artifacts.",
    promptSnippet: "Record self-attested run-track evidence metadata (fingerprint only)",
    parameters: Type.Object({
      key: Type.String({ description: "Evidence key (e.g. tests, review)" }),
      resolution: Type.Union([Type.Literal("resolved"), Type.Literal("unresolved")]),
      fingerprint: Type.String({ description: "sha256 hex content fingerprint (64 lowercase hex chars)" }),
      taskRef: Type.Optional(Type.String({ description: "Task ref used to start a track when none is active" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Re-project from active branch before mutation.
      reconstruct(ctx);

      const result = recordSelfAttestedEvidence(pi, ctx, {
        key: params.key,
        resolution: params.resolution,
        fingerprint: params.fingerprint,
        taskRef: typeof params.taskRef === "string" ? params.taskRef : undefined,
      });

      if (!result.ok) {
        setStatus(ctx, result.projection);
        return toolResult(`Run Track evidence rejected: ${result.error}.`, result.receipt);
      }

      setStatus(ctx, result.projection);
      return toolResult("Run Track evidence recorded.", result.receipt);
    },
  });

  // Intentionally no tool_call interceptor / global foreign-tool blocking.
  // Intentionally no lifecycle mutation of ticket/batch/release subsystems.
}
