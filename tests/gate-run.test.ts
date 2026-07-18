import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const runner = resolve(import.meta.dirname, "../lib/gate-run.ts");

function run(markdown: string) {
  const dir = mkdtempSync(join(tmpdir(), "pi-gate-"));
  const file = join(dir, "tickets.md");
  writeFileSync(file, markdown);
  return spawnSync(process.execPath, ["--experimental-strip-types", runner, file], { cwd: dir, encoding: "utf8" });
}

test("gate runner exits non-zero when malformed headings would be omitted", () => {
  const result = run(`## T1 malformed heading\nGoal: g\n`);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Unparsed heading skipped/);
});

test("gate runner accepts a fully ready source", () => {
  const result = run(`## T1 — Ready\nGoal: g\nScope: s\nAcceptance criteria:\n- outcome\nValidation: manual: inspect\nDone when:\n- ok\n`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
