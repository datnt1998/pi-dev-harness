/**
 * Provider-neutral quota snapshot, weekly ledger, and scarce-premium launch gate.
 *
 * This module is pure except for QuotaLaunchRuntime's injected refresh/store
 * adapters. It never chooses or falls back to a model. Callers must declare the
 * selected tier, effective thinking, fallback state, attribution, and category.
 */

export type QuotaWindow = {
  remainingPercent: number | null;
  usedPercent: number | null;
  resetAt: string | null;
};

export type QuotaCategory = "main" | "production-review" | "arbitration" | "emergency";
export type AccountingPurpose = "production" | "arbitration";
export type CategoryBalances = Record<QuotaCategory, number>;
export type WorkAttribution = { source: string; ticket: string; purpose: AccountingPurpose };

export type UsageQuotaInput = {
  fetchedAt: string;
  status: "ready" | "partial" | "auth-error" | "fetch-error" | "unknown";
  weekly: QuotaWindow | null;
  shortWindow: QuotaWindow | null;
  premiumSpecificWeekly: QuotaWindow | null;
  /** Whether this provider's contract permits one weekly window by itself. */
  allowSingleWeeklyWindow: boolean;
};

export type PremiumQuotaSnapshot = {
  version: 1;
  fetchedAt: string;
  ageMs: number;
  freshness: "fresh" | "stale" | "unknown";
  status: "ready" | "partial" | "auth-error" | "fetch-error" | "unknown";
  weekly: QuotaWindow | null;
  shortWindow: QuotaWindow | null;
  premiumSpecificWeekly: QuotaWindow | null;
  effectiveWeeklyRemainingPercent: number | null;
  categoryBalances: CategoryBalances | null;
  pendingDebitPercent: number;
  band: "healthy" | "scarce" | "exhausted" | "unknown";
  gateReason: string;
};

export type ProvisionalDebit = {
  id: string;
  category: QuotaCategory;
  reserveDebitedFrom: QuotaCategory;
  amount: number;
  attribution: WorkAttribution;
  createdAt: string;
  ownerEmergencyOverride?: { reason: string };
};

export type ObservedDebit = {
  id: string;
  category: QuotaCategory;
  reserveDebitedFrom: QuotaCategory;
  amount: number;
  attribution: WorkAttribution;
  observedAt: string;
  ownerEmergencyOverride?: { reason: string };
};

export type BorrowEvent = {
  sourceCategory: QuotaCategory;
  destinationCategory: QuotaCategory;
  amount: number;
  attribution: WorkAttribution;
  timestamp: string;
  ownerOverride?: { reason: string };
};

export type QuotaLedger = {
  version: 1;
  resetEpoch: string;
  initialRemainingPercent: number;
  balances: CategoryBalances;
  pending: ProvisionalDebit[];
  debits: ObservedDebit[];
  borrowEvents: BorrowEvent[];
};

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";
export type ModelTier = "scarce-premium" | "metered-mid" | "flat-fee";

export type LaunchRequest = {
  tier: "scarce-premium";
  quotaCategory: QuotaCategory;
  attribution: WorkAttribution;
  context: "fresh" | "fork";
  requestedThinking: ThinkingLevel;
  importantReasoning: boolean | "unknown" | "mixed";
  route: {
    selectedTier: ModelTier;
    effectiveThinking: ThinkingLevel;
    fallback: "none" | "declared" | "undeclared";
  };
  ownerEmergencyOverride?: { reason: string };
};

export type DegradationRequest = {
  declared: boolean;
  targetTier: "metered-mid" | "flat-fee";
  mode: "primary" | "planning-only";
  importantReasoning: boolean | "unknown" | "mixed";
  intendedEvidence: "ordinary" | "scarce-premium-pilot" | "arbitration" | "emergency-authorization" | "no-test-bar";
};

export type DegradationDecision = {
  decision: "allow" | "defer" | "owner-required";
  reason: string;
  degraded: true;
  verdict: "final" | "provisional";
  evidenceEligible: boolean;
};

export type LaunchDecision = {
  decision: "allow" | "defer" | "owner-required";
  reason: string;
  reserveDebitedFrom: QuotaCategory | null;
  degradationRequired: boolean;
  /** Emergency quota never grants authority for an irreversible action. */
  irreversibleActionAuthorized: false;
};

const CATEGORY_ORDER: QuotaCategory[] = ["main", "production-review", "arbitration", "emergency"];
const THINKING_RANK: Record<ThinkingLevel, number> = { off: 0, minimal: 1, low: 2, medium: 3, high: 4 };
const ALLOCATION_CAP: CategoryBalances = { main: 60, "production-review": 20, arbitration: 15, emergency: 5 };
const BORROW_ORDER: Record<QuotaCategory, QuotaCategory[]> = {
  "production-review": [],
  main: ["production-review"],
  arbitration: ["production-review", "main"],
  emergency: ["production-review", "main", "arbitration"],
};
const FRESH_MS = 5 * 60_000;
const PROVISIONAL_PERCENT = 1;

function finitePercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function validIso(value: string | null): boolean {
  return value !== null && Number.isFinite(Date.parse(value));
}

function cloneWindow(window: QuotaWindow | null): QuotaWindow | null {
  if (!window) return null;
  return Object.freeze({
    remainingPercent: finitePercent(window.remainingPercent),
    usedPercent: finitePercent(window.usedPercent),
    resetAt: window.resetAt,
  });
}

function effectiveWeekly(input: UsageQuotaInput): number | null {
  const generic = finitePercent(input.weekly?.remainingPercent ?? null);
  const specific = finitePercent(input.premiumSpecificWeekly?.remainingPercent ?? null);
  if (generic !== null && specific !== null) return Math.min(generic, specific);
  if (!input.allowSingleWeeklyWindow) return null;
  return generic ?? specific;
}

function weeklyResetsValid(weekly: QuotaWindow | null, premiumSpecificWeekly: QuotaWindow | null, after?: string): boolean {
  if (!weekly && !premiumSpecificWeekly) return false;
  const floor = after ? Date.parse(after) : Number.NEGATIVE_INFINITY;
  const valid = (window: QuotaWindow | null) => !window || (validIso(window.resetAt) && Date.parse(window.resetAt!) > floor);
  return valid(weekly) && valid(premiumSpecificWeekly);
}

function effectiveWeeklyReset(input: UsageQuotaInput): string | null {
  const generic = finitePercent(input.weekly?.remainingPercent ?? null);
  const specific = finitePercent(input.premiumSpecificWeekly?.remainingPercent ?? null);
  if (generic !== null && specific !== null) {
    if (generic < specific) return input.weekly?.resetAt ?? null;
    if (specific < generic) return input.premiumSpecificWeekly?.resetAt ?? null;
    const resets = [input.weekly?.resetAt, input.premiumSpecificWeekly?.resetAt]
      .filter((value): value is string => !!value && validIso(value));
    return resets.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  }
  if (!input.allowSingleWeeklyWindow) return null;
  return generic !== null ? input.weekly?.resetAt ?? null : specific !== null ? input.premiumSpecificWeekly?.resetAt ?? null : null;
}

function snapshotReason(snapshot: Omit<PremiumQuotaSnapshot, "gateReason">): string {
  if (snapshot.freshness === "unknown") return "quota snapshot fetch time is unknown";
  if (snapshot.freshness === "stale") return "quota snapshot is older than five minutes";
  if (!snapshot.weekly && !snapshot.premiumSpecificWeekly) return "weekly quota window is missing";
  if (snapshot.effectiveWeeklyRemainingPercent === null) return "required premium-specific weekly quota is missing";
  if (!snapshot.shortWindow) return "short quota window is missing";
  if (!weeklyResetsValid(snapshot.weekly, snapshot.premiumSpecificWeekly, snapshot.fetchedAt)) return "weekly reset is missing or invalid";
  if (snapshot.status !== "ready") return `quota snapshot status is ${snapshot.status}`;
  if (!validIso(snapshot.shortWindow.resetAt) || Date.parse(snapshot.shortWindow.resetAt!) <= Date.parse(snapshot.fetchedAt)) return "short-window reset is missing or invalid";
  if (snapshot.effectiveWeeklyRemainingPercent <= 0) return "effective weekly quota is exhausted";
  if (snapshot.shortWindow.remainingPercent === null) return "short-window remaining quota is missing";
  if (snapshot.shortWindow.remainingPercent <= 10) return "short-window remaining quota is 10% or less";
  return "ready";
}

export function buildPremiumQuotaSnapshot(
  input: UsageQuotaInput,
  ledger: QuotaLedger | null,
  now = Date.now(),
): PremiumQuotaSnapshot {
  const fetchedMs = Date.parse(input.fetchedAt);
  const ageMs = Number.isFinite(fetchedMs) ? Math.max(0, now - fetchedMs) : Number.NaN;
  const freshness: PremiumQuotaSnapshot["freshness"] = !Number.isFinite(ageMs)
    ? "unknown"
    : ageMs > FRESH_MS ? "stale" : "fresh";
  const weekly = cloneWindow(input.weekly);
  const shortWindow = cloneWindow(input.shortWindow);
  const premiumSpecificWeekly = cloneWindow(input.premiumSpecificWeekly);
  const effective = effectiveWeekly(input);
  let status = input.status;
  if (status === "ready" && (
    effective === null || !shortWindow ||
    !weeklyResetsValid(weekly, premiumSpecificWeekly, input.fetchedAt) ||
    !validIso(shortWindow.resetAt) || Date.parse(shortWindow.resetAt!) <= fetchedMs
  )) status = "partial";

  const pre: Omit<PremiumQuotaSnapshot, "gateReason"> = {
    version: 1,
    fetchedAt: input.fetchedAt,
    ageMs,
    freshness,
    status,
    weekly,
    shortWindow,
    premiumSpecificWeekly,
    effectiveWeeklyRemainingPercent: effective,
    categoryBalances: ledger ? Object.freeze({ ...ledger.balances }) : null,
    pendingDebitPercent: ledger?.pending.reduce((sum, debit) => sum + debit.amount, 0) ?? 0,
    band: status !== "ready" || freshness === "unknown" || effective === null || shortWindow?.remainingPercent === null || shortWindow === null
      ? "unknown"
      : effective <= 0 || shortWindow.remainingPercent <= 10
        ? "exhausted"
        : effective <= 25
          ? "scarce"
          : "healthy",
  };
  return Object.freeze({ ...pre, gateReason: snapshotReason(pre) });
}

function normalizedEpoch(resetEpoch: string): string | null {
  const epoch = Date.parse(resetEpoch);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

/** Allocate mid-week capacity by filling protected reserves from highest priority. */
export function createQuotaLedger(resetEpoch: string, initialRemainingPercent: number, _now = Date.now()): QuotaLedger {
  const normalized = normalizedEpoch(resetEpoch);
  if (!normalized) throw new Error("resetEpoch must be a valid timestamp");
  let available = Math.max(0, Math.min(100, initialRemainingPercent));
  const balances: CategoryBalances = { main: 0, "production-review": 0, arbitration: 0, emergency: 0 };
  for (const category of ["emergency", "arbitration", "main", "production-review"] as const) {
    const amount = Math.min(ALLOCATION_CAP[category], available);
    balances[category] = amount;
    available -= amount;
  }
  return { version: 1, resetEpoch: normalized, initialRemainingPercent: Math.max(0, Math.min(100, initialRemainingPercent)), balances, pending: [], debits: [], borrowEvents: [] };
}

export function rolloverQuotaLedger(ledger: QuotaLedger, resetEpoch: string, remainingPercent: number, now = Date.now()): QuotaLedger {
  const next = normalizedEpoch(resetEpoch);
  const current = normalizedEpoch(ledger.resetEpoch);
  if (!next || !current || Date.parse(next) <= Date.parse(current)) return ledger;
  return createQuotaLedger(next, remainingPercent, now);
}

function validAttribution(value: WorkAttribution): boolean {
  if (!value || typeof value !== "object") return false;
  if (typeof value.source !== "string" || !value.source || value.source.startsWith("/") || value.source.split(/[\\/]/).includes("..")) return false;
  if (typeof value.ticket !== "string" || !value.ticket.trim()) return false;
  return value.purpose === "production" || value.purpose === "arbitration";
}

function availableReserve(ledger: QuotaLedger, category: QuotaCategory): QuotaCategory | null {
  if (ledger.balances[category] >= PROVISIONAL_PERCENT) return category;
  for (const source of BORROW_ORDER[category]) if (ledger.balances[source] >= PROVISIONAL_PERCENT) return source;
  return null;
}

function deny(reason: string, decision: "defer" | "owner-required" = "defer"): LaunchDecision {
  return { decision, reason, reserveDebitedFrom: null, degradationRequired: true, irreversibleActionAuthorized: false };
}

function snapshotStateFailure(snapshot: PremiumQuotaSnapshot): string | null {
  if (snapshot.freshness !== "fresh") return snapshot.gateReason;
  if (snapshot.status !== "ready") return snapshot.gateReason;
  if (snapshot.effectiveWeeklyRemainingPercent === null) return snapshot.gateReason;
  if (!snapshot.shortWindow || snapshot.shortWindow.remainingPercent === null) return snapshot.gateReason;
  if (!weeklyResetsValid(snapshot.weekly, snapshot.premiumSpecificWeekly, snapshot.fetchedAt)) return snapshot.gateReason;
  if (!validIso(snapshot.shortWindow.resetAt) || Date.parse(snapshot.shortWindow.resetAt!) <= Date.parse(snapshot.fetchedAt)) return snapshot.gateReason;
  return null;
}

export function decideQuotaLaunch(snapshot: PremiumQuotaSnapshot, ledger: QuotaLedger | null, candidate: LaunchRequest): LaunchDecision {
  const request = candidate as LaunchRequest;
  if (!request || request.tier !== "scarce-premium") return deny("invalid scarce-premium tier declaration");
  if (!CATEGORY_ORDER.includes(request.quotaCategory)) return deny("quota category is missing or invalid");
  if (!validAttribution(request.attribution)) return deny("attribution source, ticket, or purpose is missing or invalid");
  if (request.context !== "fresh" && request.context !== "fork") return deny("context declaration is invalid");
  if (!(request.requestedThinking in THINKING_RANK)) return deny("requested thinking is invalid");
  if (request.importantReasoning !== true && request.importantReasoning !== false && request.importantReasoning !== "unknown" && request.importantReasoning !== "mixed") return deny("T4 classification is missing or invalid");
  if (request.ownerEmergencyOverride && request.quotaCategory !== "emergency") return deny("owner emergency override is valid only for the emergency category");
  if (!request.route || !(["scarce-premium", "metered-mid", "flat-fee"] as string[]).includes(request.route.selectedTier)) return deny("selected route is missing or invalid");
  if (request.route.fallback === "undeclared") return deny("undeclared model fallback is forbidden");
  if (request.route.selectedTier !== "scarce-premium") {
    if ((request.importantReasoning === true || request.importantReasoning === "unknown" || request.importantReasoning === "mixed") && request.route.selectedTier === "flat-fee") {
      return deny("T4 important or unknown reasoning cannot use flat-fee");
    }
    return deny("explicit degradation required; launch gate never performs fallback");
  }
  if (THINKING_RANK[request.route.effectiveThinking] < THINKING_RANK[request.requestedThinking]) {
    return deny(`${request.context} scarce-premium launch would silently downgrade thinking`);
  }

  const stateFailure = snapshotStateFailure(snapshot);
  if (stateFailure) {
    const emergency = request.quotaCategory === "emergency";
    if (!emergency) return deny(stateFailure);
    if (!request.ownerEmergencyOverride?.reason.trim()) return deny(`${stateFailure}; explicit owner emergency override required`, "owner-required");
    if (!ledger) return deny(`${stateFailure}; no reset-keyed ledger exists to record an override`, "owner-required");
  }
  // Overrides bypass stale/unknown state only, never known exhaustion/critical short-window state.
  if (snapshot.effectiveWeeklyRemainingPercent !== null && snapshot.effectiveWeeklyRemainingPercent < PROVISIONAL_PERCENT) return deny("effective weekly quota cannot cover the one-percent provisional debit");
  if (snapshot.shortWindow?.remainingPercent !== null && snapshot.shortWindow && snapshot.shortWindow.remainingPercent <= 10) return deny("short-window remaining quota is 10% or less");
  if (!ledger) return deny("weekly quota ledger is unavailable");
  const source = availableReserve(ledger, request.quotaCategory);
  if (!source) return deny(`${request.quotaCategory} quota and permitted lower-priority reserves are exhausted`);
  return { decision: "allow", reason: request.ownerEmergencyOverride ? "owner emergency override recorded" : "ready", reserveDebitedFrom: source, degradationRequired: false, irreversibleActionAuthorized: false };
}

function reserveProvisionalDebit(ledger: QuotaLedger, request: LaunchRequest, decision: LaunchDecision, now: number, id: string): QuotaLedger {
  if (decision.decision !== "allow" || !decision.reserveDebitedFrom) return ledger;
  const source = decision.reserveDebitedFrom;
  const next = structuredClone(ledger);
  next.balances[source] -= PROVISIONAL_PERCENT;
  next.pending.push({
    id,
    category: request.quotaCategory,
    reserveDebitedFrom: source,
    amount: PROVISIONAL_PERCENT,
    attribution: { ...request.attribution },
    createdAt: new Date(now).toISOString(),
    ...(request.ownerEmergencyOverride ? { ownerEmergencyOverride: { ...request.ownerEmergencyOverride } } : {}),
  });
  if (source !== request.quotaCategory) {
    next.borrowEvents.push({
      sourceCategory: source,
      destinationCategory: request.quotaCategory,
      amount: PROVISIONAL_PERCENT,
      attribution: { ...request.attribution },
      timestamp: new Date(now).toISOString(),
      ...(request.ownerEmergencyOverride ? { ownerOverride: { ...request.ownerEmergencyOverride } } : {}),
    });
  }
  return next;
}

export function releaseProvisionalDebit(ledger: QuotaLedger, id: string): QuotaLedger {
  const debit = ledger.pending.find((item) => item.id === id);
  if (!debit) return ledger;
  const next = structuredClone(ledger);
  next.pending = next.pending.filter((item) => item.id !== id);
  next.balances[debit.reserveDebitedFrom] += debit.amount;
  return next;
}

export function reconcileProvisionalDebit(ledger: QuotaLedger, id: string, observedDeltaPercent: number, now = Date.now()): QuotaLedger {
  const provisional = ledger.pending.find((item) => item.id === id);
  if (!provisional || !Number.isFinite(observedDeltaPercent) || observedDeltaPercent <= 0) return ledger;
  const observed = Math.max(0, observedDeltaPercent);
  const next = structuredClone(ledger);
  next.pending = next.pending.filter((item) => item.id !== id);
  next.balances[provisional.reserveDebitedFrom] += provisional.amount - observed;
  next.debits.push({
    id,
    category: provisional.category,
    reserveDebitedFrom: provisional.reserveDebitedFrom,
    amount: observed,
    attribution: { ...provisional.attribution },
    observedAt: new Date(now).toISOString(),
    ...(provisional.ownerEmergencyOverride ? { ownerEmergencyOverride: { ...provisional.ownerEmergencyOverride } } : {}),
  });
  return next;
}

/** Evaluate, but never perform, the policy's explicit degradation ladder. */
export function decideDegradation(request: DegradationRequest): DegradationDecision {
  const verdict = request.mode === "planning-only" ? "provisional" : "final";
  if (!request.declared) {
    return { decision: "defer", reason: "degradation must be declared explicitly", degraded: true, verdict, evidenceEligible: false };
  }
  if (request.targetTier !== "metered-mid") {
    const t4 = request.importantReasoning === true || request.importantReasoning === "unknown" || request.importantReasoning === "mixed";
    return {
      decision: "defer",
      reason: t4 ? "T4 important, mixed, or unknown reasoning cannot use flat-fee" : "the scarce-premium degradation ladder does not use flat-fee",
      degraded: true,
      verdict,
      evidenceEligible: false,
    };
  }
  const protectedEvidence = request.intendedEvidence !== "ordinary";
  if (protectedEvidence) {
    return {
      decision: "owner-required",
      reason: `degraded work cannot satisfy ${request.intendedEvidence} evidence`,
      degraded: true,
      verdict,
      evidenceEligible: false,
    };
  }
  return {
    decision: "allow",
    reason: request.mode === "planning-only" ? "declared metered-mid planning support; verdict remains provisional" : "declared metered-mid primary reasoning",
    degraded: true,
    verdict,
    evidenceEligible: true,
  };
}

export function getQuotaAccounting(ledger: QuotaLedger): { productionPercent: number; arbitrationPercent: number } {
  let productionPercent = 0;
  let arbitrationPercent = 0;
  for (const debit of ledger.debits) {
    if (debit.attribution.purpose === "arbitration") arbitrationPercent += debit.amount;
    else productionPercent += debit.amount;
  }
  return { productionPercent, arbitrationPercent };
}

export interface QuotaLedgerStore {
  save(providerIdentity: string, ledger: QuotaLedger): Promise<void> | void;
}

type RuntimeOptions = {
  providerIdentity: string;
  initialSnapshot: PremiumQuotaSnapshot;
  initialLedger: QuotaLedger | null;
  refresh: (signal?: AbortSignal) => Promise<UsageQuotaInput>;
  store?: QuotaLedgerStore;
  now?: () => number;
};

export type QuotaLaunchLease = {
  id: string | null;
  decision: LaunchDecision;
  finish(result: { outcome: "completed" | "failed-before-request" | "failed-after-request" }, signal?: AbortSignal): Promise<void>;
};

/**
 * Process-local launch coordinator. Atomic reservations prevent sibling starts
 * from reading the same balance. Scarce starts hold a serialization lease until
 * finish(), keeping observed deltas attributable without cross-process locks.
 */
export class QuotaLaunchRuntime {
  readonly providerIdentity: string;
  snapshot: PremiumQuotaSnapshot;
  ledger: QuotaLedger | null;
  private readonly refreshAdapter: RuntimeOptions["refresh"];
  private readonly store?: QuotaLedgerStore;
  private readonly clock: () => number;
  private atomicTail: Promise<void> = Promise.resolve();
  private scarceTail: Promise<void> = Promise.resolve();
  private sequence = 0;

  constructor(options: RuntimeOptions) {
    if (!options.providerIdentity.trim()) throw new Error("providerIdentity is required");
    this.providerIdentity = options.providerIdentity;
    this.snapshot = options.initialSnapshot;
    this.ledger = options.initialLedger;
    this.refreshAdapter = options.refresh;
    this.store = options.store;
    this.clock = options.now ?? Date.now;
  }

  private async atomic<T>(work: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.atomicTail;
    this.atomicTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }

  private async persist(): Promise<void> {
    if (this.ledger) await this.store?.save(this.providerIdentity, this.ledger);
  }

  async refresh(signal?: AbortSignal): Promise<PremiumQuotaSnapshot> {
    const input = await this.refreshAdapter(signal);
    const effective = effectiveWeekly(input);
    const reset = effectiveWeeklyReset(input);
    if (!this.ledger && effective !== null && reset && normalizedEpoch(reset)) {
      this.ledger = createQuotaLedger(reset, effective, this.clock());
      await this.persist();
    } else if (this.ledger && effective !== null && reset) {
      const rolled = rolloverQuotaLedger(this.ledger, reset, effective, this.clock());
      if (rolled !== this.ledger) { this.ledger = rolled; await this.persist(); }
    }
    this.snapshot = buildPremiumQuotaSnapshot(input, this.ledger, this.clock());
    return this.snapshot;
  }

  private async reserveCurrentSnapshot(request: LaunchRequest): Promise<{
    id: string | null;
    decision: LaunchDecision;
    baselineUsed: number | null;
  }> {
    const baselineUsed = this.snapshot.effectiveWeeklyRemainingPercent === null
      ? null
      : 100 - this.snapshot.effectiveWeeklyRemainingPercent;
    const decision = decideQuotaLaunch(this.snapshot, this.ledger, request);
    if (decision.decision !== "allow" || !this.ledger) return { id: null, decision, baselineUsed };
    const id = `${this.providerIdentity}:${this.clock()}:${++this.sequence}`;
    const reservedLedger = reserveProvisionalDebit(this.ledger, request, decision, this.clock(), id);
    await this.store?.save(this.providerIdentity, reservedLedger);
    this.ledger = reservedLedger;
    this.snapshot = Object.freeze({
      ...this.snapshot,
      categoryBalances: Object.freeze({ ...this.ledger.balances }),
      pendingDebitPercent: this.ledger.pending.reduce((sum, item) => sum + item.amount, 0),
    });
    return { id, decision, baselineUsed };
  }

  async start(request: LaunchRequest, signal?: AbortSignal): Promise<QuotaLaunchLease> {
    // Refresh first, then decide serialization from the authoritative post-fetch
    // band. This closes a healthy→scarce transition race at the launch seam.
    await this.atomic(async () => { await this.refresh(signal); });
    let releaseScarce: (() => void) | undefined;
    let ownsScarceLease = false;
    const acquireScarceLease = async () => {
      const previous = this.scarceTail;
      this.scarceTail = new Promise<void>((resolve) => { releaseScarce = resolve; });
      await previous;
      ownsScarceLease = true;
    };
    if (this.snapshot.band === "scarce" || this.snapshot.band === "exhausted") await acquireScarceLease();

    let result: { id: string | null; decision: LaunchDecision; baselineUsed: number | null } | null;
    try {
      result = await this.atomic(async () => {
        // Another preflight may have published a scarce snapshot before this
        // reservation acquired the atomic section. Retry under the unit lease.
        if (!ownsScarceLease && (this.snapshot.band === "scarce" || this.snapshot.band === "exhausted")) return null;
        return this.reserveCurrentSnapshot(request);
      });
      if (!result) {
        await acquireScarceLease();
        result = await this.atomic(() => this.reserveCurrentSnapshot(request));
      }
    } catch (error) {
      releaseScarce?.();
      throw error;
    }

    const { baselineUsed } = result;
    if (result.decision.decision !== "allow") releaseScarce?.();
    let finished = false;
    return {
      id: result.id,
      decision: result.decision,
      finish: async (finishResult, finishSignal) => {
        if (finished || !result.id) return;
        finished = true;
        try {
          await this.atomic(async () => {
            if (!this.ledger) return;
            let reconciledLedger: QuotaLedger;
            if (finishResult.outcome === "failed-before-request") {
              reconciledLedger = releaseProvisionalDebit(this.ledger, result.id!);
            } else {
              await this.refresh(finishSignal);
              const afterUsed = this.snapshot.effectiveWeeklyRemainingPercent === null ? null : 100 - this.snapshot.effectiveWeeklyRemainingPercent;
              const delta = baselineUsed === null || afterUsed === null ? 0 : Math.max(0, afterUsed - baselineUsed);
              reconciledLedger = reconcileProvisionalDebit(this.ledger!, result.id!, delta, this.clock());
            }
            await this.store?.save(this.providerIdentity, reconciledLedger);
            this.ledger = reconciledLedger;
            this.snapshot = Object.freeze({
              ...this.snapshot,
              categoryBalances: Object.freeze({ ...this.ledger.balances }),
              pendingDebitPercent: this.ledger.pending.reduce((sum, item) => sum + item.amount, 0),
            });
          });
        } finally {
          releaseScarce?.();
        }
      },
    };
  }
}
