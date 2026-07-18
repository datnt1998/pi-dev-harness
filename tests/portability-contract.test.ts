import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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
  ]) assert.match(setup, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), required);
});

test("generic release flow does not impose npm or a project-specific releases module", () => {
  const release = `${text("skills/release-versioning/SKILL.md")}\n${text("prompts/release.md")}`;
  assert.doesNotMatch(release, /npm run (?:test|build)/i);
  assert.doesNotMatch(release, /src\/lib\/releases|APP_VERSION|prepend(?:ed)? to RELEASES/i);
  assert.match(release, /do not assume npm/i);
  assert.match(release, /exact deploy trigger/i);
});

test("autonomous review explicitly degrades when subagents are unavailable", () => {
  const runner = text("extensions/ticket-runner.ts");
  const skill = text("skills/batch-implementation/SKILL.md");
  assert.match(runner, /pi-subagents is available/i);
  assert.match(runner, /structured self-review fallback/i);
  assert.match(skill, /Subagents unavailable or budget exhausted/i);
});
