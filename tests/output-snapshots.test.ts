import assert from "node:assert/strict";
import test from "node:test";
import { formatReviewMap, type ReviewGraph } from "../lib/review-graph.ts";
import { buildGcPlan, summarizeGcPlan, type GcAreaInput, type GcPolicy } from "../lib/gc-core.ts";

// --- Review map snapshot ---

const reviewMapFixture: ReviewGraph = {
  sections: [
    {
      path: "lib/auth.ts",
      status: "modified",
      exportDelta: { added: ["verifyToken"], removed: ["legacyAuth"] },
      directDependents: ["extensions/login.ts", "lib/session.ts"],
      depth2Dependents: ["tests/login.test.ts"],
      depth2Capped: false,
      guards: [{ path: "tests/auth.test.ts", depth: 1 }],
    },
    {
      path: "lib/utils.ts",
      status: "added",
      exportDelta: { added: ["formatDate", "parseQuery"], removed: [] },
      directDependents: [],
      depth2Dependents: [],
      depth2Capped: false,
      guards: [],
    },
  ],
  unresolved: [{ specifier: "@external/lib", from: ["lib/auth.ts"] }],
};

const REVIEW_MAP_SNAPSHOT = `# Review map

Summary: 2 changed file(s), 3 dependent(s), 1 guard(s).

## lib/auth.ts (modified)

| export delta | names |
| --- | --- |
| added | verifyToken |
| removed | legacyAuth |

Direct dependents:
| path |
| --- |
| extensions/login.ts |
| lib/session.ts |

Depth-2 dependents:
| path |
| --- |
| tests/login.test.ts |

Guards:
| path | depth |
| --- | --- |
| tests/auth.test.ts | 1 |

## lib/utils.ts (added)

| export delta | names |
| --- | --- |
| added | formatDate, parseQuery |
| removed | none |

Direct dependents: none

Depth-2 dependents: none

Guards: none

## Unresolved specifiers

| specifier | from |
| --- | --- |
| @external/lib | lib/auth.ts |

Approx map size: 168 tokens.`;

test("review-map output matches committed snapshot byte-for-byte", () => {
  const output = formatReviewMap(reviewMapFixture);
  assert.equal(output, REVIEW_MAP_SNAPSHOT);
});

// --- GC dry-run snapshot ---

const gcPolicy: GcPolicy = {
  nowMs: 1700000000000, // fixed timestamp
  sessionsDays: 30,
  artifactsDays: 7,
  currentSessionStem: "session-current",
};

const gcAreas: GcAreaInput[] = [
  {
    kind: "sessions",
    root: "/fake/sessions/project--cwd--",
    facts: [
      { path: "/fake/sessions/project--cwd--/session-old.jsonl", mtimeMs: 1700000000000 - 40 * 86400000, sizeBytes: 1024 },
      { path: "/fake/sessions/project--cwd--/session-recent.jsonl", mtimeMs: 1700000000000 - 5 * 86400000, sizeBytes: 2048 },
      { path: "/fake/sessions/project--cwd--/session-current.jsonl", mtimeMs: 1700000000000 - 1000, sizeBytes: 512 },
    ],
  },
];

// Committed snapshot of summarizeGcPlan for the fixture above (recorded once; a
// diff here is the regression signal).
const GC_SUMMARY_SNAPSHOT = `sessions: 0 candidate(s), 3 protected, 0 bytes reclaimable
Total: 0 bytes reclaimable`;

test("gc dry-run summary matches committed snapshot byte-for-byte", () => {
  const plan = buildGcPlan(gcAreas, gcPolicy);
  const summary = summarizeGcPlan(plan);
  assert.equal(summary, GC_SUMMARY_SNAPSHOT);
});
