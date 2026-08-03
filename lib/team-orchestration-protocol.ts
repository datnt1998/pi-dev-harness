import { createHash } from "node:crypto";

/** The only evidence-envelope version understood by this package revision. */
export const TEAM_ORCHESTRATION_PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof TEAM_ORCHESTRATION_PROTOCOL_VERSION;
export type RequestedOutcome = "completed" | "retry" | "failed" | "blocked" | "needs_decision";
export type DelegatedRole = "producer" | "standards-reviewer" | "spec-reviewer" | "fix-writer" | "parent";
export type WriterPhase = "implementation" | "fix" | "closed";
export type ReviewAxis = "standards" | "spec";
export type FindingDisposition = "accepted" | "rejected" | "deferred" | "escalated";
export type IndependenceLevel = "provider-distinct" | "provider-overlap" | "axis-missing" | "combined" | "self-review" | "unknown";

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
  owner: string;
  phase: WriterPhase;
  allowedPaths: string[];
  openedAt: string;
  closedAt?: string;
  /** Parent-observed stable implementation state after the writer closed the lease. */
  handoffFingerprint?: string;
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
  round: number;
  fixApplied: boolean;
  fixValidation?: ParentValidation[];
  focusedRereview?: ReviewEvidence[];
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
  | "invalid-decision-packet";

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
    && object(lease) && nonEmpty(lease.owner) && ["implementation", "fix", "closed"].includes(lease.phase as string) && strings(lease.allowedPaths) && nonEmpty(lease.openedAt) && (lease.closedAt === undefined || nonEmpty(lease.closedAt))
    && object(fix) && Number.isInteger(fix.round) && (fix.round as number) >= 0 && typeof fix.fixApplied === "boolean" && (fix.fixValidation === undefined || Array.isArray(fix.fixValidation) && fix.fixValidation.every(validValidation)) && (fix.focusedRereview === undefined || Array.isArray(fix.focusedRereview) && fix.focusedRereview.every(validReview))
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

  if (value.requestedOutcome === "completed") {
    const implementation = value.implementation as Record<string, unknown>;
    const fingerprint = implementation.fingerprint as string;
    const lease = value.writerLease as Record<string, unknown>;
    if (lease.phase !== "closed" || !nonEmpty(lease.closedAt) || lease.handoffFingerprint !== fingerprint) return failure("invalid-review-integrity", "Completion requires a closed writer lease with a stable parent-observed handoff fingerprint.", "writerLease");
    const finalReviews = value.reviews as Record<string, unknown>[];
    const parentValidation = value.parentValidation as Record<string, unknown>[];
    if (gate.action !== "accepted" || gate.observedFingerprint !== fingerprint || parentValidation.length === 0 || parentValidation.some((validation) => validation.outcome !== "passed" || validation.observedFingerprint !== fingerprint)) return failure("invalid-review-integrity", "Completion requires an accepted parent gate and passing parent validation against the stable implementation.", "parentValidation");
    if (finalReviews.length !== 2 || new Set(finalReviews.map((review) => review.axis)).size !== 2) return failure("invalid-review-integrity", "Completion requires exactly one separate Standards and one separate Spec review.", "reviews");
    if (finalReviews.some((review) => review.reviewedFingerprint !== fingerprint || (review.run as Record<string, unknown>).contextMode !== "fresh")) return failure("invalid-review-integrity", "Each review must be fresh and tied to the stable implementation handoff.", "reviews");
    if (finalReviews.some((review) => review.verdict === "unable-to-review")) return failure("invalid-review-integrity", "An unable-to-review axis cannot authorize completion.", "reviews");
    const reviewerRunIds = finalReviews.map((review) => (review.run as Record<string, unknown>).runId);
    if (new Set(reviewerRunIds).size !== 2) return failure("invalid-review-integrity", "Review axes require separate review calls.", "reviews");
    for (const [index, review] of finalReviews.entries()) {
      const sealing = review.sealing;
      if (!validReviewerSeal(sealing)) return failure("invalid-review-integrity", "Each reviewer requires capability sealing or serialized mutation evidence.", `reviews.${index}.sealing`);
      if (object(sealing) && sealing.mode === "capability" && (sealing.readOnlyCapabilities as string[]).some((capability) => /(?:write|edit|mutat|stage|commit|shell|bash)/i.test(capability))) return failure("invalid-review-integrity", "Capability sealing cannot declare mutation-capable tools.", `reviews.${index}.sealing.readOnlyCapabilities`);
      if (object(sealing) && sealing.mode === "serialized" && (sealing.preMutationFingerprint !== fingerprint || sealing.postMutationFingerprint !== fingerprint)) return failure("invalid-review-integrity", "Serialized reviewer mutation evidence must match the stable implementation before and after review.", `reviews.${index}.sealing`);
    }
    if (["axis-missing", "combined", "self-review"].includes(level)) return failure("invalid-review-integrity", "Missing, combined, or self-review cannot use the diversity degradation exception.", "diversity.achievedIndependence");
    const findingIds = finalReviews.flatMap((review) => (review.findings as Record<string, unknown>[]).map((finding) => finding.id as string));
    const dispositionIds = (value.dispositions as Record<string, unknown>[]).map((disposition) => disposition.findingId as string);
    if (new Set(findingIds).size !== findingIds.length || new Set(dispositionIds).size !== dispositionIds.length || findingIds.length !== dispositionIds.length || findingIds.some((id) => !dispositionIds.includes(id))) return failure("invalid-finding-disposition", "Every and only review finding requires one parent disposition.", "dispositions");
  }

  return { ok: true, value: value as TeamOrchestrationEnvelopeV1 };
}
