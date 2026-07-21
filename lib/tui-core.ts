/**
 * Pure, brandless TUI helpers for a responsive Pi footer.
 *
 * No Pi/pi-tui imports and no project identity live here so the logic is unit
 * testable and portable. Rendering (themes, ANSI width, session usage) stays in
 * the extension. Consumers layer their own branding/theme on top; this file only
 * decides layout tiers and formats neutral status strings.
 */

export type FooterLayout = "wide" | "standard" | "compact" | "minimal";

/** Width tiers, widest first. Critical status stays visible before extras. */
export function getFooterLayout(width: number): FooterLayout {
  if (width >= 140) return "wide";
  if (width >= 100) return "standard";
  if (width >= 72) return "compact";
  return "minimal";
}

/** Second-line extras (usage/quota) only when there is horizontal room. */
export function shouldRenderExtras(width: number): boolean {
  return width >= 100;
}

/**
 * Home-relative, tail-preserving path. Keeps the meaningful trailing segments
 * (project context) instead of collapsing to a bare basename, so path visibility
 * survives narrow widths (the renderer still truncates to fit). maxSegments<=0
 * returns the home-relative full path.
 */
export function shortenPath(cwd: string, home?: string, maxSegments = 3): string {
  let p = cwd;
  if (home && (p === home || p.startsWith(home + "/"))) {
    p = "~" + p.slice(home.length);
  }
  if (maxSegments <= 0) return p;
  const segments = p.split("/").filter((s) => s.length > 0);
  if (segments.length <= maxSegments) return p;
  return "…/" + segments.slice(-maxSegments).join("/");
}

/** Compact human count: 1234 -> "1.2k", 45000 -> "45k", 2_500_000 -> "2.5M". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "?";
  const abs = Math.abs(n);
  const trim = (s: string) => s.replace(/\.0$/, "");
  if (abs < 1000) return String(Math.round(n));
  if (abs < 1_000_000) {
    const v = n / 1000;
    return `${abs < 100_000 ? trim(v.toFixed(1)) : Math.round(v)}k`;
  }
  const v = n / 1_000_000;
  return `${abs < 10_000_000 ? trim(v.toFixed(1)) : Math.round(v)}M`;
}

/** "12.3k/200k 6.1%" — used tokens / window and percent, with null-safe fields. */
export function formatContextLabel(
  tokens: number | null,
  contextWindow: number | null,
  percent: number | null,
): string {
  if (contextWindow === null) return "ctx n/a";
  const used = tokens === null ? "?" : formatCount(tokens);
  const max = formatCount(contextWindow);
  const pct = percent === null ? "?" : `${percent.toFixed(1)}%`;
  return `${used}/${max} ${pct}`;
}

/** Session cost: "$0.123" under $1, "$1.23" at/above $1. */
export function formatSessionCost(cost: number): string {
  const c = Number.isFinite(cost) ? cost : 0;
  return `$${c.toFixed(c >= 1 ? 2 : 3)}`;
}

/**
 * Severity bucket for a context-usage percent, so the renderer can color it
 * without hardcoding thresholds: "ok" < 70 <= "warn" < 90 <= "critical".
 */
export function contextSeverity(percent: number | null): "ok" | "warn" | "critical" {
  if (percent === null) return "ok";
  if (percent >= 90) return "critical";
  if (percent >= 70) return "warn";
  return "ok";
}
