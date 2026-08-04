import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeBatch } from "../lib/ticket-readiness.ts";

const root = resolve(import.meta.dirname, "..");
const text = (path: string) => readFileSync(resolve(root, path), "utf8");

test("the documented to-tickets template passes the deterministic readiness gate", () => {
  const reference = text("skills/engineering-workflow/references/spec-and-tickets.md");
  assert.match(reference, /Dependencies:/);
  assert.match(reference, /Acceptance criteria:/);

  const documentedShape = `## T1 — Deliver one observable slice

Goal: Deliver the approved user-visible behavior.
Scope: The smallest end-to-end slice across affected modules.
Working directory: .
Dependencies: none
Acceptance criteria:
- The approved behavior is observable through the public seam.
Validation:
- npm test
Done when:
- All acceptance criteria pass and focused validation is green.
`;

  const analysis = analyzeBatch(documentedShape);
  assert.deepEqual(analysis.warnings, []);
  assert.equal(analysis.tickets.length, 1);
  assert.equal(analysis.tickets[0].status, "READY");
  assert.deepEqual(analysis.order, ["T1"]);
});

test("specific workflow on-ramps precede the generic grilling flow", () => {
  const skill = text("skills/engineering-workflow/SKILL.md");
  const router = skill.slice(skill.indexOf("## Phase Router"), skill.indexOf("## Pi Harness Boundary"));
  for (const specific of ["Bug, regression", "Huge, foggy", "Design uncertainty", "Interface or seam design", "Fuzzy/overloaded domain terms"]) {
    assert.ok(router.indexOf(specific) >= 0, specific);
    assert.ok(router.indexOf(specific) < router.indexOf("Ambiguous goal"), specific);
  }
});

test("grilling separates facts from decisions and waits for confirmation", () => {
  const grill = `${text("skills/engineering-workflow/references/grill-with-docs.md")}\n${text("prompts/grill-with-docs.md")}`;
  assert.match(grill, /one decision at a time/i);
  assert.match(grill, /look up .*facts|facts.*look up/i);
  assert.match(grill, /unresolved .*decision.*user|put .*decision.*user/i);
  assert.match(grill, /confirm shared understanding/i);
});

test("prototype capture preserves explicit commit permission", () => {
  const prototype = text("skills/prototype/SKILL.md");
  assert.match(prototype, /explicit permission/i);
  assert.doesNotMatch(prototype, /capture the prototype itself[\s\S]{0,120}: commit it/i);
});

test("artifact hygiene preserves scoped authority instead of rewriting specs to match code", () => {
  const hygiene = `${text("skills/repo-hygiene/SKILL.md")}\n${text("skills/engineering-workflow/references/artifact-lifecycle.md")}`;
  assert.match(hygiene, /approved spec|acceptance contract/i);
  assert.match(hygiene, /intended behavior/i);
  assert.match(hygiene, /code and tests.*current observable implementation|current observable implementation/i);
  assert.match(hygiene, /not permission to rewrite the spec|do not rewrite the spec/i);
});

test("Pi skill-writing guidance documents non-recursive hidden-skill activation", () => {
  const guide = text("skills/pi-harness/references/skill-writing-guide.md");
  assert.match(guide, /disable-model-invocation: true/);
  assert.match(guide, /does not recursively load a hidden skill/i);
  assert.match(guide, /one trigger per branch/i);
  assert.match(guide, /positive steering/i);
  assert.match(guide, /negative-space audit/i);
});

test("to-spec stays synthesis-only and tickets include the wide-refactor branch", () => {
  const spec = `${text("prompts/to-spec.md")}\n${text("skills/engineering-workflow/references/spec-and-tickets.md")}`;
  assert.match(spec, /Do not restart the requirements interview/i);
  assert.match(spec, /Open Questions/i);
  assert.match(spec, /wide refactor/i);
  assert.match(spec, /expand-contract/i);
});

test("diagnosis stops for a missing red-capable loop", () => {
  const diagnose = text("prompts/diagnose.md");
  assert.match(diagnose, /tight, red-capable/i);
  assert.match(diagnose, /stop with what was tried/i);
  assert.match(diagnose, /access, captured artifact, or temporary instrumentation/i);
});

test("wayfinder claims AFK research decision tickets before launch", () => {
  const wayfinder = `${text("skills/wayfinder/SKILL.md")}\n${text("prompts/wayfinder.md")}`;
  assert.match(wayfinder, /decision tickets/i);
  assert.match(wayfinder, /Claim each newly created `research` ticket/i);
  assert.match(wayfinder, /Claim newly created AFK research tickets before launching/i);
  assert.doesNotMatch(wayfinder, /one patch may graduate/i);
});

test("prototype subordinate references preserve the commit permission gate", () => {
  const prototype = `${text("skills/prototype/SKILL.md")}\n${text("skills/prototype/UI.md")}\n${text("skills/prototype/LOGIC.md")}`;
  assert.match(prototype, /explicit permission|explicitly approves/i);
  assert.doesNotMatch(prototype, /lands on the throwaway branch/i);
  assert.doesNotMatch(prototype, /rides along to the throwaway branch/i);
});

test("code review fail-fast exits on an empty requested diff", () => {
  const review = text("skills/engineering-workflow/references/code-review.md");
  assert.match(review, /if git diff --quiet/);
  assert.match(review, /empty diff[\s\S]{0,60}exit 1/i);
  assert.match(review, /Mysterious Name[\s\S]*Duplicated Code[\s\S]*Refused Bequest/);
});

test("frontend polish follows repository size policy and valid commit types", () => {
  const polish = text("prompts/fe-polish.md");
  assert.match(polish, /repository's file\/module size conventions/i);
  assert.match(polish, /`style`, `perf`, `fix`, or `refactor`/);
  assert.doesNotMatch(polish, /files ≤200 lines|polish\(scope\)/i);
});
