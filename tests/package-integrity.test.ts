import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function filesUnder(path: string, suffix: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, suffix));
    else if (name.endsWith(suffix)) out.push(full);
  }
  return out;
}

const skillFiles = filesUnder(join(root, "skills"), "SKILL.md");
const promptFiles = filesUnder(join(root, "prompts"), ".md");
const extensionFiles = filesUnder(join(root, "extensions"), ".ts");

test("package exposes the expected portable resource surface", () => {
  assert.equal(skillFiles.length, 15);
  assert.equal(promptFiles.length, 26);
  for (const path of [
    "extensions/safe-ops.ts",
    "extensions/ticket-runner.ts",
    "templates/APPEND_SYSTEM.md",
    "templates/AGENTS.snippet.md",
    "templates/PROJECT_SETUP.md",
    "scripts/sdk-smoke.mjs",
    "scripts/packed-smoke.mjs",
    "LICENSE",
  ]) assert.equal(existsSync(join(root, path)), true, path);
});

test("skill frontmatter names are valid and unique", () => {
  const names: string[] = [];
  for (const file of skillFiles) {
    const text = readFileSync(file, "utf8");
    const name = text.match(/^name:\s*([^\n]+)$/m)?.[1]?.trim();
    const description = text.match(/^description:\s*(.+)$/m)?.[1]?.trim();
    assert.match(name ?? "", /^[a-z0-9]+(?:-[a-z0-9]+)*$/, file);
    assert.ok(description, `${file}: missing description`);
    names.push(name!);
  }
  assert.equal(new Set(names).size, names.length);
});

test("prompt names do not collide with extension commands", () => {
  const prompts = new Set(promptFiles.map((file) => basename(file, ".md")));
  const commands: string[] = [];
  const tools: string[] = [];
  for (const file of extensionFiles) {
    const text = readFileSync(file, "utf8");
    commands.push(...[...text.matchAll(/registerCommand\(\s*["']([^"']+)/g)].map((match) => match[1]));
    tools.push(...[...text.matchAll(/name:\s*["'](batch_[^"']+)/g)].map((match) => match[1]));
  }
  assert.deepEqual(commands.filter((name) => prompts.has(name)), []);
  assert.equal(new Set(commands).size, commands.length);
  assert.equal(new Set(tools).size, tools.length);
});

test("package metadata declares portable Pi and runtime contracts", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.ok(pkg.keywords.includes("pi-package"));
  assert.equal(pkg.engines.node, ">=22");
  assert.equal(pkg.scripts["smoke:installed"], "node scripts/sdk-smoke.mjs");
  assert.equal(pkg.scripts["smoke:packed"], "node scripts/packed-smoke.mjs");
  assert.ok(pkg.files.includes("scripts/**/*"));
  for (const peer of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "typebox"]) {
    assert.equal(pkg.peerDependencies[peer], "*", `${peer} must use the Pi-hosted peer per package docs`);
  }
});

test("portable resources contain no consumer project identity", () => {
  const files = [
    ...skillFiles,
    ...promptFiles,
    ...extensionFiles,
    ...filesUnder(join(root, "lib"), ".ts"),
    ...filesUnder(join(root, "templates"), ".md"),
    join(root, "README.md"),
  ];
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /personal-tracker|bookingez|\bOrbit\b|pomodoro|kanban board|this codebase is a \*\*Vite/i, file);
  }
});

test("real relative markdown links resolve", () => {
  const markdown = [...filesUnder(join(root, "skills"), ".md"), ...promptFiles, ...filesUnder(join(root, "templates"), ".md"), join(root, "README.md")];
  const missing: string[] = [];
  for (const file of markdown) {
    const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target) || target.includes("<") || target.startsWith("tickets/") || target.startsWith("./src/")) continue;
      if (!existsSync(resolve(dirname(file), target))) missing.push(`${file} -> ${match[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
