import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPercent,
  formatDurationCompact,
  formatUsageLine,
  parseClaudeUsage,
  parseCodexUsage,
  providerLabel,
  renderBar,
  resolveSecondaryWindowLabel,
  usageSeverity,
} from "../lib/provider-usage-core.ts";

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

test("formatUsageLine renders plain, theme-free quota line", () => {
  const state = { provider: "anthropic", windows: [{ label: "5h", usedPercent: 24, resetAt: 60_000 }, { label: "Week", usedPercent: 12 }], updatedAt: 0 };
  const line = formatUsageLine(state, { barWidth: 10, showReset: true, now: 0 });
  assert.match(line, /^Claude {2}5h \[.+\] 76% left · reset 1m │ Week \[.+\] 88% left$/);
  assert.equal(formatUsageLine(undefined), "Usage quota n/a");
  assert.equal(formatUsageLine({ provider: "anthropic", windows: [], updatedAt: 0, error: "HTTP 401" }), "Claude quota: HTTP 401");
  assert.equal(providerLabel("openai-codex"), "Codex");
});
