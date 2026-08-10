import assert from "node:assert/strict";
import test from "node:test";
import { buildGcPlan, type GcAreaInput, type GcFileFact, type GcPolicy, summarizeGcPlan } from "../lib/gc-core.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 1);

function fact(overrides: Partial<GcFileFact> & { path: string }): GcFileFact {
  return { mtimeMs: NOW - 60 * DAY, sizeBytes: 1000, kind: "file", ...overrides };
}

function basePolicy(overrides: Partial<GcPolicy> = {}): GcPolicy {
  return { nowMs: NOW, sessionsDays: 30, artifactsDays: 7, ...overrides };
}

test("old session file and its same-stem sibling dir become candidates; newer facts are protected", () => {
  const area: GcAreaInput = {
    kind: "sessions",
    root: "/store",
    facts: [
      fact({ path: "/store/20250101-abcd.jsonl", mtimeMs: NOW - 60 * DAY }),
      fact({ path: "/store/20250101-abcd", mtimeMs: NOW - 60 * DAY, kind: "dir" }),
      fact({ path: "/store/20251230-fresh.jsonl", mtimeMs: NOW - 1 * DAY }),
    ],
  };
  const plan = buildGcPlan([area], basePolicy());
  const [areaPlan] = plan.areas;
  assert.deepEqual(
    areaPlan.candidates.map((c) => c.path),
    ["/store/20250101-abcd", "/store/20250101-abcd.jsonl"],
  );
  assert.equal(areaPlan.protectedCount, 1);
  assert.equal(areaPlan.reclaimBytes, 2000);
});

test("current session stem is protected even when older than the window", () => {
  const area: GcAreaInput = {
    kind: "sessions",
    root: "/store",
    facts: [
      fact({ path: "/store/20250101-current.jsonl", mtimeMs: NOW - 90 * DAY }),
      fact({ path: "/store/20250101-current", mtimeMs: NOW - 90 * DAY, kind: "dir" }),
      fact({ path: "/store/20250101-other.jsonl", mtimeMs: NOW - 90 * DAY }),
    ],
  };
  const plan = buildGcPlan([area], basePolicy({ currentSessionStem: "20250101-current" }));
  const [areaPlan] = plan.areas;
  assert.deepEqual(
    areaPlan.candidates.map((c) => c.path),
    ["/store/20250101-other.jsonl"],
  );
  assert.equal(areaPlan.protectedCount, 2);
});

test("subagent-temp run states: active/unknown protected, terminal-and-old is a candidate, absent falls back to age", () => {
  const area: GcAreaInput = {
    kind: "subagent-temp",
    root: "/tmp/pi-subagents-uid-501/async-subagent-runs",
    facts: [
      fact({ path: "/tmp/pi-subagents-uid-501/async-subagent-runs/run-active", mtimeMs: NOW - 30 * DAY, kind: "dir" }),
      fact({ path: "/tmp/pi-subagents-uid-501/async-subagent-runs/run-unknown", mtimeMs: NOW - 30 * DAY, kind: "dir" }),
      fact({ path: "/tmp/pi-subagents-uid-501/async-subagent-runs/run-terminal", mtimeMs: NOW - 30 * DAY, kind: "dir" }),
      fact({ path: "/tmp/pi-subagents-uid-501/async-subagent-runs/run-no-state-old", mtimeMs: NOW - 30 * DAY, kind: "dir" }),
      fact({ path: "/tmp/pi-subagents-uid-501/async-subagent-runs/run-no-state-fresh", mtimeMs: NOW - 1 * DAY, kind: "dir" }),
    ],
    runStates: {
      "run-active": "active",
      "run-unknown": "unknown",
      "run-terminal": "terminal",
    },
  };
  const plan = buildGcPlan([area], basePolicy());
  const [areaPlan] = plan.areas;
  assert.deepEqual(
    areaPlan.candidates.map((c) => c.path),
    [
      "/tmp/pi-subagents-uid-501/async-subagent-runs/run-no-state-old",
      "/tmp/pi-subagents-uid-501/async-subagent-runs/run-terminal",
    ],
  );
  assert.equal(areaPlan.protectedCount, 3);
});

test("a fact outside root and a sessions child without a timestamp stem are protected", () => {
  const sessionsArea: GcAreaInput = {
    kind: "sessions",
    root: "/store",
    facts: [
      fact({ path: "/store/not-a-timestamp.jsonl", mtimeMs: NOW - 60 * DAY }),
      fact({ path: "/store/nested/too-deep.jsonl", mtimeMs: NOW - 60 * DAY }),
    ],
  };
  const plan = buildGcPlan([sessionsArea], basePolicy());
  const [areaPlan] = plan.areas;
  assert.equal(areaPlan.candidates.length, 0);
  assert.equal(areaPlan.protectedCount, 2);
});

test("candidate ordering is deterministic and reclaimBytes/totalReclaimBytes sums are exact", () => {
  const sessions: GcAreaInput = {
    kind: "sessions",
    root: "/store",
    facts: [
      fact({ path: "/store/20250103-c.jsonl", mtimeMs: NOW - 60 * DAY, sizeBytes: 300 }),
      fact({ path: "/store/20250101-a.jsonl", mtimeMs: NOW - 60 * DAY, sizeBytes: 100 }),
      fact({ path: "/store/20250102-b.jsonl", mtimeMs: NOW - 60 * DAY, sizeBytes: 200 }),
    ],
  };
  const artifacts: GcAreaInput = {
    kind: "project-artifacts",
    root: "/proj/.pi-subagents/artifacts",
    facts: [fact({ path: "/proj/.pi-subagents/artifacts/old", mtimeMs: NOW - 10 * DAY, sizeBytes: 50, kind: "dir" })],
  };
  const plan = buildGcPlan([sessions, artifacts], basePolicy());
  assert.deepEqual(
    plan.areas[0].candidates.map((c) => c.path),
    ["/store/20250101-a.jsonl", "/store/20250102-b.jsonl", "/store/20250103-c.jsonl"],
  );
  assert.equal(plan.areas[0].reclaimBytes, 600);
  assert.equal(plan.areas[1].reclaimBytes, 50);
  assert.equal(plan.totalReclaimBytes, 650);

  const summary = summarizeGcPlan(plan);
  assert.match(summary, /sessions: 3 candidate/);
  assert.match(summary, /project-artifacts: 1 candidate/);
  assert.match(summary, /Total: 650 bytes reclaimable/);
});

test("a fact with non-finite mtimeMs is protected", () => {
  const area: GcAreaInput = {
    kind: "project-artifacts",
    root: "/proj/.pi-subagents/artifacts",
    facts: [
      fact({ path: "/proj/.pi-subagents/artifacts/nan", mtimeMs: Number.NaN as unknown as number, kind: "dir" }),
      fact({ path: "/proj/.pi-subagents/artifacts/undef", mtimeMs: undefined as unknown as number, kind: "dir" }),
    ],
  };
  const plan = buildGcPlan([area], basePolicy());
  const [areaPlan] = plan.areas;
  assert.equal(areaPlan.candidates.length, 0);
  assert.equal(areaPlan.protectedCount, 2);
});
