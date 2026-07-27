/**
 * Pure, network-free helpers for AI provider quota (Claude / Codex subscription
 * usage windows). No Pi imports, no secrets, no project identity — the extension
 * handles auth reading, HTTP, and widget rendering; this file only parses
 * provider responses and formats a plain-text line, so it is unit testable.
 */

import type { PremiumQuotaSnapshot, QuotaWindow } from "./quota-gate-core.ts";

export type UsageWindow = {
  /** Short window label, e.g. "5h", "Week", or a premium-specific window. */
  label: string;
  /** Semantic role used by the quota snapshot; labels remain presentation-only. */
  kind?: "short" | "weekly" | "premium-weekly";
  /** Percent of the window already used, 0..100; null means absent. */
  usedPercent: number | null;
  /** Epoch ms when the window resets, when known. */
  resetAt?: number;
};

export type UsageState = {
  provider: string;
  plan?: string;
  windows: UsageWindow[];
  updatedAt: number;
  error?: string;
  quotaStatus?: "ready" | "partial" | "auth-error" | "fetch-error" | "unknown";
  /** Provider-contract permission to use one weekly window without a premium-specific peer. */
  allowSingleWeeklyWindow?: boolean;
};

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** "3m" · "2h5m" · "6d9h" — compact, always rounding up to the next minute. */
export function formatDurationCompact(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d${remHours}h` : `${days}d`;
}

const WEEKLY_RESET_GAP_SECONDS = 4320 * 60;

export function resolveSecondaryWindowLabel(params: {
  windowHours: number;
  primaryResetAt?: number;
  secondaryResetAt?: number;
}): string {
  if (params.windowHours >= 168) return "Week";
  if (params.windowHours < 24) return `${params.windowHours}h`;
  if (
    typeof params.secondaryResetAt === "number" &&
    typeof params.primaryResetAt === "number" &&
    params.secondaryResetAt - params.primaryResetAt >= WEEKLY_RESET_GAP_SECONDS
  ) {
    return "Week";
  }
  return "Day";
}

/** Severity from remaining percent, so a renderer can color without hardcoding. */
export function usageSeverity(leftPercent: number): "ok" | "low" | "critical" {
  if (leftPercent <= 10) return "critical";
  if (leftPercent <= 25) return "low";
  return "ok";
}

/** Theme role for a remaining percent, matching the shared status palette. */
export function usageRole(leftPercent: number): "error" | "warning" | "success" | "muted" {
  if (leftPercent <= 10) return "error";
  if (leftPercent <= 25) return "warning";
  if (leftPercent >= 75) return "success";
  return "muted";
}

type Fg = (role: string, text: string) => string;

/** Colored progress bar built through an injected theme `fg`. Brackets/empty use `dim` for portability. */
export function renderBarThemed(fg: Fg, leftPercent: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((clampPercent(leftPercent) / 100) * width)));
  return `${fg("dim", "[")}${fg(usageRole(clampPercent(leftPercent)), "\u2588".repeat(filled))}${fg("dim", "\u2591".repeat(width - filled))}${fg("dim", "]")}`;
}

/**
 * Colored, cohesive one-line quota summary through an injected theme `fg`
 * (role -> styled string). Shared by the footer's second line and the standalone
 * widget so both look identical. Pure and testable (pass `fg = (_r, t) => t`).
 */
export function formatUsageThemed(
  fg: Fg,
  state: UsageState | undefined,
  opts: { barWidth?: number; showReset?: boolean; now?: number } = {},
): string {
  if (!state) return fg("dim", "Usage quota n/a");
  const label = providerLabel(state.provider);
  if (state.error) return fg("warning", `${label} quota: ${state.error}`);
  if (state.windows.length === 0) return fg("dim", `${label} quota n/a`);
  const barWidth = opts.barWidth ?? 10;
  const showReset = opts.showReset ?? true;
  const now = opts.now ?? Date.now();
  const parts = state.windows.map((w) => {
    if (w.usedPercent === null) return `${fg("dim", w.label)} ${fg("muted", "n/a")}`;
    const left = Math.max(0, 100 - w.usedPercent);
    const role = usageRole(left);
    const reset = showReset && w.resetAt ? fg("dim", ` \u00b7 reset ${formatDurationCompact(w.resetAt - now)}`) : "";
    return `${fg("dim", w.label)} ${renderBarThemed(fg, left, barWidth)} ${fg(role, `${left.toFixed(0)}% left`)}${reset}`;
  });
  return `${fg("accent", label)}  ${parts.join(fg("dim", " \u2502 "))}`;
}

export function providerLabel(provider?: string): string {
  if (provider === "openai-codex") return "Codex";
  if (provider === "anthropic") return "Claude";
  return provider ?? "Usage";
}

/** Parse Anthropic OAuth usage (`api.anthropic.com/api/oauth/usage`). */
export function parseClaudeUsage(data: any, now = Date.now()): UsageState {
  const windows: UsageWindow[] = [];
  if (data?.five_hour?.utilization !== undefined) {
    windows.push({
      label: "5h",
      kind: "short",
      usedPercent: clampPercent(data.five_hour.utilization),
      resetAt: data.five_hour.resets_at ? new Date(data.five_hour.resets_at).getTime() : undefined,
    });
  }
  if (data?.seven_day?.utilization !== undefined) {
    windows.push({
      label: "Week",
      kind: "weekly",
      usedPercent: clampPercent(data.seven_day.utilization),
      resetAt: data.seven_day.resets_at ? new Date(data.seven_day.resets_at).getTime() : undefined,
    });
  }
  const modelWindow = data?.seven_day_sonnet || data?.seven_day_opus;
  if (modelWindow?.utilization !== undefined) {
    windows.push({
      label: data?.seven_day_sonnet ? "Sonnet" : "Opus",
      kind: "premium-weekly",
      usedPercent: clampPercent(modelWindow.utilization),
      resetAt: modelWindow.resets_at ? new Date(modelWindow.resets_at).getTime() : undefined,
    });
  }
  const plan = typeof data?.plan_type === "string" ? data.plan_type : undefined;
  return { provider: "anthropic", plan, windows, updatedAt: now, quotaStatus: "ready", allowSingleWeeklyWindow: false };
}

/** Parse OpenAI Codex usage (`chatgpt.com/backend-api/wham/usage`). */
export function parseCodexUsage(data: any, now = Date.now()): UsageState {
  const windows: UsageWindow[] = [];
  const primary = data?.rate_limit?.primary_window;
  if (primary) {
    const windowHours = Math.round((primary.limit_window_seconds || 10_800) / 3600);
    windows.push({
      label: `${windowHours}h`,
      kind: "short",
      usedPercent: primary.used_percent === undefined || primary.used_percent === null ? null : clampPercent(primary.used_percent),
      resetAt: primary.reset_at ? primary.reset_at * 1000 : undefined,
    });
  }
  const secondary = data?.rate_limit?.secondary_window;
  if (secondary) {
    const windowHours = Math.round((secondary.limit_window_seconds || 604_800) / 3600);
    windows.push({
      label: resolveSecondaryWindowLabel({ windowHours, primaryResetAt: primary?.reset_at, secondaryResetAt: secondary.reset_at }),
      kind: "weekly",
      usedPercent: secondary.used_percent === undefined || secondary.used_percent === null ? null : clampPercent(secondary.used_percent),
      resetAt: secondary.reset_at ? secondary.reset_at * 1000 : undefined,
    });
  }
  let plan = typeof data?.plan_type === "string" ? data.plan_type : undefined;
  const balance = data?.credits?.balance;
  if (balance !== undefined && balance !== null) {
    const n = typeof balance === "number" ? balance : Number.parseFloat(balance) || 0;
    plan = plan ? `${plan} ($${n.toFixed(2)})` : `$${n.toFixed(2)}`;
  }
  return { provider: "openai-codex", plan, windows, updatedAt: now, quotaStatus: "ready", allowSingleWeeklyWindow: true };
}

function quotaWindow(window: UsageWindow | undefined): QuotaWindow | null {
  if (!window) return null;
  const usedPercent = window.usedPercent;
  return {
    usedPercent,
    remainingPercent: usedPercent === null ? null : Math.max(0, 100 - usedPercent),
    resetAt: typeof window.resetAt === "number" && Number.isFinite(window.resetAt) ? new Date(window.resetAt).toISOString() : null,
  };
}

/** Normalize the existing provider fetch result into the launch-authority input. */
export function toUsageQuotaInput(state: UsageState) {
  return {
    fetchedAt: new Date(state.updatedAt).toISOString(),
    status: state.quotaStatus ?? (state.error ? "fetch-error" : "unknown"),
    shortWindow: quotaWindow(state.windows.find((window) => window.kind === "short")),
    weekly: quotaWindow(state.windows.find((window) => window.kind === "weekly")),
    premiumSpecificWeekly: quotaWindow(state.windows.find((window) => window.kind === "premium-weekly")),
    allowSingleWeeklyWindow: state.allowSingleWeeklyWindow === true,
  } as const;
}

/** Shared snapshot rendering for both quota widgets; never used as launch authority. */
export function formatQuotaSnapshotThemed(
  fg: Fg,
  snapshot: PremiumQuotaSnapshot | undefined,
  opts: { barWidth?: number } = {},
): string {
  if (!snapshot) return fg("dim", "Usage quota n/a · gate unavailable");
  const width = opts.barWidth ?? 8;
  const weekly = snapshot.effectiveWeeklyRemainingPercent;
  const short = snapshot.shortWindow?.remainingPercent ?? null;
  const windowParts = [
    short === null ? `${fg("dim", "Short")} ${fg("muted", "n/a")}` : `${fg("dim", "Short")} ${renderBarThemed(fg, short, width)} ${fg(usageRole(short), `${short.toFixed(0)}% left`)}`,
    weekly === null ? `${fg("dim", "Week")} ${fg("muted", "n/a")}` : `${fg("dim", "Week")} ${renderBarThemed(fg, weekly, width)} ${fg(usageRole(weekly), `${weekly.toFixed(0)}% left`)}`,
  ];
  const age = Number.isFinite(snapshot.ageMs) ? formatDurationCompact(snapshot.ageMs) : "unknown";
  const balances = snapshot.categoryBalances
    ? `main ${snapshot.categoryBalances.main.toFixed(0)}% · review ${snapshot.categoryBalances["production-review"].toFixed(0)}% · arb ${snapshot.categoryBalances.arbitration.toFixed(0)}% · emergency ${snapshot.categoryBalances.emergency.toFixed(0)}%`
    : "balances n/a";
  return `${windowParts.join(fg("dim", " │ "))}${fg("dim", ` │ ${snapshot.freshness} ${age} │ ${snapshot.band} │ ${balances} │ gate ${snapshot.gateReason}`)}`;
}

export function renderBar(leftPercent: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((clampPercent(leftPercent) / 100) * width)));
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

/**
 * Plain-text (theme-free) one-line quota summary, safe for a belowEditor widget
 * in any project. e.g. "Claude  5h [██████░░░░] 76% left · reset 4h10m │ Week ..."
 */
export function formatUsageLine(
  state: UsageState | undefined,
  opts: { barWidth?: number; showReset?: boolean; now?: number } = {},
): string {
  if (!state) return "Usage quota n/a";
  const label = providerLabel(state.provider);
  if (state.error) return `${label} quota: ${state.error}`;
  if (state.windows.length === 0) return `${label} quota n/a`;
  const barWidth = opts.barWidth ?? 10;
  const showReset = opts.showReset ?? true;
  const now = opts.now ?? Date.now();
  const parts = state.windows.map((w) => {
    if (w.usedPercent === null) return `${w.label} n/a`;
    const left = Math.max(0, 100 - w.usedPercent);
    const reset = showReset && w.resetAt ? ` · reset ${formatDurationCompact(w.resetAt - now)}` : "";
    return `${w.label} ${renderBar(left, barWidth)} ${left.toFixed(0)}% left${reset}`;
  });
  return `${label}  ${parts.join(" │ ")}`;
}
