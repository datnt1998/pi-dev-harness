import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPercent,
  formatDurationCompact,
  formatUsageLine,
  formatUsageThemed,
  parseClaudeUsage,
  parseCodexUsage,
  providerLabel,
  renderBar,
  renderBarThemed,
  resolveSecondaryWindowLabel,
  usageRole,
  usageSeverity,
  toUsageQuotaInput,
  formatQuotaSnapshotThemed,
} from "../lib/provider-usage-core.ts";
import { buildPremiumQuotaSnapshot, createQuotaLedger } from "../lib/quota-gate-core.ts";

test("clampPercent bounds and null-guards", () => {
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(140), 100);
  assert.equal(clampPercent(42), 42);
  assert.equal(clampPercent(Number.NaN), 0);
});

test("formatDurationCompact scales minutes/hours/days", () => {
  assert.equal(formatDurationCompact(3 * 60_000), "3m");
  assert.equal(formatDurationCompact((2 * 60 + 5) * 60_000), "2h5m");
  assert.equal(formatDurationCompact(3 * 60 * 60_000), "3h");
  assert.equal(formatDurationCompact((6 * 24 + 9) * 60 * 60_000), "6d9h");
});

test("parseClaudeUsage extracts 5h/Week/model windows", () => {
  const s = parseClaudeUsage(
    { plan_type: "max", five_hour: { utilization: 24, resets_at: "2026-01-01T00:00:00Z" }, seven_day: { utilization: 12 }, seven_day_sonnet: { utilization: 30 } },
    1000,
  );
  assert.equal(s.provider, "anthropic");
  assert.equal(s.plan, "max");
  assert.deepEqual(s.windows.map((w) => w.label), ["5h", "Week", "Sonnet"]);
  assert.equal(s.windows[0].usedPercent, 24);
  assert.ok(s.windows[0].resetAt && s.windows[0].resetAt > 0);
});

test("parseCodexUsage extracts windows, credits, and weekly label", () => {
  const s = parseCodexUsage(
    { plan_type: "pro", credits: { balance: 4.5 }, rate_limit: { primary_window: { limit_window_seconds: 10800, used_percent: 20, reset_at: 100 }, secondary_window: { limit_window_seconds: 604800, used_percent: 8, reset_at: 200 } } },
    1000,
  );
  assert.equal(s.provider, "openai-codex");
  assert.equal(s.plan, "pro ($4.50)");
  assert.deepEqual(s.windows.map((w) => w.label), ["3h", "Week"]);
});

test("resolveSecondaryWindowLabel picks Week vs Day", () => {
  assert.equal(resolveSecondaryWindowLabel({ windowHours: 168 }), "Week");
  assert.equal(resolveSecondaryWindowLabel({ windowHours: 5 }), "5h");
  assert.equal(resolveSecondaryWindowLabel({ windowHours: 24, primaryResetAt: 0, secondaryResetAt: 0 }), "Day");
});

test("usageSeverity buckets remaining percent", () => {
  assert.equal(usageSeverity(80), "ok");
  assert.equal(usageSeverity(25), "low");
  assert.equal(usageSeverity(10), "critical");
});

test("renderBar fills proportionally", () => {
  assert.equal(renderBar(100, 10), "[██████████]");
  assert.equal(renderBar(0, 10), "[░░░░░░░░░░]");
  assert.equal(renderBar(50, 10), "[█████░░░░░]");
});

test("parseRetryAfter accepts delta-seconds, HTTP-date, and rejects junk", async () => {
  const { parseRetryAfter } = await import("../lib/provider-usage-fetch.ts");
  assert.equal(parseRetryAfter("120"), 120_000);
  assert.equal(parseRetryAfter(null), undefined);
  assert.equal(parseRetryAfter("not-a-date"), undefined);
  assert.equal(parseRetryAfter(new Date(5_000).toUTCString(), 0), 5_000);
});

test("usageRole maps remaining percent to theme roles", () => {
  assert.equal(usageRole(80), "success");
  assert.equal(usageRole(40), "muted");
  assert.equal(usageRole(20), "warning");
  assert.equal(usageRole(5), "error");
});

test("themed formatters route text through the injected fg and stay content-stable", () => {
  const fg = (role: string, text: string) => `<${role}>${text}`;
  assert.equal(renderBarThemed(fg, 100, 4), "<dim>[<success>████<dim><dim>]");
  const state = { provider: "anthropic", windows: [{ label: "5h", usedPercent: 24, resetAt: 60_000 }], updatedAt: 0 };
  const line = formatUsageThemed(fg, state, { barWidth: 4, showReset: true, now: 0 });
  assert.match(line, /<accent>Claude/);
  assert.match(line, /<dim>5h/);
  assert.match(line, /76% left/);
  assert.match(line, /reset 1m/);
  // identity fg reproduces the plain content without styling markers
  const plainish = formatUsageThemed((_r, t) => t, state, { barWidth: 4, showReset: true, now: 0 });
  assert.match(plainish, /^Claude {2}5h \[.+\] 76% left · reset 1m$/);
});

test("provider parsers expose semantic windows and preserve absent values", () => {
  const claude = parseClaudeUsage({
    five_hour: { utilization: 20, resets_at: "2026-02-01T15:00:00Z" },
    seven_day: { utilization: 10, resets_at: "2026-02-08T00:00:00Z" },
    seven_day_sonnet: { utilization: 30, resets_at: "2026-02-08T00:00:00Z" },
  }, 1_000);
  assert.deepEqual(claude.windows.map((window) => window.kind), ["short", "weekly", "premium-weekly"]);
  const normalized = toUsageQuotaInput(claude);
  assert.equal(normalized.shortWindow?.remainingPercent, 80);
  assert.equal(normalized.weekly?.remainingPercent, 90);
  assert.equal(normalized.premiumSpecificWeekly?.remainingPercent, 70);
  assert.equal(normalized.premiumSpecificWeekly?.resetAt, "2026-02-08T00:00:00.000Z");
  assert.equal(normalized.allowSingleWeeklyWindow, false);

  const codex = toUsageQuotaInput(parseCodexUsage({
    rate_limit: {
      primary_window: { limit_window_seconds: 10_800, used_percent: 0, reset_at: 100 },
      secondary_window: { limit_window_seconds: 604_800, reset_at: 200 },
    },
  }, 1_000));
  assert.equal(codex.shortWindow?.usedPercent, 0);
  assert.equal(codex.weekly?.usedPercent, null, "absent is not coerced to zero");
  assert.equal(codex.weekly?.remainingPercent, null);
  assert.equal(codex.allowSingleWeeklyWindow, true);
});

test("quota UI formats freshness, band, balances, and gate reason from the shared snapshot", () => {
  const input = toUsageQuotaInput(parseCodexUsage({ rate_limit: {
    primary_window: { limit_window_seconds: 10_800, used_percent: 20, reset_at: 1_800_000_000 },
    secondary_window: { limit_window_seconds: 604_800, used_percent: 30, reset_at: 1_800_604_800 },
  } }, 1_700_000_000_000));
  const ledger = createQuotaLedger(new Date(1_800_604_800_000).toISOString(), 70);
  const snapshot = buildPremiumQuotaSnapshot(input, ledger, 1_700_000_060_000);
  const line = formatQuotaSnapshotThemed((_role, text) => text, snapshot, { barWidth: 4 });
  assert.match(line, /fresh 1m/i);
  assert.match(line, /healthy/i);
  assert.match(line, /main 50%/i);
  assert.match(line, /gate ready/i);
});

test("formatUsageLine renders plain, theme-free quota line", () => {
  const state = { provider: "anthropic", windows: [{ label: "5h", usedPercent: 24, resetAt: 60_000 }, { label: "Week", usedPercent: 12 }], updatedAt: 0 };
  const line = formatUsageLine(state, { barWidth: 10, showReset: true, now: 0 });
  assert.match(line, /^Claude {2}5h \[.+\] 76% left · reset 1m │ Week \[.+\] 88% left$/);
  assert.equal(formatUsageLine(undefined), "Usage quota n/a");
  assert.equal(formatUsageLine({ provider: "anthropic", windows: [], updatedAt: 0, error: "HTTP 401" }), "Claude quota: HTTP 401");
  assert.equal(providerLabel("openai-codex"), "Codex");
});
