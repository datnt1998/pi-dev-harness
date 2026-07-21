import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAutoCompactCommand,
  DEFAULT_AUTOCOMPACT_SETTINGS,
  evaluateAutoCompact,
  formatCompactionReport,
  formatIndicatorLine,
  formatStatusText,
  formatTokens,
  normalizeAutoCompactSettings,
  parseAutoCompactCommand,
  resolveCompactionSource,
  resolveThresholds,
  resolveTier,
  shouldShowIndicator,
} from "../lib/autocompact-core.ts";

const WINDOW_200K = 200_000;
const WINDOW_1M = 1_000_000;

test("normalize falls back to defaults on garbage input", () => {
  assert.deepEqual(normalizeAutoCompactSettings(undefined), DEFAULT_AUTOCOMPACT_SETTINGS);
  assert.deepEqual(normalizeAutoCompactSettings("nope"), DEFAULT_AUTOCOMPACT_SETTINGS);
  assert.deepEqual(normalizeAutoCompactSettings({ triggerPercent: "x", warnPercent: NaN }), DEFAULT_AUTOCOMPACT_SETTINGS);
});

test("normalize clamps percents and keeps warn below trigger", () => {
  const clamped = normalizeAutoCompactSettings({ triggerPercent: 99, warnPercent: 5 });
  assert.equal(clamped.triggerPercent, 95);
  assert.equal(clamped.warnPercent, 30);

  const inverted = normalizeAutoCompactSettings({ triggerPercent: 60, warnPercent: 80 });
  assert.equal(inverted.triggerPercent, 60);
  assert.equal(inverted.warnPercent, 55);

  const focus = normalizeAutoCompactSettings({ focus: "  keep file list  " });
  assert.equal(focus.focus, "keep file list");
  assert.equal(normalizeAutoCompactSettings({ focus: "   " }).focus, undefined);
});

test("normalize clamps token cap and drops invalid values", () => {
  assert.equal(normalizeAutoCompactSettings({ triggerTokens: 200_000 }).triggerTokens, 200_000);
  assert.equal(normalizeAutoCompactSettings({ triggerTokens: 1000 }).triggerTokens, 30_000);
  assert.equal(normalizeAutoCompactSettings({ triggerTokens: 99_000_000 }).triggerTokens, 2_000_000);
  assert.equal(normalizeAutoCompactSettings({ triggerTokens: "many" }).triggerTokens, undefined);
  assert.equal(normalizeAutoCompactSettings({ triggerTokens: -5 }).triggerTokens, undefined);
});

test("thresholds without a cap follow the percent ladder", () => {
  const thresholds = resolveThresholds(WINDOW_200K, DEFAULT_AUTOCOMPACT_SETTINGS);
  assert.ok(thresholds);
  assert.equal(thresholds.triggerTokens, 180_000); // 90%
  assert.equal(thresholds.warnTokens, 150_000); // 75/90 of trigger = 75%
  assert.equal(thresholds.showTokens, 120_000); // (75-15)/90 of trigger = 60%
  assert.equal(thresholds.cappedByTokens, false);
});

test("token cap dominates on large windows and scales the ladder", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS, triggerTokens: 200_000 };
  const thresholds = resolveThresholds(WINDOW_1M, settings);
  assert.ok(thresholds);
  assert.equal(thresholds.triggerTokens, 200_000); // cap, not 900k
  assert.equal(thresholds.cappedByTokens, true);
  assert.equal(thresholds.warnTokens, Math.round(200_000 * (75 / 90)));
  assert.equal(thresholds.showTokens, Math.round(200_000 * (60 / 90)));
});

test("percent stays as backstop when the window is smaller than the cap", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS, triggerTokens: 500_000 };
  const thresholds = resolveThresholds(WINDOW_200K, settings);
  assert.ok(thresholds);
  assert.equal(thresholds.triggerTokens, 180_000); // 90% of 200k wins
  assert.equal(thresholds.cappedByTokens, false);
  assert.equal(resolveThresholds(0, settings), undefined);
});

test("resolveTier respects token boundaries", () => {
  const thresholds = resolveThresholds(WINDOW_200K, DEFAULT_AUTOCOMPACT_SETTINGS)!;
  assert.equal(resolveTier(20_000, thresholds), "none");
  assert.equal(resolveTier(149_999, thresholds), "none");
  assert.equal(resolveTier(150_000, thresholds), "warn");
  assert.equal(resolveTier(179_999, thresholds), "warn");
  assert.equal(resolveTier(180_000, thresholds), "critical");
});

test("warning fires once per tier and escalates", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS };

  const first = evaluateAutoCompact({
    tokens: 156_000, // 78%
    contextWindow: WINDOW_200K,
    settings,
    lastTier: "none",
    canCompact: false,
  });
  assert.equal(first.decision.action, "notify");
  assert.equal(first.nextTier, "warn");

  const repeat = evaluateAutoCompact({
    tokens: 160_000,
    contextWindow: WINDOW_200K,
    settings,
    lastTier: first.nextTier,
    canCompact: false,
  });
  assert.equal(repeat.decision.action, "none");

  const escalated = evaluateAutoCompact({
    tokens: 182_000, // 91%
    contextWindow: WINDOW_200K,
    settings,
    lastTier: repeat.nextTier,
    canCompact: false,
  });
  assert.equal(escalated.decision.action, "notify");
  assert.equal(escalated.nextTier, "critical");
  assert.match((escalated.decision as { message: string }).message, /queued/);
});

test("critical tier compacts when enabled and safe", () => {
  const result = evaluateAutoCompact({
    tokens: 184_000,
    contextWindow: WINDOW_200K,
    settings: { ...DEFAULT_AUTOCOMPACT_SETTINGS },
    lastTier: "critical",
    canCompact: true,
  });
  assert.equal(result.decision.action, "compact");
});

test("token cap compacts a 1M-window model at low window percent", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS, triggerTokens: 200_000 };
  const result = evaluateAutoCompact({
    tokens: 210_000, // only 21% of the 1M window
    contextWindow: WINDOW_1M,
    settings,
    lastTier: "critical",
    canCompact: true,
  });
  assert.equal(result.decision.action, "compact");
  assert.match((result.decision as { message: string }).message, /210k tokens.*200k tokens \(token cap\)/);

  const below = evaluateAutoCompact({
    tokens: 120_000,
    contextWindow: WINDOW_1M,
    settings,
    lastTier: "none",
    canCompact: true,
  });
  assert.equal(below.decision.action, "none", "12% of 1M with 200k cap is below the scaled warn tier");
});

test("disabled autocompact never compacts, warns with /compact hint", () => {
  const result = evaluateAutoCompact({
    tokens: 190_000,
    contextWindow: WINDOW_200K,
    settings: { ...DEFAULT_AUTOCOMPACT_SETTINGS, enabled: false },
    lastTier: "warn",
    canCompact: true,
  });
  assert.equal(result.decision.action, "notify");
  assert.equal((result.decision as { severity: string }).severity, "error");
  assert.match((result.decision as { message: string }).message, /\/compact/);
});

test("unknown tokens reset tier so warnings re-arm after compaction", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS };
  const reset = evaluateAutoCompact({
    tokens: null,
    contextWindow: WINDOW_200K,
    settings,
    lastTier: "critical",
    canCompact: true,
  });
  assert.equal(reset.decision.action, "none");
  assert.equal(reset.nextTier, "none");

  const rearmed = evaluateAutoCompact({
    tokens: 152_000,
    contextWindow: WINDOW_200K,
    settings,
    lastTier: reset.nextTier,
    canCompact: false,
  });
  assert.equal(rearmed.decision.action, "notify");
});

test("indicator visibility starts before the warn tier", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS }; // show from 60% on 200k = 120k
  assert.equal(shouldShowIndicator(null, WINDOW_200K, settings), false);
  assert.equal(shouldShowIndicator(119_000, WINDOW_200K, settings), false);
  assert.equal(shouldShowIndicator(120_000, WINDOW_200K, settings), true);
  assert.equal(shouldShowIndicator(120_000, null, settings), false);
});

test("indicator line shows tokens left until auto-compact", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS };
  const line = formatIndicatorLine(156_000, WINDOW_200K, settings);
  assert.match(line, /78% used \(156k\)/);
  assert.match(line, /24k tokens left until auto-compact/);
  assert.match(formatIndicatorLine(182_000, WINDOW_200K, settings), /imminent/);
  assert.match(formatIndicatorLine(140_000, WINDOW_200K, { ...settings, enabled: false }), /OFF/);

  const capped = formatIndicatorLine(180_000, WINDOW_1M, { ...settings, triggerTokens: 200_000 });
  assert.match(capped, /18% used \(180k\)/);
  assert.match(capped, /20k tokens left until auto-compact · token cap/);
});

test("displayed percent never rounds past a tier boundary", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS }; // trigger 90
  // 89.6% (179,200 tokens) is still below the trigger; display must not claim "90% used".
  assert.match(formatIndicatorLine(179_200, WINDOW_200K, settings), /89% used/);
  const evaluated = evaluateAutoCompact({
    tokens: 179_200,
    contextWindow: WINDOW_200K,
    settings,
    lastTier: "none",
    canCompact: true,
  });
  assert.equal(evaluated.decision.action, "notify");
  assert.match((evaluated.decision as { message: string }).message, /89%/);
});

test("formatTokens is compact and stable", () => {
  assert.equal(formatTokens(950), "950");
  assert.equal(formatTokens(24_900), "24.9k");
  assert.equal(formatTokens(200_000), "200k");
  assert.equal(formatTokens(1_250_000), "1.25M");
  assert.equal(formatTokens(-1), "?");
});

test("compaction source resolution distinguishes auto from manual", () => {
  // Extension-triggered compaction goes through the manual session path,
  // so reason is "manual" — the autoTriggered flag must win.
  assert.equal(resolveCompactionSource("manual", true), "auto");
  assert.equal(resolveCompactionSource("manual", false), "manual");
  assert.equal(resolveCompactionSource("threshold", false), "safety-net");
  assert.equal(resolveCompactionSource("overflow", false), "overflow");
});

test("compaction report labels sources", () => {
  assert.match(
    formatCompactionReport({ tokensBefore: 145_200, source: "auto" }),
    /auto.*145\.2k tokens summarized/,
  );
  assert.match(formatCompactionReport({ tokensBefore: 145_200, source: "safety-net" }), /safety-net/);
  assert.match(formatCompactionReport({ tokensBefore: 145_200, source: "overflow" }), /overflow recovery/);
  assert.match(
    formatCompactionReport({ tokensBefore: 145_200, source: "manual", estimatedTokensAfter: 24_900 }),
    /manual.*145\.2k → ~24\.9k tokens/,
  );
});

test("command parsing covers all subcommands", () => {
  assert.deepEqual(parseAutoCompactCommand(""), { kind: "status" });
  assert.deepEqual(parseAutoCompactCommand("  status "), { kind: "status" });
  assert.deepEqual(parseAutoCompactCommand("on"), { kind: "on" });
  assert.deepEqual(parseAutoCompactCommand("off"), { kind: "off" });
  assert.deepEqual(parseAutoCompactCommand("warn 70"), { kind: "warn", percent: 70 });
  assert.deepEqual(parseAutoCompactCommand("focus keep the ticket list"), { kind: "focus", text: "keep the ticket list" });
  assert.deepEqual(parseAutoCompactCommand("focus clear"), { kind: "focus", text: undefined });
  assert.deepEqual(parseAutoCompactCommand("focus"), { kind: "focus", text: undefined });
  assert.deepEqual(parseAutoCompactCommand("now"), { kind: "now", instructions: undefined });
  assert.deepEqual(parseAutoCompactCommand("now focus on open bugs"), { kind: "now", instructions: "focus on open bugs" });
  assert.equal(parseAutoCompactCommand("bogus").kind, "help");
});

test("`at` accepts percent or token forms", () => {
  assert.deepEqual(parseAutoCompactCommand("at 85"), { kind: "trigger", percent: 85 });
  assert.deepEqual(parseAutoCompactCommand("at 85%"), { kind: "trigger", percent: 85 });
  assert.deepEqual(parseAutoCompactCommand("at 200k"), { kind: "triggerTokens", tokens: 200_000 });
  assert.deepEqual(parseAutoCompactCommand("at 200K"), { kind: "triggerTokens", tokens: 200_000 });
  assert.deepEqual(parseAutoCompactCommand("at 250000"), { kind: "triggerTokens", tokens: 250_000 });
  assert.deepEqual(parseAutoCompactCommand("at 1m"), { kind: "triggerTokens", tokens: 1_000_000 });
  assert.deepEqual(parseAutoCompactCommand("at 0.5m"), { kind: "triggerTokens", tokens: 500_000 });
  assert.equal(parseAutoCompactCommand("at").kind, "error");
  assert.equal(parseAutoCompactCommand("at nope").kind, "error");
});

test("applying commands validates ranges and keeps warn below trigger", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS };

  const off = applyAutoCompactCommand(settings, { kind: "off" });
  assert.equal(off.settings.enabled, false);
  assert.equal(off.changed, true);

  const badTrigger = applyAutoCompactCommand(settings, { kind: "trigger", percent: 40 });
  assert.ok(badTrigger.error);
  assert.equal(badTrigger.settings, settings);

  const lowTrigger = applyAutoCompactCommand(settings, { kind: "trigger", percent: 70 });
  assert.equal(lowTrigger.settings.triggerPercent, 70);
  assert.equal(lowTrigger.settings.warnPercent, 65, "warn auto-lowered below new trigger");

  const badWarn = applyAutoCompactCommand(settings, { kind: "warn", percent: 95 });
  assert.ok(badWarn.error);
  const warnAboveTrigger = applyAutoCompactCommand(settings, { kind: "warn", percent: 90 });
  assert.ok(warnAboveTrigger.error);

  const focus = applyAutoCompactCommand(settings, { kind: "focus", text: "track open tickets" });
  assert.equal(focus.settings.focus, "track open tickets");
  const cleared = applyAutoCompactCommand(focus.settings, { kind: "focus", text: undefined });
  assert.equal(cleared.settings.focus, undefined);
  assert.equal(cleared.changed, true);
});

test("token trigger is validated and percent trigger clears the cap", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS };

  const tooSmall = applyAutoCompactCommand(settings, { kind: "triggerTokens", tokens: 10_000 });
  assert.ok(tooSmall.error);

  const capped = applyAutoCompactCommand(settings, { kind: "triggerTokens", tokens: 200_000 });
  assert.equal(capped.settings.triggerTokens, 200_000);
  assert.match(capped.reply!, /200k tokens.*backstop/);

  const backToPercent = applyAutoCompactCommand(capped.settings, { kind: "trigger", percent: 85 });
  assert.equal(backToPercent.settings.triggerTokens, undefined, "percent trigger clears the token cap");
  assert.match(backToPercent.reply!, /token cap cleared/);
});

test("status text reports usage, thresholds, or unknown state", () => {
  const settings = { ...DEFAULT_AUTOCOMPACT_SETTINGS, focus: "tickets" };
  const known = formatStatusText({ settings, tokens: 90_600, contextWindow: WINDOW_200K });
  assert.match(known, /ON · trigger 90% · warn 75%/);
  assert.match(known, /45\.3% used \(90\.6k \/ 200k\)/);
  assert.match(known, /89\.4k tokens left until auto-compact at 180k/);
  assert.match(known, /Focus: tickets/);

  const capped = formatStatusText({
    settings: { ...settings, triggerTokens: 200_000 },
    tokens: 150_000,
    contextWindow: WINDOW_1M,
  });
  assert.match(capped, /trigger min\(90%, 200k tokens\)/);
  assert.match(capped, /50k tokens left until auto-compact at 200k \(token cap\)/);

  const unknown = formatStatusText({ settings, tokens: null, contextWindow: null });
  assert.match(unknown, /Context: unknown/);
});
