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

test("delegation callers point to the normative policy instead of relying on inference", () => {
  for (const path of [
    "skills/engineering-workflow/SKILL.md",
    "skills/engineering-workflow/references/implementation-tdd.md",
    "skills/engineering-workflow/references/completion-evidence.md",
    "skills/engineering-workflow/references/code-review.md",
    "skills/batch-implementation/SKILL.md",
    "skills/pi-harness/references/engineering-workflow-integration.md",
  ]) assert.match(text(path), /delegation-policy\.md/, path);

  const callers = [
    text("skills/engineering-workflow/SKILL.md"),
    text("skills/batch-implementation/SKILL.md"),
    text("skills/pi-harness/references/engineering-workflow-integration.md"),
  ].join("\n");
  assert.doesNotMatch(callers, /omit `acceptance`|use package inference|normally forked/i);
});
