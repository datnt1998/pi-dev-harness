/**
 * Run Track v1 — pure evidence-transition projection core.
 *
 * Internal observability seam for evidence-sufficiency claims on an active
 * session branch. Not a task/ticket/batch/release lifecycle authority: callers
 * retain transition ownership; this module only allow/pause/blocks the narrow
 * claim that recorded evidence is sufficient for a requested transition.
 *
 * Durable I/O, Pi session adapters, UI, and operator channels live elsewhere.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Namespaced journal contract id embedded in every event. */
export const RUN_TRACK_NAMESPACE = "run-track/v1" as const;

/** Schema version carried on every event. */
export const RUN_TRACK_VERSION = 1 as const;

/** Canonical serialized event size ceiling (8 KiB). */
export const RUN_TRACK_EVENT_MAX_BYTES = 8 * 1024;

/** Policy identifier acknowledgments and occurrences must bind. */
export const RUN_TRACK_POLICY_VERSION = "rt-policy-v1" as const;

/** Versioned evaluation-digest prefix: `rt-eval-v1:<64 lowercase hex>`. */
export const RUN_TRACK_EVAL_DIGEST_PREFIX = "rt-eval-v1:" as const;

export const RUN_TRACK_EVENT_KINDS = [
  "task.started",
  "evidence.recorded",
  "guardrail.occurred",
  "guardrail.acknowledged",
  "task.transition-observed",
] as const;

export type RunTrackEventKind = (typeof RUN_TRACK_EVENT_KINDS)[number];

export type EvidenceTrust = "self-attested" | "operator-observed";
export type EvidenceResolution = "resolved" | "unresolved";
export type GuardrailDecision = "pause" | "block";
export type TransitionDecision = "allow" | "pause" | "block";
export type AcknowledgmentOrigin = "operator-interactive";

// ---------------------------------------------------------------------------
// Event types (metadata-only; unknown fields rejected at parse)
// ---------------------------------------------------------------------------

type EventBase = {
  v: typeof RUN_TRACK_VERSION;
  ns: typeof RUN_TRACK_NAMESPACE;
  id: string;
  ts: string;
  trackId: string;
};

export type TaskStartedEvent = EventBase & {
  kind: "task.started";
  sessionId: string;
  taskRef: string;
  lineage: RunTrackLineage | null;
};

export type EvidenceRecordedEvent = EventBase & {
  kind: "evidence.recorded";
  evidenceId: string;
  key: string;
  trust: EvidenceTrust;
  resolution: EvidenceResolution;
  /** Content fingerprint only — never raw prompt/log/artifact bytes. */
  fingerprint: string;
};

export type GuardrailOccurredEvent = EventBase & {
  kind: "guardrail.occurred";
  action: string;
  decision: GuardrailDecision;
  reason: string;
  policyVersion: string;
  factsDigest: string;
};

export type GuardrailAcknowledgedEvent = EventBase & {
  kind: "guardrail.acknowledged";
  occurrenceId: string;
  action: string;
  policyVersion: string;
  factsDigest: string;
  origin: AcknowledgmentOrigin;
};

export type TaskTransitionObservedEvent = EventBase & {
  kind: "task.transition-observed";
  action: string;
  factsDigest: string;
  degraded: boolean;
  acknowledgmentId: string | null;
};

export type RunTrackEvent =
  | TaskStartedEvent
  | EvidenceRecordedEvent
  | GuardrailOccurredEvent
  | GuardrailAcknowledgedEvent
  | TaskTransitionObservedEvent;

export type RunTrackLineage = {
  /** Runtime-derived track identity for the child session. */
  childTrackId: string;
  parentTrackId: string;
  parentSessionId: string;
  rootTrackId: string;
};

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

// ---------------------------------------------------------------------------
// Projection + planning types
// ---------------------------------------------------------------------------

export type ProjectedEvidence = {
  evidenceId: string;
  key: string;
  trust: EvidenceTrust;
  resolution: EvidenceResolution;
  fingerprint: string;
  eventId: string;
  order: number;
};

export type ProjectedOccurrence = {
  occurrenceId: string;
  action: string;
  decision: GuardrailDecision;
  reason: string;
  policyVersion: string;
  factsDigest: string;
  order: number;
  eventId: string;
};

export type ProjectedAcknowledgment = {
  acknowledgmentId: string;
  occurrenceId: string;
  action: string;
  policyVersion: string;
  factsDigest: string;
  origin: AcknowledgmentOrigin;
  order: number;
  eventId: string;
};

export type ProjectedTransition = {
  eventId: string;
  action: string;
  factsDigest: string;
  degraded: boolean;
  acknowledgmentId: string | null;
  order: number;
};

export type RunTrackProjection = {
  /** False when any branch entry failed strict validation. */
  healthy: boolean;
  malformedCount: number;
  parseErrors: string[];
  trackId: string | null;
  sessionId: string | null;
  taskRef: string | null;
  lineage: RunTrackLineage | null;
  events: RunTrackEvent[];
  evidenceByKey: Record<string, ProjectedEvidence>;
  occurrences: ProjectedOccurrence[];
  acknowledgments: ProjectedAcknowledgment[];
  transitions: ProjectedTransition[];
  /** Canonical evaluation digest over current facts, or null when unhealthy/empty. */
  factsDigest: string | null;
  eventCount: number;
};

export type EvidenceTransitionRequest = {
  /** Domain evidence-transition claim name (not a lifecycle mutation). */
  action: string;
  /** Evidence keys that must be present and resolved for an allow. */
  requiredKeys: readonly string[];
};

export type OccurrenceProposal = {
  kind: "guardrail.occurred";
  action: string;
  decision: GuardrailDecision;
  reason: string;
  policyVersion: string;
  factsDigest: string;
};

export type TransitionProposal = {
  kind: "task.transition-observed";
  action: string;
  factsDigest: string;
  degraded: boolean;
  acknowledgmentId: string | null;
};

export type EvidenceTransitionPlan = {
  decision: TransitionDecision;
  reason: string;
  degraded: boolean;
  policyVersion: string;
  factsDigest: string | null;
  /** Present on pause/block — append before any retry. */
  occurrenceProposal: OccurrenceProposal | null;
  /** Present only on allow — never on pause/block. */
  transitionProposal: TransitionProposal | null;
  matchedAcknowledgmentId: string | null;
  staleAcknowledgmentIds: string[];
};

export type RunTrackReceipt = {
  ns: typeof RUN_TRACK_NAMESPACE;
  trackId: string | null;
  healthy: boolean;
  decision: TransitionDecision | null;
  degraded: boolean;
  reason: string | null;
  factsDigest: string | null;
  policyVersion: typeof RUN_TRACK_POLICY_VERSION;
  eventCount: number;
  evidenceKeys: string[];
  occurrenceCount: number;
  transitionCount: number;
};

export type ForkDerivationInput = {
  parent: RunTrackProjection;
  /** Runtime-assigned child session identity; callers cannot supply parent authority. */
  childSessionId: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9._:/-]{1,128}$/;
const KEY_RE = /^[A-Za-z0-9._:/-]{1,64}$/;
const ACTION_RE = /^[A-Za-z0-9._:/-]{1,64}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const TRUST_VALUES: readonly EvidenceTrust[] = ["self-attested", "operator-observed"];
const RESOLUTION_VALUES: readonly EvidenceResolution[] = ["resolved", "unresolved"];
const GUARD_DECISIONS: readonly GuardrailDecision[] = ["pause", "block"];

const TASK_STARTED_KEYS = ["v", "ns", "kind", "id", "ts", "trackId", "sessionId", "taskRef", "lineage"] as const;
const EVIDENCE_KEYS = ["v", "ns", "kind", "id", "ts", "trackId", "evidenceId", "key", "trust", "resolution", "fingerprint"] as const;
const OCCURRED_KEYS = ["v", "ns", "kind", "id", "ts", "trackId", "action", "decision", "reason", "policyVersion", "factsDigest"] as const;
const ACK_KEYS = ["v", "ns", "kind", "id", "ts", "trackId", "occurrenceId", "action", "policyVersion", "factsDigest", "origin"] as const;
const TRANSITION_KEYS = ["v", "ns", "kind", "id", "ts", "trackId", "action", "factsDigest", "degraded", "acknowledgmentId"] as const;
const LINEAGE_KEYS = ["childTrackId", "parentTrackId", "parentSessionId", "rootTrackId"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function isToken(value: unknown, re: RegExp): value is string {
  return typeof value === "string" && re.test(value);
}

function isEvalDigest(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith(RUN_TRACK_EVAL_DIGEST_PREFIX)) return false;
  return HEX64_RE.test(value.slice(RUN_TRACK_EVAL_DIGEST_PREFIX.length));
}

function exactKeys(obj: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) return false;
  const set = new Set(allowed);
  return keys.every((key) => set.has(key));
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * Deterministic canonical JSON: NFC strings, LF newlines, sorted object keys,
 * arrays preserve order, non-finite numbers rejected by callers before use.
 */
export function canonicalRunTrackJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "string") return value.normalize("NFC").replace(/\r\n?/g, "\n");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number in canonical JSON");
    return value;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry === undefined) continue;
      out[key.normalize("NFC")] = canonicalize(entry);
    }
    return out;
  }
  throw new TypeError(`unsupported canonical JSON type: ${typeof value}`);
}

/** Build `rt-eval-v1:<sha256>` over arbitrary JSON-compatible facts. */
export function runTrackEvaluationDigest(facts: unknown): string {
  const body = canonicalRunTrackJson(facts);
  const hex = createHash("sha256").update(body, "utf8").digest("hex");
  return `${RUN_TRACK_EVAL_DIGEST_PREFIX}${hex}`;
}

function enforceEventSize<T extends RunTrackEvent>(event: T): ParseResult<T> {
  let serialized: string;
  try {
    serialized = canonicalRunTrackJson(event);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "canonicalization failed" };
  }
  if (utf8Bytes(serialized) > RUN_TRACK_EVENT_MAX_BYTES) {
    return { ok: false, error: `event exceeds ${RUN_TRACK_EVENT_MAX_BYTES} byte canonical cap` };
  }
  return { ok: true, value: event };
}

function parseLineage(value: unknown): ParseResult<RunTrackLineage | null> {
  if (value === null) return { ok: true, value: null };
  if (!isPlainObject(value)) return { ok: false, error: "lineage must be object or null" };
  if (!exactKeys(value, LINEAGE_KEYS)) return { ok: false, error: "lineage unknown or missing field" };
  if (!isToken(value.childTrackId, ID_RE)) return { ok: false, error: "invalid lineage.childTrackId" };
  if (!isToken(value.parentTrackId, ID_RE)) return { ok: false, error: "invalid lineage.parentTrackId" };
  if (!isToken(value.parentSessionId, ID_RE)) return { ok: false, error: "invalid lineage.parentSessionId" };
  if (!isToken(value.rootTrackId, ID_RE)) return { ok: false, error: "invalid lineage.rootTrackId" };
  return {
    ok: true,
    value: {
      childTrackId: value.childTrackId,
      parentTrackId: value.parentTrackId,
      parentSessionId: value.parentSessionId,
      rootTrackId: value.rootTrackId,
    },
  };
}

function baseFields(raw: Record<string, unknown>): ParseResult<EventBase> {
  if (raw.v !== RUN_TRACK_VERSION) return { ok: false, error: "unsupported version" };
  if (raw.ns !== RUN_TRACK_NAMESPACE) return { ok: false, error: "unsupported namespace" };
  if (!isToken(raw.id, ID_RE)) return { ok: false, error: "invalid id" };
  if (typeof raw.ts !== "string" || !isIsoTimestamp(raw.ts)) return { ok: false, error: "invalid ts" };
  if (!isToken(raw.trackId, ID_RE)) return { ok: false, error: "invalid trackId" };
  return {
    ok: true,
    value: {
      v: RUN_TRACK_VERSION,
      ns: RUN_TRACK_NAMESPACE,
      id: raw.id,
      ts: raw.ts,
      trackId: raw.trackId,
    },
  };
}

// ---------------------------------------------------------------------------
// parseRunTrackEvent
// ---------------------------------------------------------------------------

/**
 * Strict metadata-only parser. Rejects unknown kinds, unknown fields, raw
 * content payloads, malformed values, and oversize canonical encodings.
 */
export function parseRunTrackEvent(input: unknown): ParseResult<RunTrackEvent> {
  if (!isPlainObject(input)) return { ok: false, error: "event must be an object" };
  const kind = input.kind;
  if (typeof kind !== "string") return { ok: false, error: "missing kind" };

  switch (kind) {
    case "task.started":
      return parseTaskStarted(input);
    case "evidence.recorded":
      return parseEvidenceRecorded(input);
    case "guardrail.occurred":
      return parseGuardrailOccurred(input);
    case "guardrail.acknowledged":
      return parseGuardrailAcknowledged(input);
    case "task.transition-observed":
      return parseTransitionObserved(input);
    default:
      return { ok: false, error: `unknown kind: ${kind}` };
  }
}

function parseTaskStarted(raw: Record<string, unknown>): ParseResult<TaskStartedEvent> {
  if (!exactKeys(raw, TASK_STARTED_KEYS)) return { ok: false, error: "task.started unknown or missing field" };
  const base = baseFields(raw);
  if (!base.ok) return base;
  if (!isToken(raw.sessionId, ID_RE)) return { ok: false, error: "invalid sessionId" };
  if (!isToken(raw.taskRef, KEY_RE)) return { ok: false, error: "invalid taskRef" };
  const lineage = parseLineage(raw.lineage);
  if (!lineage.ok) return lineage;
  return enforceEventSize({
    ...base.value,
    kind: "task.started",
    sessionId: raw.sessionId,
    taskRef: raw.taskRef,
    lineage: lineage.value,
  });
}

function parseEvidenceRecorded(raw: Record<string, unknown>): ParseResult<EvidenceRecordedEvent> {
  if (!exactKeys(raw, EVIDENCE_KEYS)) return { ok: false, error: "evidence.recorded unknown or missing field" };
  const base = baseFields(raw);
  if (!base.ok) return base;
  if (!isToken(raw.evidenceId, ID_RE)) return { ok: false, error: "invalid evidenceId" };
  if (!isToken(raw.key, KEY_RE)) return { ok: false, error: "invalid evidence key" };
  if (typeof raw.trust !== "string" || !TRUST_VALUES.includes(raw.trust as EvidenceTrust)) {
    return { ok: false, error: "invalid trust" };
  }
  if (typeof raw.resolution !== "string" || !RESOLUTION_VALUES.includes(raw.resolution as EvidenceResolution)) {
    return { ok: false, error: "invalid resolution" };
  }
  if (typeof raw.fingerprint !== "string" || !HEX64_RE.test(raw.fingerprint)) {
    return { ok: false, error: "invalid fingerprint" };
  }
  // Metadata-only: fingerprint is a digest, never raw body fields.
  return enforceEventSize({
    ...base.value,
    kind: "evidence.recorded",
    evidenceId: raw.evidenceId,
    key: raw.key,
    trust: raw.trust as EvidenceTrust,
    resolution: raw.resolution as EvidenceResolution,
    fingerprint: raw.fingerprint,
  });
}

function parseGuardrailOccurred(raw: Record<string, unknown>): ParseResult<GuardrailOccurredEvent> {
  if (!exactKeys(raw, OCCURRED_KEYS)) return { ok: false, error: "guardrail.occurred unknown or missing field" };
  const base = baseFields(raw);
  if (!base.ok) return base;
  if (!isToken(raw.action, ACTION_RE)) return { ok: false, error: "invalid action" };
  if (typeof raw.decision !== "string" || !GUARD_DECISIONS.includes(raw.decision as GuardrailDecision)) {
    return { ok: false, error: "invalid decision" };
  }
  // Reason is metadata prose; the canonical 8 KiB event cap is the hard size bound.
  if (typeof raw.reason !== "string" || raw.reason.length < 1 || raw.reason.length > RUN_TRACK_EVENT_MAX_BYTES) {
    return { ok: false, error: "invalid reason" };
  }
  if (raw.policyVersion !== RUN_TRACK_POLICY_VERSION) return { ok: false, error: "invalid policyVersion" };
  if (!isEvalDigest(raw.factsDigest)) return { ok: false, error: "invalid factsDigest" };
  return enforceEventSize({
    ...base.value,
    kind: "guardrail.occurred",
    action: raw.action,
    decision: raw.decision as GuardrailDecision,
    reason: raw.reason.normalize("NFC"),
    policyVersion: RUN_TRACK_POLICY_VERSION,
    factsDigest: raw.factsDigest,
  });
}

function parseGuardrailAcknowledged(raw: Record<string, unknown>): ParseResult<GuardrailAcknowledgedEvent> {
  if (!exactKeys(raw, ACK_KEYS)) return { ok: false, error: "guardrail.acknowledged unknown or missing field" };
  const base = baseFields(raw);
  if (!base.ok) return base;
  if (!isToken(raw.occurrenceId, ID_RE)) return { ok: false, error: "invalid occurrenceId" };
  if (!isToken(raw.action, ACTION_RE)) return { ok: false, error: "invalid action" };
  if (raw.policyVersion !== RUN_TRACK_POLICY_VERSION) return { ok: false, error: "invalid policyVersion" };
  if (!isEvalDigest(raw.factsDigest)) return { ok: false, error: "invalid factsDigest" };
  if (raw.origin !== "operator-interactive") return { ok: false, error: "acknowledgment origin must be operator-interactive" };
  return enforceEventSize({
    ...base.value,
    kind: "guardrail.acknowledged",
    occurrenceId: raw.occurrenceId,
    action: raw.action,
    policyVersion: RUN_TRACK_POLICY_VERSION,
    factsDigest: raw.factsDigest,
    origin: "operator-interactive",
  });
}

function parseTransitionObserved(raw: Record<string, unknown>): ParseResult<TaskTransitionObservedEvent> {
  if (!exactKeys(raw, TRANSITION_KEYS)) return { ok: false, error: "task.transition-observed unknown or missing field" };
  const base = baseFields(raw);
  if (!base.ok) return base;
  if (!isToken(raw.action, ACTION_RE)) return { ok: false, error: "invalid action" };
  if (!isEvalDigest(raw.factsDigest)) return { ok: false, error: "invalid factsDigest" };
  if (typeof raw.degraded !== "boolean") return { ok: false, error: "invalid degraded" };
  if (!(raw.acknowledgmentId === null || isToken(raw.acknowledgmentId, ID_RE))) {
    return { ok: false, error: "invalid acknowledgmentId" };
  }
  return enforceEventSize({
    ...base.value,
    kind: "task.transition-observed",
    action: raw.action,
    factsDigest: raw.factsDigest,
    degraded: raw.degraded,
    acknowledgmentId: raw.acknowledgmentId,
  });
}

// ---------------------------------------------------------------------------
// Facts + projection
// ---------------------------------------------------------------------------

type FactView = {
  trackId: string | null;
  taskRef: string | null;
  evidence: Array<{
    key: string;
    trust: EvidenceTrust;
    resolution: EvidenceResolution;
    fingerprint: string;
  }>;
  policyVersion: typeof RUN_TRACK_POLICY_VERSION;
};

function buildFactView(args: {
  trackId: string | null;
  taskRef: string | null;
  evidenceByKey: Record<string, ProjectedEvidence>;
}): FactView {
  const evidence = Object.keys(args.evidenceByKey)
    .sort()
    .map((key) => {
      const item = args.evidenceByKey[key];
      return {
        key: item.key,
        trust: item.trust,
        resolution: item.resolution,
        fingerprint: item.fingerprint,
      };
    });
  return {
    trackId: args.trackId,
    taskRef: args.taskRef,
    evidence,
    policyVersion: RUN_TRACK_POLICY_VERSION,
  };
}

function digestFromProjectionState(args: {
  trackId: string | null;
  taskRef: string | null;
  evidenceByKey: Record<string, ProjectedEvidence>;
  healthy: boolean;
  eventCount: number;
}): string | null {
  if (!args.healthy || args.eventCount === 0 || args.trackId === null) return null;
  return runTrackEvaluationDigest(buildFactView(args));
}

function emptyProjection(errors: string[] = []): RunTrackProjection {
  return {
    healthy: errors.length === 0,
    malformedCount: errors.length,
    parseErrors: errors,
    trackId: null,
    sessionId: null,
    taskRef: null,
    lineage: null,
    events: [],
    evidenceByKey: {},
    occurrences: [],
    acknowledgments: [],
    transitions: [],
    factsDigest: null,
    eventCount: 0,
  };
}

/**
 * Deterministic active-branch replay. Any malformed entry fails the projection
 * closed for prospective authorization while preserving error visibility.
 */
export function projectRunTrackBranch(entries: readonly unknown[]): RunTrackProjection {
  if (!Array.isArray(entries)) {
    return emptyProjection(["branch entries must be an array"]);
  }

  const parseErrors: string[] = [];
  const events: RunTrackEvent[] = [];
  const evidenceByKey: Record<string, ProjectedEvidence> = {};
  const occurrences: ProjectedOccurrence[] = [];
  const acknowledgments: ProjectedAcknowledgment[] = [];
  const transitions: ProjectedTransition[] = [];
  const seenIds = new Set<string>();

  let trackId: string | null = null;
  let sessionId: string | null = null;
  let taskRef: string | null = null;
  let lineage: RunTrackLineage | null = null;
  let order = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const parsed = parseRunTrackEvent(entries[index]);
    if (!parsed.ok) {
      parseErrors.push(`index ${index}: ${parsed.error}`);
      continue;
    }
    const event = parsed.value;
    if (seenIds.has(event.id)) {
      parseErrors.push(`index ${index}: duplicate event id ${event.id}`);
      continue;
    }
    seenIds.add(event.id);

    if (trackId !== null && event.trackId !== trackId) {
      parseErrors.push(`index ${index}: trackId mismatch`);
      continue;
    }

    switch (event.kind) {
      case "task.started": {
        if (trackId !== null) {
          parseErrors.push(`index ${index}: duplicate task.started`);
          continue;
        }
        trackId = event.trackId;
        sessionId = event.sessionId;
        taskRef = event.taskRef;
        lineage = event.lineage;
        break;
      }
      case "evidence.recorded": {
        if (trackId === null) {
          parseErrors.push(`index ${index}: evidence before task.started`);
          continue;
        }
        evidenceByKey[event.key] = {
          evidenceId: event.evidenceId,
          key: event.key,
          trust: event.trust,
          resolution: event.resolution,
          fingerprint: event.fingerprint,
          eventId: event.id,
          order,
        };
        break;
      }
      case "guardrail.occurred": {
        if (trackId === null) {
          parseErrors.push(`index ${index}: guardrail before task.started`);
          continue;
        }
        occurrences.push({
          occurrenceId: event.id,
          action: event.action,
          decision: event.decision,
          reason: event.reason,
          policyVersion: event.policyVersion,
          factsDigest: event.factsDigest,
          order,
          eventId: event.id,
        });
        break;
      }
      case "guardrail.acknowledged": {
        if (trackId === null) {
          parseErrors.push(`index ${index}: acknowledgment before task.started`);
          continue;
        }
        acknowledgments.push({
          acknowledgmentId: event.id,
          occurrenceId: event.occurrenceId,
          action: event.action,
          policyVersion: event.policyVersion,
          factsDigest: event.factsDigest,
          origin: event.origin,
          order,
          eventId: event.id,
        });
        break;
      }
      case "task.transition-observed": {
        if (trackId === null) {
          parseErrors.push(`index ${index}: transition before task.started`);
          continue;
        }
        transitions.push({
          eventId: event.id,
          action: event.action,
          factsDigest: event.factsDigest,
          degraded: event.degraded,
          acknowledgmentId: event.acknowledgmentId,
          order,
        });
        break;
      }
      default: {
        const _never: never = event;
        void _never;
      }
    }

    events.push(event);
    order += 1;
  }

  const healthy = parseErrors.length === 0;
  const factsDigest = digestFromProjectionState({
    trackId,
    taskRef,
    evidenceByKey,
    healthy,
    eventCount: events.length,
  });

  return {
    healthy,
    malformedCount: parseErrors.length,
    parseErrors,
    trackId,
    sessionId,
    taskRef,
    lineage,
    events,
    evidenceByKey,
    occurrences,
    acknowledgments,
    transitions,
    factsDigest,
    eventCount: events.length,
  };
}

// ---------------------------------------------------------------------------
// planEvidenceTransition — evaluate before append
// ---------------------------------------------------------------------------

function higherTrust(trust: EvidenceTrust): boolean {
  return trust === "operator-observed";
}

/**
 * Prospective evidence-transition decision. Pure: never mutates lifecycle
 * state. Pause/block yield an occurrence proposal and never a transition
 * proposal. Allow may be degraded when satisfied only via a bound acknowledgment.
 */
export function planEvidenceTransition(
  projection: RunTrackProjection,
  request: EvidenceTransitionRequest,
): EvidenceTransitionPlan {
  const staleAcknowledgmentIds: string[] = [];

  const fail = (
    decision: Exclude<TransitionDecision, "allow">,
    reason: string,
    factsDigest: string | null,
  ): EvidenceTransitionPlan => ({
    decision,
    reason,
    degraded: false,
    policyVersion: RUN_TRACK_POLICY_VERSION,
    factsDigest,
    occurrenceProposal: factsDigest
      ? {
          kind: "guardrail.occurred",
          action: isToken(request.action, ACTION_RE) ? request.action : "invalid-action",
          decision,
          reason,
          policyVersion: RUN_TRACK_POLICY_VERSION,
          factsDigest,
        }
      : {
          kind: "guardrail.occurred",
          action: isToken(request.action, ACTION_RE) ? request.action : "invalid-action",
          decision,
          reason,
          policyVersion: RUN_TRACK_POLICY_VERSION,
          factsDigest: runTrackEvaluationDigest({
            error: reason,
            trackId: projection.trackId,
          }),
        },
    transitionProposal: null,
    matchedAcknowledgmentId: null,
    staleAcknowledgmentIds,
  });

  if (!isToken(request?.action, ACTION_RE)) {
    return fail("block", "invalid transition action", projection.factsDigest);
  }
  if (!Array.isArray(request.requiredKeys) || request.requiredKeys.some((key) => !isToken(key, KEY_RE))) {
    return fail("block", "invalid requiredKeys", projection.factsDigest);
  }
  if (new Set(request.requiredKeys).size !== request.requiredKeys.length) {
    return fail("block", "duplicate requiredKeys", projection.factsDigest);
  }

  if (!projection.healthy) {
    return fail(
      "block",
      "active branch contains malformed run-track events",
      projection.factsDigest ??
        runTrackEvaluationDigest({
          malformed: true,
          errors: projection.parseErrors,
        }),
    );
  }

  if (projection.trackId === null || projection.factsDigest === null) {
    return fail(
      "block",
      "no active run-track task on branch",
      runTrackEvaluationDigest({ trackId: null, empty: true }),
    );
  }

  const factsDigest = projection.factsDigest;
  const missing: string[] = [];
  const unresolved: string[] = [];
  const present: ProjectedEvidence[] = [];

  for (const key of request.requiredKeys) {
    const item = projection.evidenceByKey[key];
    if (!item) {
      missing.push(key);
      continue;
    }
    if (item.resolution === "unresolved") {
      unresolved.push(key);
      continue;
    }
    present.push(item);
  }

  // Hard, non-waivable: missing or unresolved evidence cannot be acknowledged away.
  if (missing.length > 0) {
    return fail("block", `missing evidence: ${missing.join(",")}`, factsDigest);
  }
  if (unresolved.length > 0) {
    return fail("block", `unresolved evidence: ${unresolved.join(",")}`, factsDigest);
  }

  const selfAttestedOnly = present.length > 0 && present.every((item) => item.trust === "self-attested");
  const hasElevated = present.some((item) => higherTrust(item.trust));
  // No required keys → treat as allow only when elevated evidence exists? Spec says
  // missing required evidence blocks; empty requiredKeys means no evidence obligation.
  const noEvidenceRequired = request.requiredKeys.length === 0;

  // Collect ack candidates bound to this action + policy + current facts.
  const occurrencesForAction = projection.occurrences.filter(
    (occ) =>
      occ.action === request.action &&
      occ.policyVersion === RUN_TRACK_POLICY_VERSION &&
      occ.factsDigest === factsDigest,
  );

  let matchedAcknowledgmentId: string | null = null;
  let matchedOccurrence: ProjectedOccurrence | null = null;

  for (const ack of projection.acknowledgments) {
    if (ack.action !== request.action) continue;
    if (ack.policyVersion !== RUN_TRACK_POLICY_VERSION) continue;
    if (ack.origin !== "operator-interactive") continue;

    const occurrence = projection.occurrences.find((occ) => occ.occurrenceId === ack.occurrenceId);
    if (!occurrence) continue;
    // Ordering: acknowledgment must follow its occurrence (pre-transition binding).
    if (ack.order <= occurrence.order) continue;
    if (occurrence.action !== ack.action) continue;
    if (occurrence.policyVersion !== ack.policyVersion) continue;

    // Stale when facts diverged from the bound digest.
    if (ack.factsDigest !== factsDigest || occurrence.factsDigest !== factsDigest) {
      staleAcknowledgmentIds.push(ack.acknowledgmentId);
      continue;
    }

    // Only soft pauses are acknowledgeable into a degraded allow.
    if (occurrence.decision !== "pause") {
      continue;
    }

    if (
      occurrencesForAction.some((occ) => occ.occurrenceId === occurrence.occurrenceId) &&
      matchedAcknowledgmentId === null
    ) {
      matchedAcknowledgmentId = ack.acknowledgmentId;
      matchedOccurrence = occurrence;
    }
  }

  if (selfAttestedOnly && !noEvidenceRequired) {
    if (matchedAcknowledgmentId && matchedOccurrence) {
      return {
        decision: "allow",
        reason: "operator acknowledgment accepts self-attested-only evidence as degraded",
        degraded: true,
        policyVersion: RUN_TRACK_POLICY_VERSION,
        factsDigest,
        occurrenceProposal: null,
        transitionProposal: {
          kind: "task.transition-observed",
          action: request.action,
          factsDigest,
          degraded: true,
          acknowledgmentId: matchedAcknowledgmentId,
        },
        matchedAcknowledgmentId,
        staleAcknowledgmentIds,
      };
    }

    return fail("pause", "self-attested-only evidence", factsDigest);
  }

  if (hasElevated || noEvidenceRequired) {
    return {
      decision: "allow",
      reason: noEvidenceRequired ? "no evidence keys required" : "required evidence satisfied",
      degraded: false,
      policyVersion: RUN_TRACK_POLICY_VERSION,
      factsDigest,
      occurrenceProposal: null,
      transitionProposal: {
        kind: "task.transition-observed",
        action: request.action,
        factsDigest,
        degraded: false,
        acknowledgmentId: null,
      },
      matchedAcknowledgmentId: null,
      staleAcknowledgmentIds,
    };
  }

  // Present keys with unexpected trust mix (should be unreachable given trust enum).
  return fail("block", "evidence trust requirements not met", factsDigest);
}

// ---------------------------------------------------------------------------
// Fork lineage — runtime session derived, idempotent, no caller parent authority
// ---------------------------------------------------------------------------

/**
 * Derive child fork lineage from a parent projection and the runtime-assigned
 * child session id. Parent track/session come only from the projection; callers
 * cannot inject parent authority fields.
 */
export function deriveRunTrackFork(input: ForkDerivationInput): ParseResult<RunTrackLineage> {
  const parent = input?.parent;
  const childSessionId = input?.childSessionId;

  if (!parent || typeof parent !== "object") {
    return { ok: false, error: "parent projection required" };
  }
  if (!isToken(childSessionId, ID_RE)) {
    return { ok: false, error: "invalid childSessionId" };
  }
  if (!parent.healthy) {
    return { ok: false, error: "parent projection is unhealthy" };
  }
  if (!parent.trackId || !parent.sessionId) {
    return { ok: false, error: "parent projection missing track/session identity" };
  }

  const rootTrackId = parent.lineage?.rootTrackId ?? parent.trackId;
  const material = canonicalRunTrackJson({
    v: RUN_TRACK_VERSION,
    ns: RUN_TRACK_NAMESPACE,
    parentTrackId: parent.trackId,
    parentSessionId: parent.sessionId,
    rootTrackId,
    childSessionId,
  });
  const childTrackId = `fork:${createHash("sha256").update(material, "utf8").digest("hex").slice(0, 32)}`;

  return {
    ok: true,
    value: {
      childTrackId,
      parentTrackId: parent.trackId,
      parentSessionId: parent.sessionId,
      rootTrackId,
    },
  };
}

// ---------------------------------------------------------------------------
// Compact receipt
// ---------------------------------------------------------------------------

/**
 * Build a bounded receipt for tool-result details / logs. Never embeds journal
 * state or raw evidence content.
 */
export function createRunTrackReceipt(
  projection: RunTrackProjection,
  plan?: EvidenceTransitionPlan | null,
): RunTrackReceipt {
  const evidenceKeys = Object.keys(projection.evidenceByKey).sort();
  return {
    ns: RUN_TRACK_NAMESPACE,
    trackId: projection.trackId,
    healthy: projection.healthy,
    decision: plan?.decision ?? null,
    degraded: plan?.degraded ?? false,
    reason: plan?.reason ?? null,
    factsDigest: plan?.factsDigest ?? projection.factsDigest,
    policyVersion: RUN_TRACK_POLICY_VERSION,
    eventCount: projection.eventCount,
    evidenceKeys,
    occurrenceCount: projection.occurrences.length,
    transitionCount: projection.transitions.length,
  };
}
