/**
 * Opt-in Run Track consult adapter for one existing lifecycle owner.
 *
 * Owner: BatchRunState ticket-runner batch owner (`lib/ticket-runner-state.ts`).
 * Evidence-transition claim: the single `in_progress -> completed` transition
 * performed by `applyEvidencedOutcome` when `report.requestedOutcome === "completed"`.
 *
 * Run Track is advisory only (allow/pause/block + occurrence/receipt metadata).
 * `applyEvidencedOutcome` remains the sole authority that validates domain evidence,
 * mutates, retries, rolls back, and reports. This module never writes Run Track
 * journals, holds owner state, or fabricates completions the owner refused.
 * Absent/disabled `options.runTrack` delegates byte/semantics-identically to the
 * owner — the owner module is intentionally unmodified so "disabled/absent =
 * unchanged" is provable by construction.
 */

import {
  createRunTrackReceipt,
  planEvidenceTransition,
  projectRunTrackBranch,
  type OccurrenceProposal,
  type RunTrackReceipt,
  type TransitionDecision,
} from "./run-track-v1.ts";
import {
  applyEvidencedOutcome,
  type BatchRunState,
  type EvidencedOutcomeResult,
  type TicketOutcome,
} from "./ticket-runner-state.ts";

// ---------------------------------------------------------------------------
// Consult surface (pure; no owner state, no journal writes)
// ---------------------------------------------------------------------------

export type RunTrackOwnerConsultInput = {
  runTrackEntries: readonly unknown[];
  action: string;
  requiredKeys: string[];
};

export type RunTrackOwnerConsultResult = {
  decision: TransitionDecision;
  degraded: boolean;
  reason: string;
  occurrence: OccurrenceProposal | null;
  receipt: RunTrackReceipt;
};

/**
 * Project the provided active-branch Run Track entries and plan the prospective
 * evidence-transition claim. Returns only allow/pause/block plus occurrence/
 * receipt metadata — never mutates owner or journal state.
 */
export function consultRunTrackForOwnerCompletion(
  input: RunTrackOwnerConsultInput,
): RunTrackOwnerConsultResult {
  const projection = projectRunTrackBranch(input.runTrackEntries);
  const plan = planEvidenceTransition(projection, {
    action: input.action,
    requiredKeys: input.requiredKeys,
  });
  return {
    decision: plan.decision,
    degraded: plan.degraded,
    reason: plan.reason,
    occurrence: plan.occurrenceProposal,
    receipt: createRunTrackReceipt(projection, plan),
  };
}

// ---------------------------------------------------------------------------
// Opt-in composed applier
// ---------------------------------------------------------------------------

export type RunTrackOwnerAdapterOptions = {
  /** Forwarded to the owner when the owner is invoked. */
  expectedOutcome?: TicketOutcome;
  /**
   * When absent, the adapter is disabled and delegates straight to the owner.
   * When present, Run Track is consulted only for `requestedOutcome === "completed"`.
   */
  runTrack?: {
    entries: readonly unknown[];
    action: string;
    requiredKeys: string[];
  };
};

export type EvidencedOutcomeWithRunTrackResult = EvidencedOutcomeResult & {
  /** Present only when Run Track was consulted for a completed claim. */
  runTrack?: RunTrackOwnerConsultResult;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestedOutcomeOf(reportValue: unknown): unknown {
  return isPlainObject(reportValue) ? reportValue.requestedOutcome : undefined;
}

/**
 * Opt-in wrapper around `applyEvidencedOutcome`.
 *
 * - No `options.runTrack` → identical to calling the owner directly.
 * - Non-`completed` requested outcomes → never consults Run Track; delegates unchanged.
 * - `completed` + `options.runTrack` → consult first; `block`/`pause` refuse without
 *   calling the owner; `allow` then delegates (owner may still reject). Degraded
 *   allow is surfaced in adapter metadata only and never alters owner state/note.
 */
export function applyEvidencedOutcomeWithRunTrack(
  state: BatchRunState,
  id: string,
  reportValue: unknown,
  options?: RunTrackOwnerAdapterOptions,
): EvidencedOutcomeWithRunTrackResult {
  const runTrack = options?.runTrack;
  if (!runTrack) {
    return applyEvidencedOutcome(state, id, reportValue, options?.expectedOutcome);
  }

  // Hard decision gates only the completed claim. All other outcomes bypass Run Track.
  if (requestedOutcomeOf(reportValue) !== "completed") {
    return applyEvidencedOutcome(state, id, reportValue, options?.expectedOutcome);
  }

  const consult = consultRunTrackForOwnerCompletion({
    runTrackEntries: runTrack.entries,
    action: runTrack.action,
    requiredKeys: runTrack.requiredKeys,
  });

  if (consult.decision === "block" || consult.decision === "pause") {
    return {
      ok: false,
      error: {
        code: "invalid-transition",
        message: `Run Track ${consult.decision}: ${consult.reason}`,
      },
      runTrack: consult,
    };
  }

  // allow — owner remains sole domain authority for validation and mutation.
  const ownerResult = applyEvidencedOutcome(state, id, reportValue, options?.expectedOutcome);
  return {
    ...ownerResult,
    runTrack: consult,
  };
}
