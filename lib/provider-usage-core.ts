/**
 * Pure, network-free helpers for AI provider quota (Claude / Codex subscription
 * usage windows). No Pi imports, no secrets, no project identity — the extension
 * handles auth reading, HTTP, and widget rendering; this file only parses
 * provider responses and formats a plain-text line, so it is unit testable.
 */

export type UsageWindow = {
  /** Short window label, e.g. "5h", "Week", "Sonnet". */
  label: string;
  /** Percent of the window already used, 0..100. */
  usedPercent: number;
  /** Epoch ms when the window resets, when known. */
  resetAt?: number;
};

export type UsageState = {
  provider: string;
  plan?: string;
  windows: UsageWindow[];
  updatedAt: number;
  error?: string;
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
      usedPercent: clampPercent(data.five_hour.utilization),
      resetAt: data.five_hour.resets_at ? new Date(data.five_hour.resets_at).getTime() : undefined,
    });
  }
  if (data?.seven_day?.utilization !== undefined) {
    windows.push({
      label: "Week",
      usedPercent: clampPercent(data.seven_day.utilization),
      resetAt: data.seven_day.resets_at ? new Date(data.seven_day.resets_at).getTime() : undefined,
    });
  }
  const modelWindow = data?.seven_day_sonnet || data?.seven_day_opus;
  if (modelWindow?.utilization !== undefined) {
    windows.push({ label: data?.seven_day_sonnet ? "Sonnet" : "Opus", usedPercent: clampPercent(modelWindow.utilization) });
  }
  const plan = typeof data?.plan_type === "string" ? data.plan_type : undefined;
  return { provider: "anthropic", plan, windows, updatedAt: now };
}

/** Parse OpenAI Codex usage (`chatgpt.com/backend-api/wham/usage`). */
export function parseCodexUsage(data: any, now = Date.now()): UsageState {
  const windows: UsageWindow[] = [];
  const primary = data?.rate_limit?.primary_window;
  if (primary) {
    const windowHours = Math.round((primary.limit_window_seconds || 10_800) / 3600);
    windows.push({
      label: `${windowHours}h`,
      usedPercent: clampPercent(primary.used_percent || 0),
      resetAt: primary.reset_at ? primary.reset_at * 1000 : undefined,
    });
  }
  const secondary = data?.rate_limit?.secondary_window;
  if (secondary) {
    const windowHours = Math.round((secondary.limit_window_seconds || 604_800) / 3600);
    windows.push({
      label: resolveSecondaryWindowLabel({ windowHours, primaryResetAt: primary?.reset_at, secondaryResetAt: secondary.reset_at }),
      usedPercent: clampPercent(secondary.used_percent || 0),
      resetAt: secondary.reset_at ? secondary.reset_at * 1000 : undefined,
    });
  }
  let plan = typeof data?.plan_type === "string" ? data.plan_type : undefined;
  const balance = data?.credits?.balance;
  if (balance !== undefined && balance !== null) {
    const n = typeof balance === "number" ? balance : Number.parseFloat(balance) || 0;
    plan = plan ? `${plan} ($${n.toFixed(2)})` : `$${n.toFixed(2)}`;
  }
  return { provider: "openai-codex", plan, windows, updatedAt: now };
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
    const left = Math.max(0, 100 - w.usedPercent);
    const reset = showReset && w.resetAt ? ` · reset ${formatDurationCompact(w.resetAt - now)}` : "";
    return `${w.label} ${renderBar(left, barWidth)} ${left.toFixed(0)}% left${reset}`;
  });
  return `${label}  ${parts.join(" │ ")}`;
}
