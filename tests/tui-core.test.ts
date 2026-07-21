import assert from "node:assert/strict";
import test from "node:test";
import {
  contextSeverity,
  formatContextLabel,
  formatCount,
  formatSessionCost,
  getFooterLayout,
  shortenPath,
  shouldRenderExtras,
} from "../lib/tui-core.ts";

test("footer layout degrades by width and gates extras", () => {
  assert.equal(getFooterLayout(140), "wide");
  assert.equal(getFooterLayout(100), "standard");
  assert.equal(getFooterLayout(72), "compact");
  assert.equal(getFooterLayout(40), "minimal");
  assert.equal(shouldRenderExtras(99), false);
  assert.equal(shouldRenderExtras(100), true);
});

test("shortenPath is home-relative and tail-preserving", () => {
  const home = "/Users/dat";
  assert.equal(shortenPath("/Users/dat/Projects/exp/app", home, 3), "…/Projects/exp/app");
  assert.equal(shortenPath("/Users/dat/Projects", home, 3), "~/Projects");
  assert.equal(shortenPath("/var/tmp/a/b/c/d", home, 2), "…/c/d");
  assert.equal(shortenPath("/Users/dat/Projects/exp/app", home, 1), "…/app");
  assert.equal(shortenPath("/Users/dat/Projects/exp/app", home, 0), "~/Projects/exp/app");
});

test("formatCount compacts thousands and millions", () => {
  assert.equal(formatCount(500), "500");
  assert.equal(formatCount(1234), "1.2k");
  assert.equal(formatCount(45000), "45k");
  assert.equal(formatCount(2_500_000), "2.5M");
});

test("formatContextLabel is null-safe", () => {
  assert.equal(formatContextLabel(12300, 200000, 6.1), "12.3k/200k 6.1%");
  assert.equal(formatContextLabel(null, 200000, null), "?/200k ?");
  assert.equal(formatContextLabel(1, null, 1), "ctx n/a");
});

test("formatSessionCost switches precision at $1", () => {
  assert.equal(formatSessionCost(0.1234), "$0.123");
  assert.equal(formatSessionCost(1.2345), "$1.23");
  assert.equal(formatSessionCost(Number.NaN), "$0.000");
});

test("contextSeverity buckets by percent", () => {
  assert.equal(contextSeverity(null), "ok");
  assert.equal(contextSeverity(50), "ok");
  assert.equal(contextSeverity(70), "warn");
  assert.equal(contextSeverity(89.9), "warn");
  assert.equal(contextSeverity(90), "critical");
});
