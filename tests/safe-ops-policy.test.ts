import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDestructiveCommand, isProtectedProjectPath } from "../lib/safe-ops-policy.ts";

test("blocks protected paths inside the project without substring false positives", () => {
  const cwd = "/repo";

  for (const path of [
    "/repo/.env",
    "/repo/.env.local",
    "/repo/.git/config",
    "/repo/node_modules/pkg/index.js",
    "/repo/src/node_modules/pkg/index.js",
  ]) {
    assert.equal(isProtectedProjectPath(path, cwd), true, path);
  }

  for (const path of [
    "/repo/src/main.ts",
    "/repo-env/src/main.ts",
    "/outside/.env",
  ]) {
    assert.equal(isProtectedProjectPath(path, cwd), false, path);
  }
});

test("resolves project-local symlinks before protected path checks", () => {
  const cwd = mkdtempSync(join(tmpdir(), "safe-ops-"));
  mkdirSync(join(cwd, ".git"));
  symlinkSync(join(cwd, ".git"), join(cwd, "safe-link"));
  assert.equal(isProtectedProjectPath(join(cwd, "safe-link/config"), cwd), true);
});

test("recognizes destructive commands requiring confirmation", () => {
  for (const command of [
    "rm -rf tmp",
    "rm -fr tmp",
    "rm --recursive tmp",
    "cd /tmp && rm -rf cache",
    "git reset --hard",
    "git -C /repo reset --hard",
    "git clean -fd",
    "git -C /repo clean -fd",
    "git clean -d -f",
    "git push --force origin main",
    "git push -f origin main",
    "printf x | rm -rf tmp",
    "env rm -rf tmp",
    "echo $(rm -rf tmp)",
    "echo \"$(rm -rf tmp)\"",
    "sh -c 'rm -rf tmp'",
    "git -c advice.detachedHead=false reset --hard",
    "git -c \"advice.detachedHead=false\" reset --hard",
    "env FOO=\"bar baz\" rm -rf tmp",
  ]) {
    assert.equal(isDestructiveCommand(command), true, command);
  }

  for (const command of [
    "git status --short",
    "git clean -d",
    "git push origin main",
    "rm file.txt",
    "echo \"rm -rf\"",
    "printf '%s\\n' '; rm -rf tmp'",
    "printf \"rm -rf is documentation\"",
    "rm safe && echo -rf",
  ]) {
    assert.equal(isDestructiveCommand(command), false, command);
  }
});
