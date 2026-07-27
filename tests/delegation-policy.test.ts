import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const text = (path: string) => readFileSync(resolve(root, path), "utf8");

test("delegation policy preserves the complete normative decision surface", () => {
  const policy = text("skills/engineering-workflow/references/delegation-policy.md");

  for (const required of [
    "C1 — Record exists",
    "C7 — Verify one load-bearing claim",
    "Independence gate",
    "Signed-thinking gate",
    "Transcript-tax gate",
    "implementation worker | 400–900",
    "Reviewer verdict",
    "pi-harness-attribution:v1",
    "source + ticket",
    "producer→consumer",
    "sealed reader",
    "mutation-capable",
    "V0",
    "V3",
    "60%",
    "20%",
    "15%",
    "5%",
    "T1",
    "T5",
    "10 worker delegations",
  ]) assert.match(policy, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), required);
});

test("delegation policy uses portable model-tier archetypes rather than vendor routing", () => {
  const policy = text("skills/engineering-workflow/references/delegation-policy.md");

  for (const tier of ["scarce-premium", "metered-mid", "flat-fee"]) {
    assert.match(policy, new RegExp(tier, "i"), tier);
  }
  assert.doesNotMatch(policy, /\b(?:opus|qwen|gpt|claude|anthropic|openai|alibaba)\b/i);
});
