import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const script = join(root, "..", "scripts", "verify-doc-contracts.mjs");

test("doc contracts script exits 0 on the shipped tree", () => {
  const result = spawnSync("node", [script], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
});
