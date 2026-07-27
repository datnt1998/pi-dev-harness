# Plan Ticket: Quota Snapshot and Launch Gate

Status: ready for implementation
Lifecycle: **plan (ephemeral)**
Owner/deletion trigger: the implementation owner must **delete this plan** (and its plan-contract test) in the same commit that lands the final accepted slice. Durable behavior remains in code, tests, and `skills/engineering-workflow/references/delegation-policy.md`.

## Goal

Publish one fresh, machine-readable snapshot of scarce-premium provider capacity and use it as a fail-closed gate before main-session or delegated scarce-premium work starts. Track protected category balances across the weekly reset epoch, make degradation explicit, and let existing UI consume the same authoritative state.

## Non-goals

- No provider purchase, plan, or authentication changes.
- No new model-routing table or automatic model choice beyond returning a gate decision.
- No second quota client; extend the existing provider-usage fetch/core path.
- No paid live-model probes. Validate with synthetic fixtures.
- No telemetry dashboard or historical routing-window aggregator in this ticket.
- No silent automatic fallback.

## Normative inputs

Implementation must follow the scarce-premium budget, T4 classifier, attribution, and degradation rules in `skills/engineering-workflow/references/delegation-policy.md`. Where this plan and that living policy differ, stop and reconcile the policy before implementation.

## Proposed public seams

Names are illustrative; preserve existing module conventions discovered during implementation.

### 1. Snapshot

Expose an immutable machine-readable snapshot from the existing provider-usage core:

```ts
type QuotaWindow = {
  remainingPercent: number | null;
  usedPercent: number | null;
  resetAt: string | null;
};

type PremiumQuotaSnapshot = {
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
```

Rules:

- Effective weekly remaining is the minimum of the generic weekly and premium-specific weekly values when both exist; use the available one only when the provider contract permits it.
- Preserve raw values/reset times needed to explain the derived result; never coerce absent values to zero.
- Snapshot age is derived from `fetchedAt`, not UI render time.
- TUI bars/widgets consume this snapshot; they are not launch authority.
- Fetch must be independent of whichever provider/model is active in the main session.

### 2. Weekly ledger

Persist one ledger keyed by provider identity plus **weekly reset epoch**:

```ts
type QuotaCategory = "main" | "production-review" | "arbitration" | "emergency";

type CategoryBalances = Record<QuotaCategory, number>;

type QuotaLedger = {
  version: 1;
  resetEpoch: string;
  initialRemainingPercent: number;
  balances: CategoryBalances;
  pending: ProvisionalDebit[];
  debits: ObservedDebit[];
  borrowEvents: BorrowEvent[];
};
```

Initialization allocates the available weekly window using the policy's **60 / 20 / 15 / 5** envelope, conservatively protecting emergency, arbitration, main, then review when adoption begins mid-week.

Borrowing follows policy priority and records source category, destination category, amount, work-unit attribution, timestamp, and owner override when applicable. A lower-priority category never borrows from a higher-priority reserve.

Before a permitted launch, hold a one-percentage-point **provisional debit**. After refresh, reconcile it against the positive before/after utilization delta; delayed readings keep the conservative hold rather than manufacturing precision. Reset only when a validated new reset epoch appears.

### 3. Launch gate

Provide a pure decision seam:

```ts
type LaunchRequest = {
  tier: "scarce-premium";
  quotaCategory: QuotaCategory;
  attribution: { source: string; ticket: string; purpose: "production" | "arbitration" };
  context: "fresh" | "fork";
  requestedThinking: "off" | "minimal" | "low" | "medium" | "high";
  importantReasoning: boolean | "unknown";
  ownerEmergencyOverride?: { reason: string };
};

type LaunchDecision = {
  decision: "allow" | "defer" | "owner-required";
  reason: string;
  reserveDebitedFrom: QuotaCategory | null;
  degradationRequired: boolean;
};
```

Fail closed for new non-emergency scarce-premium work when:

- snapshot age exceeds **five minutes**;
- auth/fetch state is erroneous or unknown;
- a required weekly or short-window value/reset is missing;
- effective weekly capacity or the declared category balance is exhausted;
- short-window remaining is **10%** or less;
- attribution, purpose, or quota category is missing/invalid;
- normal premium work is forked into a silent thinking downgrade;
- model selection used an undeclared fallback.

Only an explicit owner emergency override may spend through stale/unknown state, and the ledger records it. An emergency override does not authorize irreversible action; it only authorizes the reasoning call.

T4 remains a separate preflight: important or unknown reasoning can use scarce-premium or policy-approved metered-mid routes, never flat-fee. This gate must not reinterpret T4.

### 4. Refresh and serialization

Refresh:

- at session start;
- immediately before and after each scarce-premium main block or child launch;
- after model changes, rate limits, auth errors, or fallback attempts;
- on the existing five-minute cadence while active.

In scarce/exhausted bands, serialize scarce-premium starts so each provisional/observed debit remains attributable. A gate allowance reserves capacity atomically before another launch can read the same balance.

### 5. Explicit degradation result

The gate never performs fallback. On deferral it returns a reason that the caller uses with the policy's explicit ladder:

1. validated metered-mid primary reasoning;
2. validated metered-mid planning-only support with provisional verdicts;
3. owner decision or deferral until reset.

A degraded result stays labelled degraded and cannot satisfy scarce-premium-only pilot, arbitration, emergency-authorization, or no-test-bar evidence.

## Implementation slices

1. **Snapshot parser/core** — extend existing fetch normalization, preserve all required windows and timestamps, derive effective remaining/freshness/band, add fixtures.
2. **Weekly ledger** — reset-keyed initialization, category protection/borrowing, provisional and observed debit reconciliation, persistence tests.
3. **Pure launch gate** — request validation and fail-closed decisions, including T4 handoff and thinking/fallback checks.
4. **Runtime integration** — refresh triggers, atomic pre-launch reservation, post-run reconciliation, hard-scarce serialization.
5. **UI integration** — existing widgets render the shared snapshot age, band, balances, and gate reason without becoming authority.
6. **Documentation cleanup** — update living package docs if behavior is user-visible, then delete this plan and its plan-contract test.

Keep each slice independently testable and commit-ready. Do not combine UI work with the core gate unless the repository's current seam makes separation impossible.

## Acceptance criteria

- One snapshot source serves both launch decisions and UI; no second quota client exists.
- Snapshot exposes weekly, short-window, premium-specific, resets, fetched-at/age, balances, pending debit, band, and gate reason without missing-to-zero coercion.
- Ledger is stable within a reset epoch and safely reinitializes at a validated reset.
- The 60/20/15/5 allocations, reverse-priority protection, borrowing, and overrides are auditable.
- Every allowed start holds a provisional debit and every terminal unit reconciles or preserves it conservatively.
- Stale/error/missing/exhausted/low-short-window state denies non-emergency starts.
- Attribution and quota category are mandatory and remain separate from accounting purpose.
- T4 important/unknown reasoning never degrades to flat-fee.
- Fallback/degradation is explicit in the decision and completion evidence.
- Scarce-mode concurrent starts cannot overspend the same balance.
- Existing quota UI reads the shared snapshot and displays freshness/gate reason.

## Validation

Use deterministic synthetic fixtures covering:

- fresh complete snapshot and partial provider windows;
- absent values versus real zero;
- stale/error/auth failure and missing reset;
- weekly exhaustion and short-window 10% boundary;
- partial-week conservative initialization;
- each permitted and forbidden borrow direction;
- reset rollover and malformed/backward reset data;
- provisional debit, delayed utilization, larger observed delta, and failed launch release/reconciliation;
- atomic concurrent launch attempts in scarce mode;
- declared degradation, silent fallback attempt, and mid-session exhaustion;
- T4 important, non-important, mixed, and unknown classifications;
- emergency override recording without irreversible-action authorization;
- UI formatting from the same snapshot object.

Required repository gates before each implementation commit:

```bash
npm test
npm run pack:check
```

No live paid-provider call is required for acceptance.

## Risks and stop conditions

- Provider schemas may not expose a premium-specific window. Preserve `unknown` and fail closed rather than inferring it.
- Provider utilization can lag a completed unit. Keep the conservative provisional debit and surface the uncertainty.
- Current fetch/UI seams may couple active-provider selection to refresh. Reuse the transport/auth path but stop for approval before introducing a second client or credential flow.
- If atomic reservation requires a new cross-process storage architecture, stop for an architecture decision; do not fake serialization with timestamps.
- If runtime cannot identify main-session work boundaries reliably, land child-launch gating first and leave main gating explicitly unverified rather than guessing.
