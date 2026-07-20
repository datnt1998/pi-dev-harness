import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const text = (path: string) => readFileSync(resolve(root, path), "utf8");

test("new-project setup covers ecosystem, monorepo, review, scratch, and release boundaries", () => {
  const setup = text("templates/PROJECT_SETUP.md");
  for (const required of [
    "Workspace/package roots",
    "Working directory",
    "configured upstream/default branch",
    ".scratch/",
    "Version source(s)",
    "Exact production/deploy trigger",
    "Rollback and smoke procedure",
    "existing repository",
    "Do not overwrite an existing",
  ]) assert.match(setup, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), required);
});

test("brownfield legacy-refactor guidance characterizes before changing untested code", () => {
  const ref = text("skills/engineering-workflow/references/legacy-refactor.md");
  const skill = text("skills/engineering-workflow/SKILL.md");
  assert.match(ref, /characteriz/i);
  assert.match(ref, /pin the current behavior first/i);
  assert.match(ref, /refactor under green/i);
  assert.match(ref, /change behavior\s+last/i);
  // wired into the Implement phase and integration references
  assert.match(skill, /legacy-refactor\.md/);
});

test("generic release flow does not impose npm or a project-specific releases module", () => {
  const release = `${text("skills/release-versioning/SKILL.md")}\n${text("prompts/release.md")}`;
  assert.doesNotMatch(release, /npm run (?:test|build)/i);
  assert.doesNotMatch(release, /src\/lib\/releases|APP_VERSION|prepend(?:ed)? to RELEASES/i);
  assert.match(release, /do not assume npm/i);
  assert.match(release, /exact deploy trigger/i);
});

test("repo-hygiene enforces lifecycle classification, drift sweep, and safe deletion", () => {
  const skill = text("skills/repo-hygiene/SKILL.md");
  const prompt = text("prompts/tidy-docs.md");
  assert.match(skill, /single source of truth/i);
  assert.match(skill, /create-time gate/i);
  assert.match(skill, /keep\b.*reconcile.*delete|keep\s*\/\s*reconcile\s*\/\s*delete/i);
  assert.match(skill, /not git-recoverable/i);
  assert.match(skill, /fresh-context reviewers/i);
  assert.match(prompt, /skill:repo-hygiene/);
  assert.match(prompt, /keep .* reconcile .* delete/i);
});

test("tldraw-diagrams delegates to the third-party operator skill and installs if missing", () => {
  const skill = text("skills/tldraw-diagrams/SKILL.md");
  const prompt = text("prompts/diagram.md");
  // never vendor the proprietary skill/API
  assert.match(skill, /delegat/i);
  assert.match(skill, /skills\/tldraw-offline\/SKILL\.md/);
  assert.match(skill, /all rights reserved|proprietary/i);
  // install-if-missing path is explicit and non-fabricated
  assert.match(skill, /offline\.tldraw\.com|tldraw-offline\/releases/);
  assert.match(skill, /do not fabricate/i);
  assert.match(prompt, /skill:tldraw-diagrams/);
});

test("no skill hardcodes a machine-specific home path", () => {
  const stack = [resolve(root, "skills")];
  const offenders: string[] = [];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, name.name);
      if (name.isDirectory()) stack.push(full);
      else if (/\.(md|ts|sh)$/.test(name.name) || name.name === "tq") {
        if (/\/Users\/[a-z0-9._-]+\//i.test(readFileSync(full, "utf8"))) offenders.push(full);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("autonomous review explicitly degrades when subagents are unavailable", () => {
  const runner = text("extensions/ticket-runner.ts");
  const skill = text("skills/batch-implementation/SKILL.md");
  assert.match(runner, /pi-subagents is available/i);
  assert.match(runner, /structured self-review fallback/i);
  assert.match(skill, /Subagents unavailable or budget exhausted/i);
});
