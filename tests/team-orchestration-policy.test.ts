import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const text = (path: string) => readFileSync(resolve(root, path), "utf8");

const reusablePaths = [
  "lib/team-orchestration-protocol.ts",
  "lib/team-orchestration-pilot.ts",
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

test("batch and runtime require eligibility routing, exclusive writer leases, and one fix-worker round", () => {
  const batch = text("skills/batch-implementation/SKILL.md");
  const runtime = text("extensions/ticket-runner.ts");
  for (const [name, value] of [["batch", batch], ["runtime", runtime]] as const) {
    for (const required of ["eligibility", "writer lease", "exclusive", "fix-worker", "one bounded fix", "rework", "reviewers never", "batch_writer_lease"]) {
      assert.match(value, new RegExp(required, "i"), `${name}: ${required}`);
    }
  }
  assert.match(batch, /unknown\/mixed important reasoning fails closed/i);
  assert.match(batch, /second substantial fix/i);
  assert.match(batch, /self-asserted closed lease/i);
  assert.match(runtime, /Parent implementation after delegation must be explicit rework/i);
  assert.match(runtime, /self-asserted closed leases are rejected/i);
  assert.match(runtime, /action: StringEnum\(\["acquire", "close", "reconcile", "review_allowed"\]/i);
});

test("runtime and normative callers expose generic pilot evidence and role-specific rollback", () => {
  const policy = text("skills/engineering-workflow/references/delegation-policy.md");
  const batch = text("skills/batch-implementation/SKILL.md");
  const runtime = text("extensions/ticket-runner.ts");
  const readme = text("README.md");
  for (const [name, value] of [["policy", policy], ["batch", batch], ["runtime", runtime], ["readme", readme]] as const) {
    for (const required of ["pilot", "parent writer", "degrad", "evidence"]) assert.match(value, new RegExp(required, "i"), `${name}: ${required}`);
  }
  assert.match(policy, /production.*strictly lower/i);
  assert.match(policy, /arbitration.*production numerator/i);
  assert.match(batch, /Deterministic fixtures.*never promote/i);
  assert.match(runtime, /batch_worker_lane/i);
  assert.match(readme, /ten clean primary real assignments/i);
});

test("reusable T4 paths retain provider and model route portability", () => {
  for (const path of reusablePaths) {
    assert.doesNotMatch(text(path), /\b(?:llmgate|qwencloud|qwen3\.8-max-preview|\bxai\b)\b/i, path);
  }
});
