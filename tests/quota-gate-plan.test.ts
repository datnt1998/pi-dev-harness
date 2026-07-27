import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("quota snapshot plan defines the fail-closed launch-gate ticket", () => {
  const plan = readFileSync(resolve(root, "docs/plans/quota-snapshot-launch-gate.md"), "utf8");

  for (const required of [
    "Delete this plan",
    "machine-readable snapshot",
    "weekly reset epoch",
    "60 / 20 / 15 / 5",
    "five minutes",
    "10%",
    "provisional debit",
    "no second quota client",
    "T4",
    "synthetic fixtures",
    "npm test",
    "npm run pack:check",
  ]) assert.match(plan, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), required);

  assert.doesNotMatch(plan, /\b(?:opus|qwen|gpt|claude|anthropic|openai|alibaba)\b/i);
});
