/**
 * Auto-compact core logic (pure, UI-free).
 *
 * Mirrors the auto-compaction UX of mainstream agent CLIs (Claude Code style):
 * - visible "context left until auto-compact" indicator
 * - tiered warnings (warn -> critical) without spamming
 * - proactive compaction at a configurable threshold, triggered only at safe
 *   idle boundaries, before the runtime's emergency overflow threshold.
 *
 * Thresholds are resolved in TOKENS. The trigger is the minimum of:
 * - `triggerPercent` of the model's context window (backstop for small windows)
 * - `triggerTokens` absolute cap (essential for 1M-window models where a
 *   percent trigger would waste huge amounts of cache/cost/latency)
 */

export type AutoCompactSettings = {
  /** Master switch for proactive auto-compaction. */
  enabled: boolean;
  /** Compact when context usage reaches this percent of the context window. */
  triggerPercent: number;
  /**
   * Optional absolute token cap: compact when context reaches this many
   * tokens even if still far below triggerPercent (large-window models).
   */
  triggerTokens?: number;
  /** First warning tier percent (relative to the window, scales with the cap). */
  warnPercent: number;
  /** Optional custom focus instructions passed to the compaction summary. */
  focus?: string;
  /**
   * Keep Pi's native between-turns auto-compaction (`compaction.reserveTokens`)
   * aligned with our trigger, so a long single run compacts mid-run WITHOUT
   * interrupting it (our own `ctx.compact()` aborts the run, so it can only run
   * at idle). Default true. Applies from the next session/reload.
   */
  syncNativeReserve?: boolean;
};

export const DEFAULT_AUTOCOMPACT_SETTINGS: AutoCompactSettings = {
  enabled: true,
  triggerPercent: 90,
  warnPercent: 75,
  syncNativeReserve: true,
};

/** Pi's default native compaction reserve; we never make native fire later than this. */
export const NATIVE_RESERVE_DEFAULT = 16384;
/** Always leave at least this much below the window so there is history to keep. */
export const NATIVE_RESERVE_KEEP_FLOOR = 8000;

export const TRIGGER_MIN = 50;
export const TRIGGER_MAX = 95;
export const WARN_MIN = 30;
export const WARN_MAX = 90;
export const TRIGGER_TOKENS_MIN = 30_000;
export const TRIGGER_TOKENS_MAX = 2_000_000;
/** Indicator becomes visible this many window-percent before the warn tier. */
export const INDICATOR_LEAD_PERCENT = 15;

export type CompactTier = "none" | "warn" | "critical";

const TIER_RANK: Record<CompactTier, number> = { none: 0, warn: 1, critical: 2 };

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Normalize possibly-partial/garbage persisted settings into a safe shape. */
export function normalizeAutoCompactSettings(raw: unknown): AutoCompactSettings {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const triggerPercent = clampInt(
    typeof source.triggerPercent === "number" && Number.isFinite(source.triggerPercent)
      ? source.triggerPercent
      : DEFAULT_AUTOCOMPACT_SETTINGS.triggerPercent,
    TRIGGER_MIN,
    TRIGGER_MAX,
  );

  let warnPercent = clampInt(
    typeof source.warnPercent === "number" && Number.isFinite(source.warnPercent)
      ? source.warnPercent
      : DEFAULT_AUTOCOMPACT_SETTINGS.warnPercent,
    WARN_MIN,
    WARN_MAX,
  );
  if (warnPercent >= triggerPercent) {
    warnPercent = Math.max(WARN_MIN, triggerPercent - 5);
  }

  const focusRaw = typeof source.focus === "string" ? source.focus.trim() : "";

  const settings: AutoCompactSettings = {
    enabled: source.enabled !== false,
    triggerPercent,
    warnPercent,
    syncNativeReserve: source.syncNativeReserve !== false,
  };
  if (typeof source.triggerTokens === "number" && Number.isFinite(source.triggerTokens) && source.triggerTokens > 0) {
    settings.triggerTokens = clampInt(source.triggerTokens, TRIGGER_TOKENS_MIN, TRIGGER_TOKENS_MAX);
  }
  if (focusRaw.length > 0) settings.focus = focusRaw;
  return settings;
}

export type ResolvedThresholds = {
  /** Compact at this many context tokens. */
  triggerTokens: number;
  /** Warn tier starts at this many tokens. */
  warnTokens: number;
  /** Indicator becomes visible at this many tokens. */
  showTokens: number;
  /** True when the absolute token cap is lower than the percent threshold. */
  cappedByTokens: boolean;
};

/**
 * Resolve effective thresholds in tokens for a given context window.
 * Warn/indicator thresholds keep their ratio to the trigger, so a token cap
 * on a large-window model scales the whole warning ladder down with it.
 */
export function resolveThresholds(contextWindow: number, settings: AutoCompactSettings): ResolvedThresholds | undefined {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return undefined;

  const percentTokens = (contextWindow * settings.triggerPercent) / 100;
  const capTokens = settings.triggerTokens ?? Number.POSITIVE_INFINITY;
  const triggerTokens = Math.round(Math.min(percentTokens, capTokens));
  const cappedByTokens = capTokens < percentTokens;

  const warnFraction = settings.warnPercent / settings.triggerPercent;
  const showFraction = Math.max(0, settings.warnPercent - INDICATOR_LEAD_PERCENT) / settings.triggerPercent;

  return {
    triggerTokens,
    warnTokens: Math.round(triggerTokens * warnFraction),
    showTokens: Math.round(triggerTokens * showFraction),
    cappedByTokens,
  };
}

/** Resolve which tier a token count falls into. */
export function resolveTier(tokens: number, thresholds: ResolvedThresholds): CompactTier {
  if (tokens >= thresholds.triggerTokens) return "critical";
  if (tokens >= thresholds.warnTokens) return "warn";
  return "none";
}

export type AutoCompactDecision =
  | { action: "none" }
  | { action: "notify"; severity: "warning" | "error"; message: string }
  | { action: "compact"; message: string };

export type AutoCompactEvaluation = {
  decision: AutoCompactDecision;
  /** Tier to store for dedup of future notifications. */
  nextTier: CompactTier;
};

function floorPercent(tokens: number, contextWindow: number): number {
  return Math.floor((tokens / contextWindow) * 100);
}

/**
 * Evaluate context usage against settings.
 *
 * - `lastTier` deduplicates warnings: a tier only notifies when escalating.
 * - `canCompact` gates the compact action to safe boundaries (agent idle,
 *   no pending messages, no compaction already in flight).
 * - `tokens === null` (unknown, e.g. right after compaction) resets tiers
 *   so warnings re-arm for the post-compaction context.
 */
export function evaluateAutoCompact(params: {
  tokens: number | null;
  contextWindow: number | null;
  settings: AutoCompactSettings;
  lastTier: CompactTier;
  canCompact: boolean;
}): AutoCompactEvaluation {
  const { tokens, contextWindow, settings, lastTier, canCompact } = params;

  if (tokens === null || !Number.isFinite(tokens)) {
    return { decision: { action: "none" }, nextTier: "none" };
  }
  const thresholds = contextWindow !== null ? resolveThresholds(contextWindow, settings) : undefined;
  if (!thresholds || contextWindow === null) {
    return { decision: { action: "none" }, nextTier: "none" };
  }

  const tier = resolveTier(tokens, thresholds);
  const pct = floorPercent(tokens, contextWindow);
  const used = `${formatTokens(tokens)} tokens (${pct}%)`;
  const triggerLabel = `${formatTokens(thresholds.triggerTokens)} tokens${thresholds.cappedByTokens ? " (token cap)" : ""}`;

  if (tier === "critical" && settings.enabled && canCompact) {
    return {
      decision: {
        action: "compact",
        message: `Auto-compacting context (${used} ≥ ${triggerLabel})…`,
      },
      nextTier: "critical",
    };
  }

  if (TIER_RANK[tier] > TIER_RANK[lastTier]) {
    if (tier === "critical") {
      const message = settings.enabled
        ? `Context ${used} — auto-compact queued (waiting for idle)`
        : `Context ${used} — auto-compact is OFF; run /compact or /autocompact on`;
      return {
        decision: { action: "notify", severity: settings.enabled ? "warning" : "error", message },
        nextTier: tier,
      };
    }
    return {
      decision: {
        action: "notify",
        severity: "warning",
        message: `Context ${used} — auto-compact at ${triggerLabel}`,
      },
      nextTier: tier,
    };
  }

  return { decision: { action: "none" }, nextTier: tier };
}

/**
 * Desired value for Pi's native `compaction.reserveTokens` so its non-interrupting
 * between-turns compaction fires at our effective trigger. Pi compacts mid-run
 * when `tokens > contextWindow - reserveTokens`, so reserve = window - trigger.
 * Returns undefined when unknown, disabled, or sync is off.
 */
export function computeNativeReserveTokens(
  contextWindow: number | null,
  settings: AutoCompactSettings,
): number | undefined {
  if (!settings.enabled || settings.syncNativeReserve === false) return undefined;
  if (contextWindow === null || !Number.isFinite(contextWindow) || contextWindow <= 0) return undefined;
  const thresholds = resolveThresholds(contextWindow, settings);
  if (!thresholds) return undefined;
  const desired = contextWindow - thresholds.triggerTokens;
  const capped = Math.min(desired, contextWindow - NATIVE_RESERVE_KEEP_FLOOR);
  // Never smaller than Pi's default (would make native fire LATER, not earlier).
  return Math.max(NATIVE_RESERVE_DEFAULT, Math.round(capped));
}

/** Whether the persistent indicator should be visible at this usage level. */
export function shouldShowIndicator(tokens: number | null, contextWindow: number | null, settings: AutoCompactSettings): boolean {
  if (tokens === null || contextWindow === null || !Number.isFinite(tokens)) return false;
  const thresholds = resolveThresholds(contextWindow, settings);
  if (!thresholds) return false;
  return tokens >= thresholds.showTokens;
}

/** Format a token count compactly: 950, 24.9k, 1.25M. */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return "?";
  if (tokens < 1000) return String(Math.round(tokens));
  if (tokens < 1_000_000) {
    return `${Math.round(tokens / 100) / 10}k`;
  }
  return `${Math.round((tokens / 1_000_000) * 100) / 100}M`;
}

/** One-line indicator, Claude Code style ("context left until auto-compact"). */
export function formatIndicatorLine(tokens: number, contextWindow: number, settings: AutoCompactSettings): string {
  const thresholds = resolveThresholds(contextWindow, settings);
  const pct = floorPercent(tokens, contextWindow);
  if (!thresholds) return `Context ${formatTokens(tokens)} tokens`;

  const used = `${pct}% used (${formatTokens(tokens)})`;
  if (!settings.enabled) {
    return `Context ${used} · auto-compact OFF`;
  }
  if (tokens >= thresholds.triggerTokens) {
    return `Auto-compact imminent — ${used} (trigger ${formatTokens(thresholds.triggerTokens)})`;
  }
  const left = thresholds.triggerTokens - tokens;
  const cap = thresholds.cappedByTokens ? " · token cap" : "";
  return `Context ${used} · ${formatTokens(left)} tokens left until auto-compact${cap}`;
}

export type CompactionReason = "manual" | "threshold" | "overflow";

/**
 * How the compaction was actually initiated.
 * Note: extension-triggered compaction goes through the session's manual path,
 * so `session_compact.reason` is "manual" for it. The extension must track
 * whether it auto-triggered and resolve the real source here.
 */
export type CompactionSource = "auto" | "manual" | "safety-net" | "overflow";

export function resolveCompactionSource(reason: CompactionReason, autoTriggered: boolean): CompactionSource {
  if (autoTriggered) return "auto";
  if (reason === "manual") return "manual";
  if (reason === "overflow") return "overflow";
  return "safety-net";
}

/** Post-compaction report line. */
export function formatCompactionReport(params: {
  tokensBefore: number;
  source: CompactionSource;
  estimatedTokensAfter?: number;
}): string {
  const { tokensBefore, source, estimatedTokensAfter } = params;
  const label = source === "overflow" ? "overflow recovery" : source;
  const sizes =
    typeof estimatedTokensAfter === "number" && estimatedTokensAfter > 0
      ? `${formatTokens(tokensBefore)} → ~${formatTokens(estimatedTokensAfter)} tokens`
      : `${formatTokens(tokensBefore)} tokens summarized`;
  return `Context compacted (${label}): ${sizes}`;
}

export type AutoCompactCommand =
  | { kind: "status" }
  | { kind: "on" }
  | { kind: "off" }
  | { kind: "trigger"; percent: number }
  | { kind: "triggerTokens"; tokens: number }
  | { kind: "warn"; percent: number }
  | { kind: "focus"; text?: string }
  | { kind: "native"; on: boolean }
  | { kind: "now"; instructions?: string }
  | { kind: "help" }
  | { kind: "error"; message: string };

export const AUTOCOMPACT_SUBCOMMANDS = ["status", "on", "off", "at", "warn", "focus", "native", "now", "help"] as const;

const AT_USAGE = `Usage: /autocompact at <${TRIGGER_MIN}-${TRIGGER_MAX}[%]> or <tokens, e.g. 200k | 250000 | 1m>`;

/** Parse the `at` argument: percent ("85", "85%") or tokens ("200k", "250000", "1m"). */
function parseTriggerValue(raw: string): AutoCompactCommand {
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([km%]?)$/i);
  if (!match) return { kind: "error", message: AT_USAGE };
  const value = Number.parseFloat(match[1]);
  const suffix = match[2].toLowerCase();
  if (suffix === "k") return { kind: "triggerTokens", tokens: Math.round(value * 1000) };
  if (suffix === "m") return { kind: "triggerTokens", tokens: Math.round(value * 1_000_000) };
  if (suffix === "%") return { kind: "trigger", percent: value };
  // Bare number: small values are percents, large values are tokens.
  return value <= 100 ? { kind: "trigger", percent: value } : { kind: "triggerTokens", tokens: Math.round(value) };
}

/** Parse `/autocompact` arguments. */
export function parseAutoCompactCommand(args: string): AutoCompactCommand {
  const trimmed = args.trim();
  if (trimmed.length === 0) return { kind: "status" };

  const [head, ...restParts] = trimmed.split(/\s+/);
  const rest = trimmed.slice(head.length).trim();

  switch (head.toLowerCase()) {
    case "status":
      return { kind: "status" };
    case "on":
      return { kind: "on" };
    case "off":
      return { kind: "off" };
    case "at": {
      if (restParts.length === 0) return { kind: "error", message: AT_USAGE };
      return parseTriggerValue(restParts[0]);
    }
    case "warn": {
      const percent = Number(restParts[0]);
      if (!Number.isFinite(percent)) {
        return { kind: "error", message: `Usage: /autocompact warn <${WARN_MIN}-${WARN_MAX}>` };
      }
      return { kind: "warn", percent };
    }
    case "focus":
      if (rest.length === 0 || rest.toLowerCase() === "clear") {
        return { kind: "focus", text: undefined };
      }
      return { kind: "focus", text: rest };
    case "native": {
      const v = (restParts[0] ?? "").toLowerCase();
      if (v === "on") return { kind: "native", on: true };
      if (v === "off") return { kind: "native", on: false };
      return { kind: "error", message: "Usage: /autocompact native on|off — align Pi's non-interrupting mid-run compaction" };
    }
    case "now":
      return { kind: "now", instructions: rest.length > 0 ? rest : undefined };
    case "help":
      return { kind: "help" };
    default:
      return { kind: "help" };
  }
}

export type ApplyCommandResult = {
  settings: AutoCompactSettings;
  changed: boolean;
  reply?: string;
  error?: string;
};

/** Apply a parsed settings-mutating command. Non-mutating commands pass through. */
export function applyAutoCompactCommand(settings: AutoCompactSettings, cmd: AutoCompactCommand): ApplyCommandResult {
  switch (cmd.kind) {
    case "on":
      return {
        settings: { ...settings, enabled: true },
        changed: !settings.enabled,
        reply: `Auto-compact ON — trigger ${describeTrigger(settings)}, warn ${settings.warnPercent}%`,
      };
    case "off":
      return {
        settings: { ...settings, enabled: false },
        changed: settings.enabled,
        reply: "Auto-compact OFF — Pi's built-in overflow safety net still applies",
      };
    case "trigger": {
      const percent = Math.round(cmd.percent);
      if (percent < TRIGGER_MIN || percent > TRIGGER_MAX) {
        return { settings, changed: false, error: `Trigger must be ${TRIGGER_MIN}-${TRIGGER_MAX}% (got ${cmd.percent})` };
      }
      const warnPercent = settings.warnPercent >= percent ? Math.max(WARN_MIN, percent - 5) : settings.warnPercent;
      const next: AutoCompactSettings = { ...settings, triggerPercent: percent, warnPercent };
      const hadCap = next.triggerTokens !== undefined;
      delete next.triggerTokens;
      return {
        settings: next,
        changed: true,
        reply: `Auto-compact trigger set to ${percent}% (warn ${warnPercent}%)${hadCap ? " — token cap cleared" : ""}`,
      };
    }
    case "triggerTokens": {
      const tokens = Math.round(cmd.tokens);
      if (tokens < TRIGGER_TOKENS_MIN || tokens > TRIGGER_TOKENS_MAX) {
        return {
          settings,
          changed: false,
          error: `Token trigger must be ${formatTokens(TRIGGER_TOKENS_MIN)}-${formatTokens(TRIGGER_TOKENS_MAX)} (got ${formatTokens(tokens)})`,
        };
      }
      return {
        settings: { ...settings, triggerTokens: tokens },
        changed: true,
        reply: `Auto-compact trigger set to ${formatTokens(tokens)} tokens (${settings.triggerPercent}% of window stays as backstop)`,
      };
    }
    case "warn": {
      const percent = Math.round(cmd.percent);
      if (percent < WARN_MIN || percent > WARN_MAX) {
        return { settings, changed: false, error: `Warn must be ${WARN_MIN}-${WARN_MAX} (got ${cmd.percent})` };
      }
      if (percent >= settings.triggerPercent) {
        return { settings, changed: false, error: `Warn must be below trigger (${settings.triggerPercent}%)` };
      }
      return {
        settings: { ...settings, warnPercent: percent },
        changed: true,
        reply: `Auto-compact warning set to ${percent}%`,
      };
    }
    case "focus": {
      const text = cmd.text?.trim();
      if (!text) {
        return { settings: { ...settings, focus: undefined }, changed: settings.focus !== undefined, reply: "Compaction focus cleared" };
      }
      return { settings: { ...settings, focus: text }, changed: true, reply: `Compaction focus set: ${text}` };
    }
    case "native": {
      const on = cmd.on;
      return {
        settings: { ...settings, syncNativeReserve: on },
        changed: (settings.syncNativeReserve !== false) !== on,
        reply: on
          ? "Mid-run sync ON — Pi's native compaction will align with your trigger (applies next session)"
          : "Mid-run sync OFF — Pi's native compaction keeps its own reserve",
      };
    }
    default:
      return { settings, changed: false };
  }
}

function describeTrigger(settings: AutoCompactSettings): string {
  return settings.triggerTokens !== undefined
    ? `min(${settings.triggerPercent}%, ${formatTokens(settings.triggerTokens)} tokens)`
    : `${settings.triggerPercent}%`;
}

/** Multi-line status text for `/autocompact status`. */
export function formatStatusText(params: {
  settings: AutoCompactSettings;
  tokens: number | null;
  contextWindow: number | null;
}): string {
  const { settings, tokens, contextWindow } = params;
  const lines: string[] = [];
  lines.push(
    `Auto-compact: ${settings.enabled ? "ON" : "OFF"} · trigger ${describeTrigger(settings)} · warn ${settings.warnPercent}%`,
  );

  const thresholds = contextWindow !== null ? resolveThresholds(contextWindow, settings) : undefined;
  if (tokens !== null && contextWindow !== null && thresholds) {
    const pct = Math.round((tokens / contextWindow) * 1000) / 10;
    const left = Math.max(0, thresholds.triggerTokens - tokens);
    lines.push(
      `Context: ${pct}% used (${formatTokens(tokens)} / ${formatTokens(contextWindow)}) · ` +
        `${formatTokens(left)} tokens left until auto-compact at ${formatTokens(thresholds.triggerTokens)}` +
        `${thresholds.cappedByTokens ? " (token cap)" : ""}`,
    );
  } else {
    lines.push("Context: unknown (no usage data yet)");
  }
  const reserve = computeNativeReserveTokens(contextWindow, settings);
  if (reserve !== undefined && contextWindow !== null) {
    lines.push(
      `Mid-run (Pi native): compacts ~${formatTokens(contextWindow - reserve)} · reserve ${formatTokens(reserve)} · non-interrupting`,
    );
  } else if (settings.syncNativeReserve === false) {
    lines.push("Mid-run (Pi native): sync OFF (long runs rely on Pi's default reserve)");
  }
  lines.push(`Focus: ${settings.focus ?? "none"}`);
  return lines.join("\n");
}

export const AUTOCOMPACT_HELP_TEXT = [
  "/autocompact — show status",
  "/autocompact on|off — toggle proactive auto-compaction",
  `/autocompact at <${TRIGGER_MIN}-${TRIGGER_MAX}[%]> — percent trigger (clears token cap)`,
  "/autocompact at <tokens: 200k | 250000 | 1m> — absolute token trigger (percent stays as backstop)",
  `/autocompact warn <${WARN_MIN}-${WARN_MAX}> — set warning percent`,
  "/autocompact focus <text>|clear — set/clear summary focus instructions",
  "/autocompact native on|off — align Pi's non-interrupting mid-run compaction with your trigger",
  "/autocompact now [instructions] — compact immediately",
].join("\n");
