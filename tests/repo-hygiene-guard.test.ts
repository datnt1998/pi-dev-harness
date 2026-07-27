import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");

test(".pi/ is gitignored so local harness state never leaks into version control", () => {
  const result = spawnSync("git", ["check-ignore", "-v", ".pi/settings.json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  // -v reports the source of the rule; require it to be this repo's .gitignore so a
  // global core.excludesFile or .git/info/exclude cannot make this pass for the wrong reason.
  assert.match(result.stdout, /^\.gitignore:/, result.stdout);
});
