import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const script = join(root, "..", "scripts", "verify-adrs.mjs");

test("ADR format gate passes on the shipped tree", () => {
  const result = spawnSync("node", [script], { cwd: join(root, ".."), encoding: "utf8" });
  assert.equal(result.status, 0, `Expected exit 0.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
});
