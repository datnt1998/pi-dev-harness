import type { TicketId } from "./brand.ts";
import type {
  CompletionFidelity,
  DiversityEvidence,
  ProviderIdentity,
  RequestedOutcome,
  ReviewEvidence,
  TeamOrchestrationEnvelopeV1,
} from "./team-orchestration-protocol.ts";

export const TEAM_ORCHESTRATION_PILOT_VERSION = 1 as const;
export const PILOT_WINDOW_SIZE = 10;
export const PILOT_MIN_TEST_BAR = 6;
export const PILOT_MIN_NO_TEST_BAR = 2;

export type UnknownNumber = number | "unknown";
export type PriceState = "metered" | "unpriced" | "unknown";
export type PilotSeverity = "low" | "medium" | "high" | "critical";
export type PilotOutcome = "completed" | "retry" | "failed" | "blocked" | "needs_decision" | "incomplete";
export type TestBar = "test-bar" | "no-test-bar";
export type PilotRole = "worker" | "fix-writer" | "standards-reviewer" | "spec-reviewer" | "parent";
export type FalseClaimCriterion = "C4" | "C7";
export type PilotDecision = "owner-decision-ready" | "hold/incomplete" | "rollback/config-repair";

export type PilotFalseClaim = {
  criterion: FalseClaimCriterion;
  role: PilotRole;
  locator: string;
};

export type PilotParentRework = {
  findingId: string;
  severity: PilotSeverity;
  locator: string;
  attribution: "rework" | "strong-route";
  implicatedRole: "worker" | "fix-writer";
};

/** Explicit operational observations that cannot be safely inferred from the evidence envelope. */
export type PilotMetrics = {
  primary: boolean;
  realWork: boolean;
  testBar: TestBar;
  attribution: "verified" | "unknown";
  usageAttribution: "verified" | "unknown";
  falseClaims: PilotFalseClaim[];
  parentRework: PilotParentRework[];
  parentValidationDiagnostic: string;
  productionScarcePremiumCalls: UnknownNumber;
  arbitrationScarcePremiumCalls: UnknownNumber;
  meteredSpend: UnknownNumber;
  flatFeeOutputTokens: UnknownNumber;
  /** Zero means the tier is unpriced; it is never rendered as a zero-dollar saving. */
  flatFeePrice: UnknownNumber;
  latencyMs: UnknownNumber;
  baselineLocator: string;
  baselineMatched: boolean;
  baselineProductionScarcePremiumCallsPerTicket: UnknownNumber;
  baselineLatencyMs: UnknownNumber;
  routeSnapshotLocator: string;
  /** Important reasoning observed on a flat-fee role is an immediate T4 event. */
  flatFeeImportantReasoning?: { role: PilotRole; locator: string };
  /** A proven silent downgrade on a scarce-premium role is a T5 configuration event. */
  silentThinkingDowngrade?: { role: PilotRole; locator: string };
  terminalOutcome: PilotOutcome;
};

export type PilotRouteEvidence = {
  role: "producer" | "standards" | "spec";
  provider: ProviderIdentity;
};

export type PilotFindingSummary = {
  axis: "standards" | "spec";
  count: number;
  highestSeverity?: PilotSeverity;
};

export type PilotRow = {
  source: string;
  ticketId: TicketId;
  attempt: number;
  primary: boolean;
  realWork: boolean;
  worker: boolean;
  pilotMember: boolean;
  testBar?: TestBar;
  routes: PilotRouteEvidence[];
  diversity: DiversityEvidence;
  fidelity: CompletionFidelity;
  findings: PilotFindingSummary[];
  fixRounds: number;
  fixOwner: "none" | "fix-writer" | "parent";
  parentRework: PilotParentRework[];
  metrics?: PilotMetrics;
  requestedOutcome: RequestedOutcome;
  outcome: PilotOutcome;
  clean: boolean;
  exclusionReasons: string[];
};

export type PilotLedger = {
  version: typeof TEAM_ORCHESTRATION_PILOT_VERSION;
  rows: PilotRow[];
};

export type WorkerLaneControl = {
  mode: "enabled" | "demoted" | "disabled";
  reason?: string;
  locator?: string;
  operatorConsequence?: string;
};

export type PilotAction = {
  trigger: "T1" | "T2" | "T3" | "T4" | "T5";
  action: "revert-role" | "repair-config-and-replace";
  role: PilotRole;
  observation: string;
  locators: string[];
  operatorConsequence: string;
};

export type PilotEvaluation = {
  cleanRows: PilotRow[];
  testBarCount: number;
  noTestBarCount: number;
  windowComplete: boolean;
  qualityQualified: boolean;
  productionCallsPerTicket: UnknownNumber;
  baselineCallsPerTicket: UnknownNumber;
  costResult: "strict-decrease" | "equal" | "increased" | "unknown";
  latencyResult: "decreased" | "equal" | "increased" | "unknown";
  decision: PilotDecision;
  ownerConsequence: "consider-promotion" | "remain-opt-in" | "collect-replacement-evidence" | "apply-role-action";
  actions: PilotAction[];
};

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unknownNumber(value: unknown): value is UnknownNumber {
  return value === "unknown" || typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validRole(value: unknown): value is PilotRole {
  return ["worker", "fix-writer", "standards-reviewer", "spec-reviewer", "parent"].includes(value as string);
}

export function isPilotMetrics(value: unknown): value is PilotMetrics {
  if (!object(value)
    || typeof value.primary !== "boolean" || typeof value.realWork !== "boolean"
    || !["test-bar", "no-test-bar"].includes(value.testBar as string)
    || !["verified", "unknown"].includes(value.attribution as string)
    || !["verified", "unknown"].includes(value.usageAttribution as string)
    || !Array.isArray(value.falseClaims) || !value.falseClaims.every((claim) => object(claim)
      && ["C4", "C7"].includes(claim.criterion as string) && validRole(claim.role) && nonEmpty(claim.locator))
    || !Array.isArray(value.parentRework) || !value.parentRework.every((item) => object(item)
      && nonEmpty(item.findingId) && ["low", "medium", "high", "critical"].includes(item.severity as string)
      && nonEmpty(item.locator) && ["rework", "strong-route"].includes(item.attribution as string)
      && ["worker", "fix-writer"].includes(item.implicatedRole as string))
    || !nonEmpty(value.parentValidationDiagnostic)
    || !unknownNumber(value.productionScarcePremiumCalls) || !unknownNumber(value.arbitrationScarcePremiumCalls)
    || !unknownNumber(value.meteredSpend) || !unknownNumber(value.flatFeeOutputTokens)
    || !unknownNumber(value.flatFeePrice) || !unknownNumber(value.latencyMs)
    || !nonEmpty(value.baselineLocator) || typeof value.baselineMatched !== "boolean"
    || !unknownNumber(value.baselineProductionScarcePremiumCallsPerTicket) || !unknownNumber(value.baselineLatencyMs)
    || !nonEmpty(value.routeSnapshotLocator)
    || !["completed", "retry", "failed", "blocked", "needs_decision", "incomplete"].includes(value.terminalOutcome as string)) return false;
  for (const key of ["flatFeeImportantReasoning", "silentThinkingDowngrade"] as const) {
    const event = value[key];
    if (event !== undefined && (!object(event) || !validRole(event.role) || !nonEmpty(event.locator))) return false;
  }
  return true;
}

function validProvider(value: unknown): value is ProviderIdentity {
  return object(value) && nonEmpty(value.provider) && typeof value.fallback === "boolean"
    && (value.model === undefined || nonEmpty(value.model))
    && (value.requestedProvider === undefined || nonEmpty(value.requestedProvider))
    && (value.requestedModel === undefined || nonEmpty(value.requestedModel))
    && (value.effectiveModel === undefined || ["verified", "unverified", "unknown"].includes(value.effectiveModel as string))
    && (value.effectiveThinking === undefined || ["verified", "unverified", "unknown"].includes(value.effectiveThinking as string));
}

function validDiversity(value: unknown): value is DiversityEvidence {
  if (!object(value) || !["provider-distinct", "provider-overlap", "axis-missing", "combined", "self-review", "unknown"].includes(value.achievedIndependence as string)
    || typeof value.degraded !== "boolean" || typeof value.cleanPilotEvidence !== "boolean") return false;
  if (value.degraded !== (value.achievedIndependence !== "provider-distinct")
    || value.cleanPilotEvidence !== (value.achievedIndependence === "provider-distinct" && value.degraded === false)) return false;
  if (!value.degraded) return value.warning === undefined && value.acknowledgment === undefined;
  const warning = value.warning;
  const acknowledgment = value.acknowledgment;
  return object(warning) && nonEmpty(warning.targetTopology)
    && Array.isArray(warning.configuredProviders) && warning.configuredProviders.length >= 3 && warning.configuredProviders.every(nonEmpty)
    && Array.isArray(warning.actualProviders) && warning.actualProviders.length === 3 && warning.actualProviders.every(nonEmpty)
    && nonEmpty(warning.missingOrOverlapping) && nonEmpty(warning.qualityConsequence) && nonEmpty(warning.configurationGuidance)
    && object(acknowledgment) && nonEmpty(acknowledgment.actor) && nonEmpty(acknowledgment.at)
    && acknowledgment.decision === "continue" && nonEmpty(acknowledgment.reason);
}

function validFidelity(value: unknown): value is CompletionFidelity {
  if (!object(value) || !object(value.criteria) || !Array.isArray(value.claims)) return false;
  const criteria = value.criteria;
  if (!["C1", "C2", "C3", "C4", "C5", "C6", "C7"].every((key) => ["verified", "unverified", "not-applicable"].includes(criteria[key] as string))) return false;
  return value.claims.every((claim) => object(claim) && nonEmpty(claim.claim) && nonEmpty(claim.locator) && nonEmpty(claim.verifiedBy));
}

function validParentRework(value: unknown): value is PilotParentRework {
  return object(value) && nonEmpty(value.findingId) && ["low", "medium", "high", "critical"].includes(value.severity as string)
    && nonEmpty(value.locator) && ["rework", "strong-route"].includes(value.attribution as string)
    && ["worker", "fix-writer"].includes(value.implicatedRole as string);
}

function validRow(value: unknown): value is PilotRow {
  return object(value) && nonEmpty(value.source) && nonEmpty(value.ticketId)
    && Number.isInteger(value.attempt) && (value.attempt as number) > 0
    && typeof value.primary === "boolean" && typeof value.realWork === "boolean" && typeof value.worker === "boolean" && typeof value.pilotMember === "boolean"
    && (value.testBar === undefined || ["test-bar", "no-test-bar"].includes(value.testBar as string))
    && Array.isArray(value.routes) && value.routes.length === 3
    && new Set(value.routes.map((route) => object(route) ? route.role : undefined)).size === 3
    && value.routes.every((route) => object(route) && ["producer", "standards", "spec"].includes(route.role as string) && validProvider(route.provider))
    && validDiversity(value.diversity) && validFidelity(value.fidelity)
    && Array.isArray(value.findings) && value.findings.every((finding) => object(finding)
      && ["standards", "spec"].includes(finding.axis as string) && Number.isInteger(finding.count) && (finding.count as number) >= 0
      && (finding.highestSeverity === undefined || ["low", "medium", "high", "critical"].includes(finding.highestSeverity as string)))
    && Number.isInteger(value.fixRounds) && (value.fixRounds as number) >= 0 && ["none", "fix-writer", "parent"].includes(value.fixOwner as string)
    && Array.isArray(value.parentRework) && value.parentRework.every(validParentRework)
    && (value.metrics === undefined || isPilotMetrics(value.metrics))
    && ["completed", "retry", "failed", "blocked", "needs_decision"].includes(value.requestedOutcome as string)
    && ["completed", "retry", "failed", "blocked", "needs_decision", "incomplete"].includes(value.outcome as string)
    && (value.metrics === undefined
      ? value.testBar === undefined && value.primary === false && value.realWork === false
        && value.outcome === value.requestedOutcome && value.parentRework.length === 0
      : value.testBar === value.metrics.testBar && value.primary === value.metrics.primary
        && value.realWork === value.metrics.realWork && value.outcome === value.metrics.terminalOutcome
        && JSON.stringify(value.parentRework) === JSON.stringify(value.metrics.parentRework))
    && typeof value.clean === "boolean" && Array.isArray(value.exclusionReasons) && value.exclusionReasons.every(nonEmpty)
    && value.clean === (value.exclusionReasons.length === 0);
}

export function createPilotLedger(rows: PilotRow[] = []): PilotLedger {
  return { version: TEAM_ORCHESTRATION_PILOT_VERSION, rows: structuredClone(rows) };
}

function expectedClassification(row: PilotRow): string[] {
  const envelope = {
    workUnit: { source: row.source, ticketId: row.ticketId, attempt: row.attempt },
    eligibility: { lane: row.worker ? "worker" : "parent", pilotMember: row.pilotMember },
    runs: [{ role: "producer", provider: row.routes.find((route) => route.role === "producer")?.provider }],
    reviews: row.routes.filter((route) => route.role !== "producer").map((route) => ({ axis: route.role, run: { provider: route.provider } })),
    completionFidelity: row.fidelity,
    diversity: row.diversity,
    requestedOutcome: row.requestedOutcome,
  } as unknown as TeamOrchestrationEnvelopeV1;
  return classificationReasons(envelope, row.metrics, row.routes);
}

export function isPilotLedger(value: unknown): value is PilotLedger {
  return object(value) && value.version === TEAM_ORCHESTRATION_PILOT_VERSION
    && Array.isArray(value.rows) && value.rows.every((row) => validRow(row)
      && JSON.stringify(row.exclusionReasons) === JSON.stringify(expectedClassification(row)));
}

function highestSeverity(reviews: ReviewEvidence[], axis: "standards" | "spec"): PilotSeverity | undefined {
  const rank: PilotSeverity[] = ["low", "medium", "high", "critical"];
  return reviews.filter((review) => review.axis === axis).flatMap((review) => review.findings)
    .map((finding) => finding.severity).sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0];
}

const UNKNOWN_PROVIDER: ProviderIdentity = { provider: "unknown", fallback: false, effectiveModel: "unknown", effectiveThinking: "unknown" };

function routes(envelope: TeamOrchestrationEnvelopeV1): PilotRouteEvidence[] {
  const producer = envelope.runs.find((run) => run.role === "producer")?.provider ?? UNKNOWN_PROVIDER;
  const standards = envelope.reviews.find((review) => review.axis === "standards")?.run.provider ?? UNKNOWN_PROVIDER;
  const spec = envelope.reviews.find((review) => review.axis === "spec")?.run.provider ?? UNKNOWN_PROVIDER;
  return [
    { role: "producer", provider: structuredClone(producer) },
    { role: "standards", provider: structuredClone(standards) },
    { role: "spec", provider: structuredClone(spec) },
  ];
}

function classificationReasons(envelope: TeamOrchestrationEnvelopeV1, metrics: PilotMetrics | undefined, routeEvidence: PilotRouteEvidence[]): string[] {
  const reasons: string[] = [];
  if (envelope.eligibility.lane !== "worker" || !envelope.eligibility.pilotMember) reasons.push("not-worker-pilot-member");
  if (!metrics) return [...reasons, "missing-pilot-metrics"];
  if (!metrics.primary || !metrics.realWork) reasons.push("not-primary-real-work");
  if (metrics.attribution !== "verified") reasons.push("unknown-attribution");
  if (metrics.usageAttribution !== "verified") reasons.push("unknown-usage-attribution");
  if (metrics.terminalOutcome !== "completed" || envelope.requestedOutcome !== "completed") reasons.push("non-completed-outcome");
  if (routeEvidence.some((route) => route.provider.fallback)) reasons.push("fallback-contaminated");
  if (routeEvidence.some((route) => route.provider.effectiveModel !== "verified" || route.provider.effectiveThinking !== "verified")) reasons.push("unknown-effective-route-or-thinking");
  if (envelope.diversity.achievedIndependence !== "provider-distinct" || envelope.diversity.degraded || envelope.diversity.cleanPilotEvidence !== true) reasons.push("provider-diversity-degraded-or-unknown");
  if (metrics.silentThinkingDowngrade) reasons.push("T5-silent-thinking");
  if (Object.values(envelope.completionFidelity.criteria).some((criterion) => criterion !== "verified")) reasons.push("incomplete-fidelity");
  if (typeof metrics.productionScarcePremiumCalls !== "number" || typeof metrics.arbitrationScarcePremiumCalls !== "number" || typeof metrics.latencyMs !== "number") reasons.push("unknown-operational-metrics");
  if (!metrics.baselineMatched || typeof metrics.baselineProductionScarcePremiumCallsPerTicket !== "number") reasons.push("missing-matched-baseline");
  return [...new Set(reasons)];
}

/** Derives and retains an operational row; excluded rows are evidence and are never erased. */
export function derivePilotRow(envelope: TeamOrchestrationEnvelopeV1, metrics?: PilotMetrics): PilotRow {
  const routeEvidence = routes(envelope);
  const exclusionReasons = classificationReasons(envelope, metrics, routeEvidence);
  const parentRework = metrics?.parentRework ?? [];
  return {
    source: envelope.workUnit.source,
    ticketId: envelope.workUnit.ticketId,
    attempt: envelope.workUnit.attempt,
    primary: metrics?.primary ?? false,
    realWork: metrics?.realWork ?? false,
    worker: envelope.eligibility.lane === "worker",
    pilotMember: envelope.eligibility.pilotMember,
    testBar: metrics?.testBar,
    routes: routeEvidence,
    diversity: structuredClone(envelope.diversity),
    fidelity: structuredClone(envelope.completionFidelity),
    findings: (["standards", "spec"] as const).map((axis) => ({
      axis,
      count: envelope.reviews.filter((review) => review.axis === axis).reduce((sum, review) => sum + review.findings.length, 0),
      ...(highestSeverity(envelope.reviews, axis) ? { highestSeverity: highestSeverity(envelope.reviews, axis) } : {}),
    })),
    fixRounds: envelope.fixAndRereview.round,
    fixOwner: envelope.fixAndRereview.fixApplied ? "fix-writer" : parentRework.length > 0 ? "parent" : "none",
    parentRework: structuredClone(parentRework),
    metrics: metrics && structuredClone(metrics),
    requestedOutcome: envelope.requestedOutcome,
    outcome: metrics?.terminalOutcome ?? (envelope.requestedOutcome as PilotOutcome),
    clean: exclusionReasons.length === 0,
    exclusionReasons,
  };
}

export function recordPilotRow(ledger: PilotLedger, row: PilotRow): PilotLedger {
  if (!isPilotLedger(ledger) || !validRow(row)) throw new TypeError("Pilot ledger or row is invalid.");
  return createPilotLedger([...ledger.rows, structuredClone(row)]);
}

export function flatFeePriceState(metrics?: PilotMetrics): PriceState {
  if (!metrics || metrics.flatFeePrice === "unknown") return "unknown";
  return metrics.flatFeePrice === 0 ? "unpriced" : "metered";
}

function average(values: UnknownNumber[]): UnknownNumber {
  return values.length > 0 && values.every((value): value is number => typeof value === "number")
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : "unknown";
}

function compare(current: UnknownNumber, baseline: UnknownNumber): "decreased" | "equal" | "increased" | "unknown" {
  if (typeof current !== "number" || typeof baseline !== "number") return "unknown";
  return current < baseline ? "decreased" : current === baseline ? "equal" : "increased";
}

function makeAction(trigger: PilotAction["trigger"], role: PilotRole, locators: string[], observation: string): PilotAction {
  if (trigger === "T5") return {
    trigger, action: "repair-config-and-replace", role, observation, locators,
    operatorConsequence: "Repair the implicated role configuration immediately; retain this operational row, exclude it from model-quality evidence, and collect a replacement assignment.",
  };
  return {
    trigger, action: "revert-role", role, observation, locators,
    operatorConsequence: "Revert only the implicated role to the dated route snapshot; restore parent-writer selection when the worker role is implicated; preserve all evidence and review controls.",
  };
}

export function evaluatePilotWindow(ledger: PilotLedger): PilotEvaluation {
  if (!isPilotLedger(ledger)) throw new TypeError("Pilot ledger is invalid.");
  // The observational window closes on the first ten clean rows; later rows cannot rewrite it.
  const cleanRows = ledger.rows.filter((row) => row.clean).slice(0, PILOT_WINDOW_SIZE);
  const testBarCount = cleanRows.filter((row) => row.testBar === "test-bar").length;
  const noTestBarCount = cleanRows.filter((row) => row.testBar === "no-test-bar").length;
  const windowComplete = cleanRows.length === PILOT_WINDOW_SIZE && testBarCount >= PILOT_MIN_TEST_BAR && noTestBarCount >= PILOT_MIN_NO_TEST_BAR;
  const actions: PilotAction[] = [];

  const falseClaimsByRole = new Map<PilotRole, PilotFalseClaim[]>();
  for (const row of ledger.rows) for (const claim of row.metrics?.falseClaims ?? []) {
    falseClaimsByRole.set(claim.role, [...(falseClaimsByRole.get(claim.role) ?? []), claim]);
  }
  for (const [role, claims] of falseClaimsByRole) if (claims.length >= 2) {
    actions.push(makeAction("T1", role, claims.slice(0, 2).map((claim) => claim.locator), `Second C4/C7 false claim by ${role}.`));
  }

  const reworkAssignmentsByRole = new Map<"worker" | "fix-writer", PilotRow[]>();
  const eligibleOperationalRows = ledger.rows.filter((row) => row.worker && row.primary && row.realWork).slice(0, PILOT_WINDOW_SIZE);
  for (const row of eligibleOperationalRows) for (const role of ["worker", "fix-writer"] as const) {
    if (row.parentRework.some((item) => item.implicatedRole === role)) {
      reworkAssignmentsByRole.set(role, [...(reworkAssignmentsByRole.get(role) ?? []), row]);
    }
  }
  for (const [role, rows] of reworkAssignmentsByRole) if (rows.length >= 4) {
    actions.push(makeAction("T2", role, rows.flatMap((row) => row.parentRework.filter((item) => item.implicatedRole === role).map((item) => item.locator)), `Honest rework exceeded one third of the ten-assignment window for ${role}.`));
  }

  const production = average(cleanRows.map((row) => row.metrics!.productionScarcePremiumCalls));
  const baseline = average(cleanRows.map((row) => row.metrics!.baselineProductionScarcePremiumCallsPerTicket));
  const costComparison = compare(production, baseline);
  const costResult = costComparison === "decreased" ? "strict-decrease" : costComparison;
  if (windowComplete && costResult === "increased") {
    actions.push(makeAction("T3", "worker", cleanRows.map((row) => row.metrics!.baselineLocator), "Production scarce-premium calls per ticket rose versus the matched baseline."));
  }

  for (const row of ledger.rows) {
    const important = row.metrics?.flatFeeImportantReasoning;
    if (important) actions.push(makeAction("T4", important.role, [important.locator], "A flat-fee role carried important reasoning."));
    const downgrade = row.metrics?.silentThinkingDowngrade;
    if (downgrade) actions.push(makeAction("T5", downgrade.role, [downgrade.locator], "A scarce-premium role silently downgraded effective thinking."));
  }

  const qualityQualified = windowComplete && actions.length === 0;
  const latency = average(cleanRows.map((row) => row.metrics!.latencyMs));
  const baselineLatency = average(cleanRows.map((row) => row.metrics!.baselineLatencyMs));
  const latencyResult = compare(latency, baselineLatency);
  const decision: PilotDecision = actions.length > 0 ? "rollback/config-repair"
    : !qualityQualified || costResult === "unknown" ? "hold/incomplete" : "owner-decision-ready";
  const ownerConsequence: PilotEvaluation["ownerConsequence"] = decision === "rollback/config-repair" ? "apply-role-action"
    : decision === "hold/incomplete" ? "collect-replacement-evidence"
    : costResult === "strict-decrease" ? "consider-promotion" : "remain-opt-in";
  return {
    cleanRows, testBarCount, noTestBarCount, windowComplete, qualityQualified,
    productionCallsPerTicket: production, baselineCallsPerTicket: baseline,
    costResult, latencyResult, decision, ownerConsequence, actions,
  };
}

export function isWorkerLaneControl(value: unknown): value is WorkerLaneControl {
  if (!object(value) || !["enabled", "demoted", "disabled"].includes(value.mode as string)) return false;
  if (value.mode === "enabled") return value.reason === undefined && value.locator === undefined && value.operatorConsequence === undefined;
  return nonEmpty(value.reason) && nonEmpty(value.locator) && nonEmpty(value.operatorConsequence);
}

export function effectiveWriterLane(control: WorkerLaneControl | undefined, requested: "parent" | "worker"): "parent" | "worker" {
  return requested === "worker" && (control?.mode ?? "enabled") === "enabled" ? "worker" : "parent";
}

export function renderPilotStatus(ledger: PilotLedger, control?: WorkerLaneControl): string {
  const evaluation = evaluatePilotWindow(ledger);
  return `pilot clean=${evaluation.cleanRows.length}/10 test-bar=${evaluation.testBarCount}/6 no-test-bar=${evaluation.noTestBarCount}/2 decision=${evaluation.decision} consequence=${evaluation.ownerConsequence} worker=${control?.mode ?? "enabled"}`;
}

export function renderPilotReport(ledger: PilotLedger, control?: WorkerLaneControl): string {
  const evaluation = evaluatePilotWindow(ledger);
  const actions = evaluation.actions.map((item) => `${item.trigger}:${item.action}:${item.role} (${item.operatorConsequence})`).join(" | ") || "none";
  return `${renderPilotStatus(ledger, control)}; production-calls/ticket=${evaluation.productionCallsPerTicket}; arbitration-excluded=true; baseline=${evaluation.baselineCallsPerTicket}; cost=${evaluation.costResult}; latency-tiebreak=${evaluation.latencyResult}; actions=${actions}`;
}
