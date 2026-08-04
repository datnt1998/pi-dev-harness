import { createHash } from "node:crypto";

/** The only evidence-envelope version understood by this package revision. */
export const TEAM_ORCHESTRATION_PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof TEAM_ORCHESTRATION_PROTOCOL_VERSION;
export type RequestedOutcome = "completed" | "retry" | "failed" | "blocked" | "needs_decision";
export type DelegatedRole = "producer" | "standards-reviewer" | "spec-reviewer" | "fix-writer" | "parent";
export type WriterPhase = "implementation" | "fix" | "closed";
/** Roles that may hold mutation authority. Reviewers are intentionally excluded. */
export type WriterOwnerRole = "parent" | "worker" | "fix-writer";
export type WriterLane = "parent" | "worker";
export type ImportantReasoningClass = "none" | "present" | "unknown-mixed";
export type EligibilityReasonCode =
  | "frozen-bounded-worker"
  | "important-reasoning-parent"
  | "unknown-mixed-parent"
  | "tiny-known-parent"
  | "unsafe-isolation-parent"
  | "ineligible-worker-conditions";
export type ReviewAxis = "standards" | "spec";
export type FindingDisposition = "accepted" | "rejected" | "deferred" | "escalated";
export type IndependenceLevel = "provider-distinct" | "provider-overlap" | "axis-missing" | "combined" | "self-review" | "unknown";
export type LeaseOpFailureCode =
  | "overlap"
  | "stale"
  | "orphan"
  | "contradiction"
  | "reviewer-mutation-authority"
  | "fix-disposition-missing"
  | "fix-round-exhausted"
  | "open-lease"
  | "invalid-request";

export type ProviderIdentity = {
  /** Actual resolved generic provider family, not a requested project-local route name. */
  provider: string;
  model?: string;
  requestedProvider?: string;
  requestedModel?: string;
  /** Whether actual execution diverged from the requested route. */
  fallback: boolean;
  /** Observation confidence for the effective model route. */
  effectiveModel?: "verified" | "unverified" | "unknown";
  /** Observation confidence for the effective thinking/runtime setting, never an inferred claim. */
  effectiveThinking?: "verified" | "unverified" | "unknown";
};

export type NormalizedProviderIdentity = {
  provider: string;
  model?: string;
};

export type WorkUnitIdentity = {
  source: string;
  sourceFingerprint: string;
  ticketId: string;
  purpose: string;
  attempt: number;
};

export type RunAcceptanceMode = "auto" | "attested" | "checked" | "verified" | "reviewed" | "none";

export type RunProvenance = {
  role: DelegatedRole;
  actor: string;
  runId: string;
  contextMode: "fresh" | "inherited" | "unknown";
  /** Records how this delegated run's result was accepted at runtime. */
  acceptanceMode: RunAcceptanceMode;
  provider: ProviderIdentity;
};

export type WriterLeaseEvidence = {
  leaseId: string;
  /** Work-unit coordinates retained after close for per-ticket/attempt provenance. */
  ticketId: string;
  attempt: number;
  /** Stable key for the exclusive worktree/mutation domain. */
  worktreeKey: string;
  owner: string;
  ownerRole: WriterOwnerRole;
  phase: WriterPhase;
  allowedPaths: string[];
  openedAt: string;
  closedAt?: string;
  /** Parent-observed stable implementation state after the writer closed the lease. */
  handoffFingerprint?: string;
  /** Present when phase is/was fix and the parent issued a bounded brief. */
  fixBriefId?: string;
};

/** Runtime exclusive lease for one active worktree. Open phases only. */
export type ActiveWriterLease = {
  leaseId: string;
  worktreeKey: string;
  owner: string;
  ownerRole: WriterOwnerRole;
  phase: Exclude<WriterPhase, "closed">;
  ticketId: string;
  attempt: number;
  allowedPaths: string[];
  openedAt: string;
  fixBriefId?: string;
};

/** Parent eligibility decision that selected the implementation lane. */
export type WriterEligibilityEvidence = {
  lane: WriterLane;
  reasonCode: EligibilityReasonCode;
  rule: string;
  architectureFrozen: boolean;
  scopeExplicit: boolean;
  reversible: boolean;
  falsifiableBar: string;
  validationAvailable: boolean;
  freshContext: boolean;
  checkedAcceptance: boolean;
  pilotMember: boolean;
  allowedPaths: string[];
  importantReasoning: ImportantReasoningClass;
  /** Explicit fact for tiny-known-parent; must match reasonCode. */
  tinyKnownDiff: boolean;
  /** Explicit fact for unsafe-isolation-parent; must match reasonCode. */
  leaseSafetyAvailable: boolean;
};

export type WriterEligibilityInput = {
  architectureFrozen: boolean;
  scopeExplicit: boolean;
  reversible: boolean;
  falsifiableBar: string;
  validationAvailable: boolean;
  freshContext: boolean;
  checkedAcceptance: boolean;
  pilotMember: boolean;
  allowedPaths: string[];
  importantReasoning: ImportantReasoningClass;
  /** When true, the parent should write the tiny known diff directly. */
  tinyKnownDiff?: boolean;
  /** Writer-lease safety/isolation can be enforced. */
  leaseSafetyAvailable: boolean;
};

/** Parent-authored bounded fix instructions. Only accepted findings may appear. */
export type FixBriefEvidence = {
  briefId: string;
  parentActor: string;
  acceptedFindingIds: string[];
  scopePaths: string[];
  summary: string;
  issuedAt: string;
};

/** Explicit attribution when the parent writes after a delegated worker attempt. */
export type ParentImplementationAfterDelegation = {
  occurred: boolean;
  attribution?: "rework" | "strong-route";
  evidenceLocator?: string;
};

export type ImplementationState = {
  changedPaths: string[];
  fingerprint: string;
};

export type Observation = {
  summary: string;
  locators: string[];
  replayCommands: string[];
};

export type ParentValidation = {
  command: string;
  outcome: "passed" | "failed" | "not-run";
  locator: string;
  observedFingerprint: string;
};

export type ReviewFinding = {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  locator: string;
  replay: string;
};

export type ReviewerSealEvidence =
  | {
    /** Runtime capability controls prevented project mutation. */
    mode: "capability";
    readOnlyCapabilities: string[];
    evidenceLocator: string;
  }
  | {
    /** Isolated/serialized review made any mutation observable. */
    mode: "serialized";
    preMutationFingerprint: string;
    postMutationFingerprint: string;
    evidenceLocator: string;
  };

export type ReviewEvidence = {
  axis: ReviewAxis;
  run: RunProvenance;
  reviewedFingerprint: string;
  /** Required evidence of actual read-only enforcement, never just a role label. */
  sealing?: ReviewerSealEvidence;
  verdict: "findings" | "no-findings" | "unable-to-review";
  findings: ReviewFinding[];
};

export type FindingDispositionEvidence = {
  findingId: string;
  disposition: FindingDisposition;
  parentActor: string;
  evidenceLocator: string;
  residualRisk?: string;
};

export type FixAndRereviewEvidence = {
  /** Ordinary path permits 0 or 1. A second substantial fix must escalate instead. */
  round: number;
  fixApplied: boolean;
  fixBrief?: FixBriefEvidence;
  /** Closed fix-writer lease tied to the brief and final handoff. Required when fixApplied. */
  fixLease?: WriterLeaseEvidence;
  fixValidation?: ParentValidation[];
  focusedRereview?: ReviewEvidence[];
  /** True when a second substantial fix was required and the parent escalated. */
  escalatedInsteadOfSecondFix?: boolean;
  escalationLocator?: string;
};

export type CompletionFidelity = {
  criteria: Record<"C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7", "verified" | "unverified" | "not-applicable">;
  claims: Array<{ claim: string; locator: string; verifiedBy: string }>;
};

export type DiversityWarning = {
  targetTopology: string;
  configuredProviders: string[];
  actualProviders: string[];
  missingOrOverlapping: string;
  qualityConsequence: string;
  configurationGuidance: string;
};

export type DiversityEvidence = {
  achievedIndependence: IndependenceLevel;
  degraded: boolean;
  /** Explicitly records whether this assignment is eligible as clean pilot evidence. */
  cleanPilotEvidence?: boolean;
  warning?: DiversityWarning;
  acknowledgment?: { actor: string; at: string; decision: "continue" | "stop"; reason: string };
};

export type ParentGate = {
  actor: string;
  role: "parent";
  action: "accepted" | "rejected" | "escalated";
  observedFingerprint: string;
  evidenceLocator: string;
};

/** Replayable owner-decision evidence. The exact blocking question is part of its identity. */
export type DecisionPacket = {
  affectedWorkUnitIds: string[];
  affectedTicketIds: string[];
  affectedFiles: string[];
  locatorOrGlob: string;
  searchedScope: string;
  exclusions: string[];
  pattern: string;
  patternKind: "code-shape" | "decision-category" | "combined";
  occurrences?: number;
  notCountedReason?: string;
  representativeLocators: string[];
  question: string;
  safeDefault: string;
  consequences: string;
  replayCommand: string;
  disconfirmProcedure: string;
  blockedStage: string;
  unrelatedWorkSafe: boolean;
};

export type TeamOrchestrationEnvelopeV1 = {
  protocolVersion: ProtocolVersion;
  workUnit: WorkUnitIdentity;
  runs: RunProvenance[];
  /** Explicit parent lane decision; never inferred from role labels alone. */
  eligibility: WriterEligibilityEvidence;
  writerLease: WriterLeaseEvidence;
  implementation: ImplementationState;
  producerObservations: Observation[];
  parentValidation: ParentValidation[];
  reviews: ReviewEvidence[];
  dispositions: FindingDispositionEvidence[];
  fixAndRereview: FixAndRereviewEvidence;
  completionFidelity: CompletionFidelity;
  diversity: DiversityEvidence;
  residualRisks: string[];
  requestedOutcome: RequestedOutcome;
  /** Required only when requestedOutcome is needs_decision. */
  decisionPacket?: DecisionPacket;
  /** Required on completion when the implementation lane was worker. */
  parentImplementationAfterDelegation?: ParentImplementationAfterDelegation;
  parentGate: ParentGate;
};

export type ProtocolFailureCode =
  | "missing-version"
  | "unknown-version"
  | "malformed-envelope"
  | "child-gate-authority"
  | "invalid-parent-gate"
  | "invalid-provider-diversity"
  | "invalid-review-integrity"
  | "invalid-finding-disposition"
  | "invalid-decision-packet"
  | "invalid-writer-eligibility"
  | "invalid-writer-lease"
  | "invalid-fix-round";

export type ProtocolValidationFailure = {
  ok: false;
  error: { code: ProtocolFailureCode; message: string; path?: string };
};

export type ProtocolValidationSuccess = { ok: true; value: TeamOrchestrationEnvelopeV1 };
export type ProtocolValidationResult = ProtocolValidationSuccess | ProtocolValidationFailure;

function failure(code: ProtocolFailureCode, message: string, path?: string): ProtocolValidationFailure {
  return { ok: false, error: { code, message, path } };
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

/**
 * Collapses route/model aliases to the declared provider family. No provider
 * lookup is performed: callers must provide actual resolved provenance.
 */
export function normalizeProviderIdentity(identity: Pick<ProviderIdentity, "provider" | "model"> | string | undefined): NormalizedProviderIdentity | undefined {
  const rawProvider = typeof identity === "string" ? identity : identity?.provider;
  if (!nonEmpty(rawProvider)) return undefined;
  const provider = rawProvider.trim().normalize("NFKC").toLowerCase().split(/[/:]/, 1)[0].trim().replace(/\s+/g, "-");
  if (!provider) return undefined;
  const model = typeof identity === "string" ? undefined : identity.model?.trim().normalize("NFKC").toLowerCase();
  return model ? { provider, model } : { provider };
}

export type IndependenceTopology = {
  producer?: ProviderIdentity;
  standards?: ProviderIdentity;
  spec?: ProviderIdentity;
  producerActor?: string;
  standardsActor?: string;
  specActor?: string;
  combined?: boolean;
  /** Completion provenance requires explicit effective-thinking verification. */
  requireVerifiedEffectiveThinking?: boolean;
};

/** Computes provenance, never an authorization to continue a degraded run. */
export function classifyIndependence(topology: IndependenceTopology): IndependenceLevel {
  if (!topology.standards || !topology.spec) return "axis-missing";
  if (!topology.producer) return "unknown";
  if (topology.producerActor && (topology.producerActor === topology.standardsActor || topology.producerActor === topology.specActor)) return "self-review";
  if (topology.combined || (topology.standardsActor !== undefined && topology.standardsActor === topology.specActor)) return "combined";
  const provenance = [topology.producer, topology.standards, topology.spec] as Array<Pick<ProviderIdentity, "provider" | "model"> & Partial<ProviderIdentity>>;
  // Actual route facts, not requested route names, control the claim. A fallback
  // or absent/unverified effective-thinking observation cannot be clean evidence.
  if (provenance.some((identity) => identity.fallback === true || (topology.requireVerifiedEffectiveThinking && (identity.effectiveModel !== "verified" || identity.effectiveThinking !== "verified")))) return "unknown";
  const identities = provenance.map(normalizeProviderIdentity);
  if (identities.some((identity) => !identity)) return "unknown";
  const providers = identities.map((identity) => identity!.provider);
  return new Set(providers).size === providers.length ? "provider-distinct" : "provider-overlap";
}

export function isProviderIndependent(level: IndependenceLevel): boolean {
  return level === "provider-distinct";
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (object(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key.normalize("NFC"), canonicalize(value[key])]));
  }
  return value;
}

/** Hashes a normalized, key-order-independent representation of state evidence. */
export function implementationStateFingerprint(state: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(state)), "utf8").digest("hex");
}

const WORKER_ELIGIBILITY_RULE = "worker lane requires frozen architecture, explicit reversible scope, parent-known falsifiable bar, validation/replay, fresh context, checked acceptance, lease safety, and pilot membership";

/**
 * Fail-closed lane decision. Unknown/mixed important reasoning and unmet worker
 * conditions stay on the parent lane (or require a decision packet).
 */
export function decideWriterEligibility(input: WriterEligibilityInput): WriterEligibilityDecision {
  const allowedPaths = input.allowedPaths.filter((path) => nonEmpty(path));
  const bar = input.falsifiableBar?.trim() ?? "";
  if (input.importantReasoning === "unknown-mixed") {
    return { lane: "parent", reasonCode: "unknown-mixed-parent", rule: "unknown or mixed important-reasoning classification fails closed to parent or decision evidence", allowedPaths, falsifiableBar: bar, requiresDecision: true };
  }
  if (input.importantReasoning === "present") {
    return { lane: "parent", reasonCode: "important-reasoning-parent", rule: "unresolved important reasoning remains parent-owned", allowedPaths, falsifiableBar: bar, requiresDecision: false };
  }
  if (input.tinyKnownDiff) {
    return { lane: "parent", reasonCode: "tiny-known-parent", rule: "tiny known diffs stay on the parent writer lane", allowedPaths, falsifiableBar: bar, requiresDecision: false };
  }
  if (!input.leaseSafetyAvailable) {
    return { lane: "parent", reasonCode: "unsafe-isolation-parent", rule: "worker writing requires enforceable one-writer lease safety", allowedPaths, falsifiableBar: bar, requiresDecision: false };
  }
  const workerReady = input.architectureFrozen && input.scopeExplicit && input.reversible && bar.length > 0
    && input.validationAvailable && input.freshContext && input.checkedAcceptance && input.pilotMember && allowedPaths.length > 0;
  if (!workerReady) {
    return { lane: "parent", reasonCode: "ineligible-worker-conditions", rule: WORKER_ELIGIBILITY_RULE, allowedPaths, falsifiableBar: bar, requiresDecision: false };
  }
  return { lane: "worker", reasonCode: "frozen-bounded-worker", rule: WORKER_ELIGIBILITY_RULE, allowedPaths, falsifiableBar: bar, requiresDecision: false };
}

export type WriterEligibilityDecision = {
  lane: WriterLane;
  reasonCode: EligibilityReasonCode;
  rule: string;
  allowedPaths: string[];
  falsifiableBar: string;
  requiresDecision: boolean;
};

/** Only WriterOwnerRole values may hold mutation authority. Reviewer/producer labels never grant it. */
export function roleMayAcquireWriterLease(role: string, acceptanceMode?: string): boolean {
  void acceptanceMode;
  return role === "parent" || role === "worker" || role === "fix-writer";
}

export function canStartReviewAgainstLease(lease: Pick<WriterLeaseEvidence, "phase"> | ActiveWriterLease | undefined | null): { ok: true } | { ok: false; code: "open-lease"; message: string } {
  if (lease && lease.phase !== "closed") {
    return { ok: false, code: "open-lease", message: "Review cannot start while a writer lease is open." };
  }
  return { ok: true };
}

export type LeaseOpResult<T> = { ok: true; value: T } | { ok: false; error: { code: LeaseOpFailureCode; message: string } };

function leaseFailure(code: LeaseOpFailureCode, message: string): LeaseOpResult<never> {
  return { ok: false, error: { code, message } };
}

/** True when every path is present in the allowed scope (exact path match). */
export function pathsContainedByScope(paths: string[], scope: string[]): boolean {
  const allowed = new Set(scope);
  return paths.length > 0 && paths.every((path) => allowed.has(path));
}

/** Acquire the single exclusive worktree lease, or fail closed on overlap/role/fix preconditions. */
export function acquireExclusiveWriterLease(
  current: ActiveWriterLease | undefined | null,
  request: ActiveWriterLease,
  context: {
    inProgressTicketId?: string;
    dispositions?: FindingDispositionEvidence[];
    fixBrief?: FixBriefEvidence;
    priorFixRounds?: number;
    /** Implementation eligibility/allowed scope the runtime may mutate under. */
    implementationScopePaths?: string[];
  } = {},
): LeaseOpResult<ActiveWriterLease> {
  if (!nonEmpty(request.leaseId) || !nonEmpty(request.worktreeKey) || !nonEmpty(request.owner) || !nonEmpty(request.ticketId) || !Number.isInteger(request.attempt) || request.attempt < 1 || !nonEmpty(request.openedAt) || !Array.isArray(request.allowedPaths) || request.allowedPaths.length === 0 || !request.allowedPaths.every(nonEmpty)) {
    return leaseFailure("invalid-request", "Writer lease request is missing required identity, scope, or ownership fields.");
  }
  if (!roleMayAcquireWriterLease(request.ownerRole)) {
    return leaseFailure("reviewer-mutation-authority", "Only parent, worker, or fix-writer roles may acquire mutation authority.");
  }
  if (request.ownerRole === "fix-writer" && request.phase !== "fix") {
    return leaseFailure("invalid-request", "fix-writer leases must use the fix phase.");
  }
  if (request.phase === "implementation" && request.ownerRole === "fix-writer") {
    return leaseFailure("invalid-request", "Implementation leases cannot use the fix-writer role.");
  }
  if (request.phase === "implementation" && context.implementationScopePaths !== undefined
    && !pathsContainedByScope(request.allowedPaths, context.implementationScopePaths)) {
    return leaseFailure("invalid-request", "Implementation lease allowedPaths must be contained by eligibility scope.");
  }
  if (current) {
    if (current.worktreeKey === request.worktreeKey) return leaseFailure("overlap", "An active writer already holds the worktree lease.");
    return leaseFailure("overlap", "Another worktree lease is already open in this batch control plane.");
  }
  if (context.inProgressTicketId !== undefined && context.inProgressTicketId !== request.ticketId) {
    return leaseFailure("stale", "Lease ticket does not match the active in-progress work unit.");
  }
  if (request.phase === "fix") {
    const brief = context.fixBrief;
    const dispositions = context.dispositions ?? [];
    if (!brief || brief.briefId !== request.fixBriefId) return leaseFailure("fix-disposition-missing", "Fix leases require a parent fix brief after finding disposition.");
    if ((context.priorFixRounds ?? 0) >= 1) return leaseFailure("fix-round-exhausted", "Only one ordinary fix-worker round is permitted; escalate instead of looping.");
    const accepted = new Set(dispositions.filter((item) => item.disposition === "accepted").map((item) => item.findingId));
    if (brief.acceptedFindingIds.length === 0 || brief.acceptedFindingIds.some((id) => !accepted.has(id))) {
      return leaseFailure("fix-disposition-missing", "Fix brief may contain only parent-accepted findings.");
    }
    if (!pathsContainedByScope(request.allowedPaths, brief.scopePaths)) {
      return leaseFailure("invalid-request", "Fix lease allowedPaths must be contained by the parent fix brief scopePaths.");
    }
    if (context.implementationScopePaths !== undefined && !pathsContainedByScope(request.allowedPaths, context.implementationScopePaths)) {
      return leaseFailure("invalid-request", "Fix lease allowedPaths must be contained by implementation eligibility scope.");
    }
  }
  return { ok: true, value: { ...request, allowedPaths: [...request.allowedPaths] } };
}

/** Close/handoff an exclusive lease only when identity matches the holder. */
export function closeExclusiveWriterLease(
  current: ActiveWriterLease | undefined | null,
  input: { leaseId: string; owner: string; closedAt: string; handoffFingerprint: string },
): LeaseOpResult<WriterLeaseEvidence> {
  if (!current) return leaseFailure("orphan", "No active writer lease exists to close.");
  if (current.leaseId !== input.leaseId || current.owner !== input.owner) {
    return leaseFailure("contradiction", "Close/handoff does not match the active lease owner or id.");
  }
  if (!nonEmpty(input.closedAt) || !nonEmpty(input.handoffFingerprint)) {
    return leaseFailure("invalid-request", "Lease handoff requires closedAt and handoffFingerprint.");
  }
  return {
    ok: true,
    value: {
      leaseId: current.leaseId,
      ticketId: current.ticketId,
      attempt: current.attempt,
      worktreeKey: current.worktreeKey,
      owner: current.owner,
      ownerRole: current.ownerRole,
      phase: "closed",
      allowedPaths: [...current.allowedPaths],
      openedAt: current.openedAt,
      closedAt: input.closedAt,
      handoffFingerprint: input.handoffFingerprint,
      fixBriefId: current.fixBriefId,
    },
  };
}

/** Detect orphaned or contradictory persisted leases relative to ticket progress. */
export function inspectPersistedWriterLease(
  lease: ActiveWriterLease | undefined | null,
  context: { ticketStatuses: Record<string, string>; inProgressTicketId?: string },
): LeaseOpResult<ActiveWriterLease | undefined> {
  if (!lease) return { ok: true, value: undefined };
  const status = context.ticketStatuses[lease.ticketId];
  if (status === undefined) return leaseFailure("contradiction", "Active lease references an unknown ticket.");
  if (status !== "in_progress") return leaseFailure("orphan", "Active lease is orphaned because its ticket is not in progress.");
  if (context.inProgressTicketId && context.inProgressTicketId !== lease.ticketId) {
    return leaseFailure("contradiction", "Active lease contradicts the in-progress ticket.");
  }
  return { ok: true, value: lease };
}

/** Authorize at most one ordinary fix-worker round from parent dispositions + brief. */
export function authorizeFixWorkerRound(input: {
  priorFixRounds: number;
  dispositions: FindingDispositionEvidence[];
  fixBrief: FixBriefEvidence;
  substantialSecondFixNeeded?: boolean;
}): LeaseOpResult<FixBriefEvidence> {
  if (input.substantialSecondFixNeeded || input.priorFixRounds >= 1) {
    return leaseFailure("fix-round-exhausted", "A second substantial fix, repeated finding, or fix-loop conflict must escalate rather than acquire another fix lease.");
  }
  const accepted = new Set(input.dispositions.filter((item) => item.disposition === "accepted").map((item) => item.findingId));
  if (!nonEmpty(input.fixBrief.briefId) || !nonEmpty(input.fixBrief.parentActor) || !nonEmpty(input.fixBrief.summary) || !nonEmpty(input.fixBrief.issuedAt)
    || !Array.isArray(input.fixBrief.acceptedFindingIds) || input.fixBrief.acceptedFindingIds.length === 0 || !input.fixBrief.acceptedFindingIds.every(nonEmpty)
    || !Array.isArray(input.fixBrief.scopePaths) || input.fixBrief.scopePaths.length === 0 || !input.fixBrief.scopePaths.every(nonEmpty)) {
    return leaseFailure("invalid-request", "Fix brief is incomplete.");
  }
  if (input.fixBrief.acceptedFindingIds.some((id) => !accepted.has(id))) {
    return leaseFailure("fix-disposition-missing", "Fix brief may contain only parent-accepted in-scope findings.");
  }
  return { ok: true, value: input.fixBrief };
}

export function isDecisionPacket(value: unknown): value is DecisionPacket {
  if (!object(value)
    || !strings(value.affectedWorkUnitIds) || value.affectedWorkUnitIds.length === 0
    || !strings(value.affectedTicketIds) || value.affectedTicketIds.length === 0
    || !strings(value.affectedFiles) || value.affectedFiles.length === 0
    || !nonEmpty(value.locatorOrGlob) || !nonEmpty(value.searchedScope) || !strings(value.exclusions)
    || !nonEmpty(value.pattern) || !["code-shape", "decision-category", "combined"].includes(value.patternKind as string)
    || !strings(value.representativeLocators) || value.representativeLocators.length === 0
    || !nonEmpty(value.question) || !nonEmpty(value.safeDefault) || !nonEmpty(value.consequences)
    || !nonEmpty(value.replayCommand) || !nonEmpty(value.disconfirmProcedure)
    || !nonEmpty(value.blockedStage) || typeof value.unrelatedWorkSafe !== "boolean") return false;
  const hasCount = Number.isInteger(value.occurrences) && (value.occurrences as number) >= 0;
  const hasReason = nonEmpty(value.notCountedReason);
  return hasCount !== hasReason;
}

/**
 * Deterministic structural identity for one owner decision. Evidence which can
 * aggregate (affected IDs/files, representative locators, and replay details)
 * intentionally stays out; the exact blocking question prevents distinct owner
 * choices at one locus from collapsing into one escalation.
 */
export function decisionPacketEquivalenceKey(packet: DecisionPacket): string {
  return implementationStateFingerprint({
    patternKind: packet.patternKind,
    pattern: packet.pattern,
    locatorOrGlob: packet.locatorOrGlob,
    searchedScope: packet.searchedScope,
    exclusions: [...packet.exclusions].sort(),
    question: packet.question,
    safeDefault: packet.safeDefault,
    blockedStage: packet.blockedStage,
  });
}

function validProvider(value: unknown): boolean {
  return object(value) && nonEmpty(value.provider) && typeof value.fallback === "boolean"
    && (value.model === undefined || nonEmpty(value.model))
    && (value.requestedProvider === undefined || nonEmpty(value.requestedProvider))
    && (value.requestedModel === undefined || nonEmpty(value.requestedModel))
    && (value.effectiveModel === undefined || ["verified", "unverified", "unknown"].includes(value.effectiveModel as string))
    && (value.effectiveThinking === undefined || ["verified", "unverified", "unknown"].includes(value.effectiveThinking as string));
}

function validRun(value: unknown): boolean {
  return object(value) && ["producer", "standards-reviewer", "spec-reviewer", "fix-writer", "parent"].includes(value.role as string)
    && nonEmpty(value.actor) && nonEmpty(value.runId) && ["fresh", "inherited", "unknown"].includes(value.contextMode as string)
    && ["auto", "attested", "checked", "verified", "reviewed", "none"].includes(value.acceptanceMode as string) && validProvider(value.provider);
}

function validValidation(value: unknown): boolean {
  return object(value) && nonEmpty(value.command) && ["passed", "failed", "not-run"].includes(value.outcome as string)
    && nonEmpty(value.locator) && nonEmpty(value.observedFingerprint);
}

function validReviewerSeal(value: unknown): boolean {
  if (!object(value) || !nonEmpty(value.evidenceLocator)) return false;
  if (value.mode === "capability") return strings(value.readOnlyCapabilities) && value.readOnlyCapabilities.length > 0;
  return value.mode === "serialized" && nonEmpty(value.preMutationFingerprint) && nonEmpty(value.postMutationFingerprint);
}

function validReview(value: unknown): boolean {
  return object(value) && ["standards", "spec"].includes(value.axis as string) && validRun(value.run)
    && ((value.axis === "standards" && object(value.run) && value.run.role === "standards-reviewer") || (value.axis === "spec" && object(value.run) && value.run.role === "spec-reviewer"))
    && nonEmpty(value.reviewedFingerprint) && (value.sealing === undefined || validReviewerSeal(value.sealing))
    && ["findings", "no-findings", "unable-to-review"].includes(value.verdict as string)
    && Array.isArray(value.findings) && value.findings.every((finding) => object(finding) && nonEmpty(finding.id)
      && ["low", "medium", "high", "critical"].includes(finding.severity as string) && nonEmpty(finding.summary) && nonEmpty(finding.locator) && nonEmpty(finding.replay));
}

function validEligibility(value: unknown): boolean {
  return object(value) && ["parent", "worker"].includes(value.lane as string)
    && ["frozen-bounded-worker", "important-reasoning-parent", "unknown-mixed-parent", "tiny-known-parent", "unsafe-isolation-parent", "ineligible-worker-conditions"].includes(value.reasonCode as string)
    && nonEmpty(value.rule) && typeof value.architectureFrozen === "boolean" && typeof value.scopeExplicit === "boolean" && typeof value.reversible === "boolean"
    && nonEmpty(value.falsifiableBar) && typeof value.validationAvailable === "boolean" && typeof value.freshContext === "boolean" && typeof value.checkedAcceptance === "boolean"
    && typeof value.pilotMember === "boolean" && strings(value.allowedPaths) && ["none", "present", "unknown-mixed"].includes(value.importantReasoning as string)
    && typeof value.tinyKnownDiff === "boolean" && typeof value.leaseSafetyAvailable === "boolean";
}

function validWriterLeaseEvidence(value: unknown, requireClosed = false): boolean {
  if (!object(value) || !nonEmpty(value.leaseId) || !nonEmpty(value.ticketId) || !Number.isInteger(value.attempt) || (value.attempt as number) < 1 || !nonEmpty(value.worktreeKey) || !nonEmpty(value.owner)
    || !["parent", "worker", "fix-writer"].includes(value.ownerRole as string)
    || !["implementation", "fix", "closed"].includes(value.phase as string)
    || !strings(value.allowedPaths) || value.allowedPaths.length === 0 || !nonEmpty(value.openedAt)
    || (value.closedAt !== undefined && !nonEmpty(value.closedAt))
    || (value.handoffFingerprint !== undefined && !nonEmpty(value.handoffFingerprint))
    || (value.fixBriefId !== undefined && !nonEmpty(value.fixBriefId))) return false;
  if (!requireClosed) return true;
  return value.phase === "closed" && nonEmpty(value.closedAt) && nonEmpty(value.handoffFingerprint);
}

/** Load-bearing review-axis integrity shared by final axes and focused re-review. */
function loadBearingReviewFailure(
  reviews: Record<string, unknown>[],
  fingerprint: string,
  pathPrefix: string,
): ProtocolValidationFailure | undefined {
  if (reviews.length !== 2 || new Set(reviews.map((review) => review.axis)).size !== 2) {
    return failure("invalid-review-integrity", `${pathPrefix} requires exactly one separate Standards and one separate Spec review.`, pathPrefix);
  }
  if (reviews.some((review) => review.reviewedFingerprint !== fingerprint || (review.run as Record<string, unknown>).contextMode !== "fresh")) {
    return failure("invalid-review-integrity", `${pathPrefix} must be fresh and tied to the stable implementation handoff.`, pathPrefix);
  }
  if (reviews.some((review) => review.verdict === "unable-to-review")) {
    return failure("invalid-review-integrity", `An unable-to-review axis cannot authorize completion.`, pathPrefix);
  }
  if (reviews.some((review) => (review.verdict === "no-findings" && (review.findings as unknown[]).length !== 0)
    || (review.verdict === "findings" && (review.findings as unknown[]).length === 0))) {
    return failure("invalid-review-integrity", `${pathPrefix} verdicts must be usable and consistent with their findings.`, pathPrefix);
  }
  const reviewerRunIds = reviews.map((review) => (review.run as Record<string, unknown>).runId);
  if (new Set(reviewerRunIds).size !== 2) {
    return failure("invalid-review-integrity", `${pathPrefix} axes require separate review calls.`, pathPrefix);
  }
  for (const [index, review] of reviews.entries()) {
    const sealing = review.sealing;
    if (!validReviewerSeal(sealing)) {
      return failure("invalid-review-integrity", "Each reviewer requires capability sealing or serialized mutation evidence.", `${pathPrefix}.${index}.sealing`);
    }
    if (object(sealing) && sealing.mode === "capability" && (sealing.readOnlyCapabilities as string[]).some((capability) => /(?:write|edit|mutat|stage|commit|shell|bash)/i.test(capability))) {
      return failure("invalid-review-integrity", "Capability sealing cannot declare mutation-capable tools.", `${pathPrefix}.${index}.sealing.readOnlyCapabilities`);
    }
    if (object(sealing) && sealing.mode === "serialized" && (sealing.preMutationFingerprint !== fingerprint || sealing.postMutationFingerprint !== fingerprint)) {
      return failure("invalid-review-integrity", "Serialized reviewer mutation evidence must match the stable implementation before and after review.", `${pathPrefix}.${index}.sealing`);
    }
  }
  return undefined;
}

/** Reject reason/facts pairs that cannot be derived from the recorded eligibility evidence. */
function eligibilityReasonConsistent(eligibility: WriterEligibilityEvidence): boolean {
  const workerConditionsMet = eligibility.architectureFrozen && eligibility.scopeExplicit && eligibility.reversible
    && eligibility.falsifiableBar.trim().length > 0 && eligibility.validationAvailable && eligibility.freshContext
    && eligibility.checkedAcceptance && eligibility.pilotMember && eligibility.allowedPaths.length > 0
    && eligibility.importantReasoning === "none" && !eligibility.tinyKnownDiff && eligibility.leaseSafetyAvailable;
  switch (eligibility.reasonCode) {
    case "frozen-bounded-worker":
      return eligibility.lane === "worker" && workerConditionsMet;
    case "important-reasoning-parent":
      return eligibility.lane === "parent" && eligibility.importantReasoning === "present" && !eligibility.tinyKnownDiff;
    case "unknown-mixed-parent":
      return eligibility.lane === "parent" && eligibility.importantReasoning === "unknown-mixed" && !eligibility.tinyKnownDiff;
    case "tiny-known-parent":
      return eligibility.lane === "parent" && eligibility.tinyKnownDiff === true && eligibility.importantReasoning === "none";
    case "unsafe-isolation-parent":
      return eligibility.lane === "parent" && eligibility.leaseSafetyAvailable === false && eligibility.importantReasoning === "none" && !eligibility.tinyKnownDiff;
    case "ineligible-worker-conditions":
      return eligibility.lane === "parent" && eligibility.importantReasoning === "none" && !eligibility.tinyKnownDiff
        && eligibility.leaseSafetyAvailable === true && !workerConditionsMet;
    default:
      return false;
  }
}

function validFixBrief(value: unknown): boolean {
  return object(value) && nonEmpty(value.briefId) && nonEmpty(value.parentActor) && strings(value.acceptedFindingIds) && value.acceptedFindingIds.length > 0
    && strings(value.scopePaths) && value.scopePaths.length > 0 && nonEmpty(value.summary) && nonEmpty(value.issuedAt);
}

function validParentImplementationAfterDelegation(value: unknown): boolean {
  if (!object(value) || typeof value.occurred !== "boolean") return false;
  if (!value.occurred) return value.attribution === undefined && value.evidenceLocator === undefined;
  return (value.attribution === "rework" || value.attribution === "strong-route") && nonEmpty(value.evidenceLocator);
}

function hasRequiredEnvelopeShape(value: Record<string, unknown>): boolean {
  const workUnit = value.workUnit;
  const implementation = value.implementation;
  const lease = value.writerLease;
  const fidelity = value.completionFidelity;
  const fix = value.fixAndRereview;
  const diversity = value.diversity;
  const gate = value.parentGate;
  const validObservation = (item: unknown) => object(item) && nonEmpty(item.summary) && strings(item.locators) && strings(item.replayCommands);
  const validDisposition = (item: unknown) => object(item) && nonEmpty(item.findingId) && ["accepted", "rejected", "deferred", "escalated"].includes(item.disposition as string) && nonEmpty(item.parentActor) && nonEmpty(item.evidenceLocator) && (item.disposition !== "deferred" || nonEmpty(item.residualRisk)) && (item.residualRisk === undefined || nonEmpty(item.residualRisk));
  const validCriterion = (item: unknown) => item === "verified" || item === "unverified" || item === "not-applicable";
  const validWarning = (item: unknown) => object(item) && nonEmpty(item.targetTopology)
    && strings(item.configuredProviders) && item.configuredProviders.length >= 3
    && strings(item.actualProviders) && item.actualProviders.length === 3
    && nonEmpty(item.missingOrOverlapping) && nonEmpty(item.qualityConsequence) && nonEmpty(item.configurationGuidance);
  const validAcknowledgment = (item: unknown) => object(item) && nonEmpty(item.actor) && nonEmpty(item.at) && ["continue", "stop"].includes(item.decision as string) && nonEmpty(item.reason);
  return object(workUnit) && nonEmpty(workUnit.source) && nonEmpty(workUnit.sourceFingerprint) && nonEmpty(workUnit.ticketId) && nonEmpty(workUnit.purpose) && Number.isInteger(workUnit.attempt) && (workUnit.attempt as number) > 0
    && object(implementation) && strings(implementation.changedPaths) && nonEmpty(implementation.fingerprint)
    && Array.isArray(value.runs) && value.runs.every(validRun) && Array.isArray(value.producerObservations) && value.producerObservations.every(validObservation)
    && Array.isArray(value.parentValidation) && value.parentValidation.every(validValidation) && Array.isArray(value.reviews) && value.reviews.every(validReview) && Array.isArray(value.dispositions) && value.dispositions.every(validDisposition)
    && validEligibility(value.eligibility)
    && object(lease) && nonEmpty(lease.leaseId) && nonEmpty(lease.ticketId) && Number.isInteger(lease.attempt) && (lease.attempt as number) > 0 && nonEmpty(lease.worktreeKey) && nonEmpty(lease.owner) && ["parent", "worker", "fix-writer"].includes(lease.ownerRole as string)
    && ["implementation", "fix", "closed"].includes(lease.phase as string) && strings(lease.allowedPaths) && lease.allowedPaths.length > 0 && nonEmpty(lease.openedAt)
    && (lease.closedAt === undefined || nonEmpty(lease.closedAt)) && (lease.handoffFingerprint === undefined || nonEmpty(lease.handoffFingerprint)) && (lease.fixBriefId === undefined || nonEmpty(lease.fixBriefId))
    && object(fix) && Number.isInteger(fix.round) && (fix.round as number) >= 0 && typeof fix.fixApplied === "boolean"
    && (fix.fixBrief === undefined || validFixBrief(fix.fixBrief))
    && (fix.fixLease === undefined || validWriterLeaseEvidence(fix.fixLease, true))
    && (fix.fixValidation === undefined || Array.isArray(fix.fixValidation) && fix.fixValidation.every(validValidation))
    && (fix.focusedRereview === undefined || Array.isArray(fix.focusedRereview) && fix.focusedRereview.every(validReview))
    && (fix.escalatedInsteadOfSecondFix === undefined || typeof fix.escalatedInsteadOfSecondFix === "boolean")
    && (fix.escalationLocator === undefined || nonEmpty(fix.escalationLocator))
    && (value.parentImplementationAfterDelegation === undefined || validParentImplementationAfterDelegation(value.parentImplementationAfterDelegation))
    && object(fidelity) && object(fidelity.criteria) && ["C1", "C2", "C3", "C4", "C5", "C6", "C7"].every((key) => validCriterion(fidelity.criteria[key])) && Array.isArray(fidelity.claims) && fidelity.claims.every((claim) => object(claim) && nonEmpty(claim.claim) && nonEmpty(claim.locator) && nonEmpty(claim.verifiedBy))
    && object(diversity) && typeof diversity.degraded === "boolean" && (diversity.warning === undefined || validWarning(diversity.warning)) && (diversity.acknowledgment === undefined || validAcknowledgment(diversity.acknowledgment)) && Array.isArray(value.residualRisks) && value.residualRisks.every(nonEmpty)
    && ["completed", "retry", "failed", "blocked", "needs_decision"].includes(value.requestedOutcome as string)
    && object(gate);
}

function containsChildGateClaim(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsChildGateClaim);
  if (!object(value)) return false;
  return ["parentGate", "gateVerdict", "completionVerdict"].some((key) => key in value) || Object.values(value).some(containsChildGateClaim);
}

function reviewEntries(value: Record<string, unknown>): Record<string, unknown>[] {
  const fix = value.fixAndRereview as Record<string, unknown>;
  return [...(value.reviews as Record<string, unknown>[]), ...((fix.focusedRereview ?? []) as Record<string, unknown>[])];
}

/** Validates version dispatch and the minimum complete V1 evidence contract without mutation. */
export function parseTeamOrchestrationEnvelope(value: unknown): ProtocolValidationResult {
  if (!object(value) || value.protocolVersion === undefined) return failure("missing-version", "Evidence envelope must declare protocolVersion.", "protocolVersion");
  if (value.protocolVersion !== TEAM_ORCHESTRATION_PROTOCOL_VERSION) return failure("unknown-version", "Evidence envelope protocolVersion is not supported.", "protocolVersion");
  if (!hasRequiredEnvelopeShape(value)) return failure("malformed-envelope", "Evidence envelope lacks required version-1 evidence categories.");
  if (value.requestedOutcome === "needs_decision" && !isDecisionPacket(value.decisionPacket)) {
    return failure("invalid-decision-packet", "needs_decision requires a complete replayable decision packet.", "decisionPacket");
  }
  if (value.requestedOutcome !== "needs_decision" && value.decisionPacket !== undefined) {
    return failure("invalid-decision-packet", "decisionPacket is legal only when requestedOutcome is needs_decision.", "decisionPacket");
  }

  const childCarriers = [
    ...(value.runs as Record<string, unknown>[]).filter((run) => run.role !== "parent"),
    ...(value.producerObservations as Record<string, unknown>[]),
    ...reviewEntries(value),
  ];
  if (childCarriers.some(containsChildGateClaim)) return failure("child-gate-authority", "Producer and reviewer evidence cannot encode a parent gate.");

  const gate = value.parentGate as Record<string, unknown>;
  if (gate.role !== "parent" || !nonEmpty(gate.actor) || !["accepted", "rejected", "escalated"].includes(gate.action as string) || !nonEmpty(gate.observedFingerprint) || !nonEmpty(gate.evidenceLocator)) {
    return failure("invalid-parent-gate", "Final gate must be an independently recorded parent action.", "parentGate");
  }

  const reviews = reviewEntries(value);
  const producerRun = (value.runs as Record<string, unknown>[]).find((run) => run.role === "producer");
  const standardsReview = reviews.find((review) => review.axis === "standards");
  const specReview = reviews.find((review) => review.axis === "spec");
  const standardsRun = standardsReview?.run as Record<string, unknown> | undefined;
  const specRun = specReview?.run as Record<string, unknown> | undefined;
  const derivedIndependence = classifyIndependence({
    producer: producerRun?.provider as ProviderIdentity | undefined,
    standards: standardsRun?.provider as ProviderIdentity | undefined,
    spec: specRun?.provider as ProviderIdentity | undefined,
    producerActor: producerRun?.actor as string | undefined,
    standardsActor: standardsRun?.actor as string | undefined,
    specActor: specRun?.actor as string | undefined,
    requireVerifiedEffectiveThinking: value.requestedOutcome === "completed",
  });

  const diversity = value.diversity as Record<string, unknown>;
  const level = diversity.achievedIndependence;
  if (typeof level !== "string" || !["provider-distinct", "provider-overlap", "axis-missing", "combined", "self-review", "unknown"].includes(level)) return failure("malformed-envelope", "achievedIndependence is invalid.", "diversity.achievedIndependence");
  if (level !== derivedIndependence) return failure("invalid-provider-diversity", "achievedIndependence must match actual producer and review provenance.", "diversity.achievedIndependence");
  if (diversity.degraded !== (level !== "provider-distinct")) return failure("invalid-provider-diversity", "Non-distinct provider topology must be explicitly degraded.", "diversity.degraded");
  if (value.requestedOutcome === "completed" && (typeof diversity.cleanPilotEvidence !== "boolean" || diversity.cleanPilotEvidence !== (level === "provider-distinct" && diversity.degraded === false))) return failure("invalid-provider-diversity", "cleanPilotEvidence must exactly reflect verified provider-distinct provenance.", "diversity.cleanPilotEvidence");
  if (value.requestedOutcome !== "completed" && diversity.cleanPilotEvidence !== undefined && (typeof diversity.cleanPilotEvidence !== "boolean" || diversity.cleanPilotEvidence !== (level === "provider-distinct" && diversity.degraded === false))) return failure("invalid-provider-diversity", "cleanPilotEvidence must exactly reflect verified provider-distinct provenance.", "diversity.cleanPilotEvidence");
  if (diversity.degraded && (!object(diversity.warning) || !object(diversity.acknowledgment) || diversity.acknowledgment.decision !== "continue")) return failure("invalid-provider-diversity", "Degraded topology requires a complete warning and explicit continue acknowledgment.", "diversity");

  const childActors = [...(value.runs as Record<string, unknown>[]), ...reviews.map((review) => review.run as Record<string, unknown>)].filter((run) => run.role !== "parent").map((run) => run.actor);
  if (childActors.includes(gate.actor)) return failure("invalid-parent-gate", "Parent gate actor must not be a producer, reviewer, or fix-writer.", "parentGate.actor");
  if ((value.dispositions as Record<string, unknown>[]).some((disposition) => childActors.includes(disposition.parentActor as string))) return failure("invalid-finding-disposition", "Finding dispositions must be independently recorded parent actions.", "dispositions");

  const eligibility = value.eligibility as WriterEligibilityEvidence;
  const lease = value.writerLease as Record<string, unknown>;
  const workUnit = value.workUnit as WorkUnitIdentity;
  if (lease.ticketId !== workUnit.ticketId || lease.attempt !== workUnit.attempt) {
    return failure("invalid-writer-lease", "Writer lease evidence must belong to the reporting ticket attempt.", "writerLease");
  }
  if (!eligibilityReasonConsistent(eligibility)) {
    return failure("invalid-writer-eligibility", "Eligibility reasonCode must be internally consistent with recorded eligibility facts.", "eligibility");
  }
  if (lease.ownerRole === "worker" && eligibility.lane !== "worker") {
    return failure("invalid-writer-eligibility", "Worker ownerRole requires a worker eligibility lane.", "writerLease.ownerRole");
  }
  if (lease.ownerRole === "parent" && eligibility.lane === "worker" && value.requestedOutcome === "completed") {
    const rework = value.parentImplementationAfterDelegation;
    if (!validParentImplementationAfterDelegation(rework) || !object(rework) || rework.occurred !== true) {
      return failure("invalid-writer-eligibility", "Parent implementation after worker delegation must be explicit rework/strong-route evidence.", "parentImplementationAfterDelegation");
    }
  }
  if (!roleMayAcquireWriterLease(lease.ownerRole as string)) {
    return failure("invalid-writer-lease", "Only parent, worker, or fix-writer roles may hold a writer lease.", "writerLease.ownerRole");
  }
  if (Array.isArray(lease.allowedPaths) && eligibility.allowedPaths.length > 0
    && lease.ownerRole !== "fix-writer"
    && !pathsContainedByScope(lease.allowedPaths as string[], eligibility.allowedPaths)) {
    return failure("invalid-writer-lease", "Writer lease allowedPaths must be contained by eligibility allowedPaths.", "writerLease.allowedPaths");
  }
  const reviewerActors = new Set(reviews.map((review) => (review.run as Record<string, unknown>).actor as string));
  if (reviewerActors.has(lease.owner as string) && lease.ownerRole !== "parent") {
    return failure("invalid-writer-lease", "Reviewer actors cannot acquire mutation authority through lease ownership.", "writerLease.owner");
  }
  for (const run of value.runs as Record<string, unknown>[]) {
    if ((run.role === "standards-reviewer" || run.role === "spec-reviewer") && run.actor === lease.owner) {
      return failure("invalid-writer-lease", "Reviewer role provenance cannot own the writer lease.", "writerLease.owner");
    }
  }
  if (lease.phase !== "closed") {
    const reviewBlocked = canStartReviewAgainstLease({ phase: lease.phase as WriterPhase });
    if (!reviewBlocked.ok && (value.reviews as unknown[]).length > 0) {
      return failure("invalid-review-integrity", reviewBlocked.message, "reviews");
    }
  }

  const fix = value.fixAndRereview as Record<string, unknown>;
  if ((fix.round as number) > 1 && fix.escalatedInsteadOfSecondFix !== true) {
    return failure("invalid-fix-round", "More than one ordinary fix-worker round is prohibited without escalation evidence.", "fixAndRereview.round");
  }
  if (fix.escalatedInsteadOfSecondFix === true && !nonEmpty(fix.escalationLocator)) {
    return failure("invalid-fix-round", "Escalation instead of a second fix requires a replayable escalation locator.", "fixAndRereview.escalationLocator");
  }
  if (fix.fixApplied === true) {
    if ((fix.round as number) !== 1) return failure("invalid-fix-round", "An applied fix must record exactly one ordinary fix-worker round.", "fixAndRereview.round");
    if (!validFixBrief(fix.fixBrief)) return failure("invalid-fix-round", "Applied fixes require a parent fix brief of accepted findings only.", "fixAndRereview.fixBrief");
    const brief = fix.fixBrief as FixBriefEvidence;
    const accepted = new Set((value.dispositions as FindingDispositionEvidence[]).filter((item) => item.disposition === "accepted").map((item) => item.findingId));
    if (brief.acceptedFindingIds.some((id) => !accepted.has(id))) {
      return failure("invalid-fix-round", "Fix brief may contain only parent-accepted findings.", "fixAndRereview.fixBrief.acceptedFindingIds");
    }
    if (!validWriterLeaseEvidence(fix.fixLease, true)) {
      return failure("invalid-fix-round", "Applied fixes require replayable closed fix-writer lease evidence tied to the brief and handoff.", "fixAndRereview.fixLease");
    }
    const fixLease = fix.fixLease as WriterLeaseEvidence;
    if (fixLease.ticketId !== workUnit.ticketId || fixLease.attempt !== workUnit.attempt || fixLease.ownerRole !== "fix-writer" || fixLease.fixBriefId !== brief.briefId) {
      return failure("invalid-fix-round", "fix lease evidence must use fix-writer ownership tied to the parent fix brief.", "fixAndRereview.fixLease");
    }
    if (!pathsContainedByScope(fixLease.allowedPaths, brief.scopePaths)
      || (eligibility.allowedPaths.length > 0 && !pathsContainedByScope(fixLease.allowedPaths, eligibility.allowedPaths))) {
      return failure("invalid-fix-round", "Fix lease allowedPaths must stay inside fix brief and eligibility scope.", "fixAndRereview.fixLease.allowedPaths");
    }
    if (lease.leaseId !== fixLease.leaseId || lease.owner !== fixLease.owner || lease.ownerRole !== "fix-writer"
      || lease.fixBriefId !== brief.briefId || lease.handoffFingerprint !== fixLease.handoffFingerprint) {
      return failure("invalid-fix-round", "Final writer lease must match the closed fix-writer lease handoff when a fix was applied.", "writerLease");
    }
  } else if (fix.fixBrief !== undefined && !validFixBrief(fix.fixBrief)) {
    return failure("invalid-fix-round", "Fix brief shape is invalid.", "fixAndRereview.fixBrief");
  } else if (fix.fixLease !== undefined) {
    return failure("invalid-fix-round", "fix lease evidence is legal only when fixApplied is true.", "fixAndRereview.fixLease");
  }

  if (value.requestedOutcome === "completed") {
    const implementation = value.implementation as Record<string, unknown>;
    const fingerprint = implementation.fingerprint as string;
    if (lease.phase !== "closed" || !nonEmpty(lease.closedAt) || lease.handoffFingerprint !== fingerprint) return failure("invalid-review-integrity", "Completion requires a closed writer lease with a stable parent-observed handoff fingerprint.", "writerLease");
    if (eligibility.lane === "worker") {
      const rework = value.parentImplementationAfterDelegation;
      if (!validParentImplementationAfterDelegation(rework)) {
        return failure("invalid-writer-eligibility", "Worker-lane completion must record whether parent implementation occurred after delegation.", "parentImplementationAfterDelegation");
      }
    }
    const finalReviews = value.reviews as Record<string, unknown>[];
    const parentValidation = value.parentValidation as Record<string, unknown>[];
    if (gate.action !== "accepted" || gate.observedFingerprint !== fingerprint || parentValidation.length === 0 || parentValidation.some((validation) => validation.outcome !== "passed" || validation.observedFingerprint !== fingerprint)) return failure("invalid-review-integrity", "Completion requires an accepted parent gate and passing parent validation against the stable implementation.", "parentValidation");
    const finalReviewFailure = loadBearingReviewFailure(finalReviews, fingerprint, "reviews");
    if (finalReviewFailure) return finalReviewFailure;
    if (["axis-missing", "combined", "self-review"].includes(level)) return failure("invalid-review-integrity", "Missing, combined, or self-review cannot use the diversity degradation exception.", "diversity.achievedIndependence");
    const focusedReviews = ((fix.focusedRereview ?? []) as ReviewEvidence[]).map((review) => review as unknown as Record<string, unknown>);
    const findingIds = [...finalReviews, ...focusedReviews].flatMap((review) => (review.findings as Record<string, unknown>[]).map((finding) => finding.id as string));
    const dispositionIds = (value.dispositions as Record<string, unknown>[]).map((disposition) => disposition.findingId as string);
    if (new Set(findingIds).size !== findingIds.length || new Set(dispositionIds).size !== dispositionIds.length || findingIds.length !== dispositionIds.length || findingIds.some((id) => !dispositionIds.includes(id))) return failure("invalid-finding-disposition", "Every and only review finding requires one parent disposition.", "dispositions");
    if (fix.fixApplied === true) {
      const fixValidation = fix.fixValidation as ParentValidation[] | undefined;
      const focused = (fix.focusedRereview ?? []) as unknown as Record<string, unknown>[];
      if (!fixValidation?.length || fixValidation.some((item) => item.outcome !== "passed" || item.observedFingerprint !== fingerprint)) {
        return failure("invalid-fix-round", "Applied fixes require parent revalidation against the final implementation.", "fixAndRereview.fixValidation");
      }
      const focusedFailure = loadBearingReviewFailure(focused, fingerprint, "fixAndRereview.focusedRereview");
      if (focusedFailure) {
        return failure("invalid-fix-round", focusedFailure.error.message, focusedFailure.error.path ?? "fixAndRereview.focusedRereview");
      }
      const fixLease = fix.fixLease as WriterLeaseEvidence;
      if (fixLease.handoffFingerprint !== fingerprint || lease.handoffFingerprint !== fingerprint) {
        return failure("invalid-fix-round", "Closed fix lease handoff must match the final implementation fingerprint.", "fixAndRereview.fixLease.handoffFingerprint");
      }
    }
    if (fix.escalatedInsteadOfSecondFix === true) {
      return failure("invalid-fix-round", "Completion cannot carry an unresolved second-fix escalation.", "fixAndRereview.escalatedInsteadOfSecondFix");
    }
  }

  return { ok: true, value: value as TeamOrchestrationEnvelopeV1 };
}
