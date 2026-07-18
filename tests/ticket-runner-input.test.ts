import assert from "node:assert/strict";
import test from "node:test";
import { manifestSource, parseImplementArgs } from "../lib/ticket-runner-input.ts";

test("implement arguments preserve paths with spaces", () => {
  assert.deepEqual(parseImplementArgs("tickets/my batch.md --commit"), { path: "tickets/my batch.md", commit: true });
  assert.deepEqual(parseImplementArgs("--commit 'tickets/my batch.md'"), { path: "tickets/my batch.md", commit: true });
  assert.deepEqual(parseImplementArgs('"tickets/my batch.md"'), { path: "tickets/my batch.md", commit: false });
});

test("manifest source supports quoted and legacy paths", () => {
  assert.equal(manifestSource('<!-- execution-manifest fingerprint=x source="tickets/my batch.md" generated=x -->'), "tickets/my batch.md");
  assert.equal(manifestSource("<!-- execution-manifest fingerprint=x source=tickets.md generated=x -->"), "tickets.md");
  assert.equal(manifestSource("# no header"), undefined);
});
