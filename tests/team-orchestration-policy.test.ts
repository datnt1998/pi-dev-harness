import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const text = (path: string) => readFileSync(resolve(root, path), "utf8");

const reusablePaths = [
  "lib/team-orchestration-protocol.ts",
  "extensions/ticket-runner.ts",
  "skills/batch-implementation/SKILL.md",
  "skills/engineering-workflow/references/code-review.md",
  "skills/engineering-workflow/references/delegation-policy.md",
];

test("runtime and normative callers require the stable sealed two-axis completion flow", () => {
  const policy = text("skills/engineering-workflow/references/delegation-policy.md");
  const review = text("skills/engineering-workflow/references/code-review.md");
  const batch = text("skills/batch-implementation/SKILL.md");
  const runtime = text("extensions/ticket-runner.ts");

  for (const [name, value] of [["policy", policy], ["review", review], ["batch", batch], ["runtime", runtime]] as const) {
    for (const required of ["stable", "Standards", "Spec", "fresh", "sealed", "fingerprint", "fallback", "effective-model", "effective-thinking", "before", "degraded", "acknowledg"]) {
      assert.match(value, new RegExp(required, "i"), `${name}: ${required}`);
    }
  }
  assert.match(policy, /Workers and reviewers report observations/i);
  assert.match(policy, /parent alone.*disposes/i);
  assert.match(review, /combined.*fails closed/i);
  assert.match(batch, /do \*\*not\*\* substitute it/i);
  assert.match(runtime, /actual provider\/model/i);
});

test("reusable T4 paths retain provider and model route portability", () => {
  for (const path of reusablePaths) {
    assert.doesNotMatch(text(path), /\b(?:llmgate|qwencloud|qwen3\.8-max-preview|\bxai\b)\b/i, path);
  }
});
