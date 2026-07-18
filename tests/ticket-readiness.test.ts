import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeBatch,
  classifyTicket,
  fingerprint,
  parseTickets,
  topoOrder,
} from "../lib/ticket-readiness.ts";

const READY_TICKET = `# Tickets

Some intro prose that must be ignored.

## T1 — Parser

Goal: Parse tickets.
Scope: lib/ticket-readiness.ts
Working directory: packages/core
Dependencies: none
Acceptance criteria:
- Extracts ids and fields.
- Ignores prose.
Validation: npm run test:harness
Done when:
- Parser tests pass.
`;

test("parses tickets and ignores surrounding prose", () => {
  const tickets = parseTickets(READY_TICKET);
  assert.equal(tickets.length, 1);
  const t = tickets[0];
  assert.equal(t.id, "T1");
  assert.equal(t.title, "Parser");
  assert.equal(t.goal, "Parse tickets.");
  assert.equal(t.workingDirectory, "packages/core");
  assert.deepEqual(t.dependencies, []);
  assert.deepEqual(t.acceptanceCriteria, ["Extracts ids and fields.", "Ignores prose."]);
  assert.deepEqual(t.validation, ["npm run test:harness"]);
  assert.deepEqual(t.doneWhen, ["Parser tests pass."]);
});

test("parses Markdown headings with up to three leading spaces", () => {
  const tickets = parseTickets(`  ## T1 — Indented\nGoal: g\nScope: s\nAcceptance criteria:\n- outcome\nValidation: run\nDone when:\n- ok\n`);
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].id, "T1");
});

test("parses en-dash, hyphen, and colon headings and inline deps", () => {
  const md = `## T2 - Alpha
Goal: A
Scope: s
Dependencies: T1, T3
Acceptance criteria:
- ok
Validation: run it
Done when:
- ok

## T3: Beta
Goal: B
Scope: s
Acceptance criteria:
- ok
Validation: run it
Done when:
- ok
`;
  const tickets = parseTickets(md);
  assert.deepEqual(tickets.map((t) => t.id), ["T2", "T3"]);
  assert.deepEqual(tickets[0].dependencies, ["T1", "T3"]);
});

test("missing intent fields classify as NEEDS_DECISION without crashing", () => {
  const [ticket] = parseTickets(`## T1 — X
Scope: only scope
Validation: npm run test:harness
Done when:
- ok
`);
  const c = classifyTicket(ticket);
  assert.equal(c.status, "NEEDS_DECISION");
  assert.ok(c.issues.some((i) => i.includes("Goal")));
  assert.ok(c.issues.some((i) => i.includes("Acceptance")));
});

test("fills validation from repo script as AUTO_FIXED", () => {
  const [ticket] = parseTickets(`## T1 — X
Goal: g
Scope: s
Acceptance criteria:
- observable outcome
Done when:
- ok
`);
  // ticket text mentions no check word -> stays NEEDS_DECISION
  const withoutCheck = classifyTicket(ticket, { repoScripts: ["npm run test:harness"] });
  assert.equal(withoutCheck.status, "NEEDS_DECISION");

  const [ticket2] = parseTickets(`## T1 — X
Goal: add tests
Scope: s
Acceptance criteria:
- test passes
Done when:
- ok
`);
  const filled = classifyTicket(ticket2, { repoScripts: ["npm run test:harness", "npm run build"] });
  assert.equal(filled.status, "AUTO_FIXED");
  assert.deepEqual(filled.validation, ["npm run test:harness"]);
  assert.ok(filled.autoFixes.some((f) => f.includes("Validation")));
});

test("derives Done when from acceptance as AUTO_FIXED", () => {
  const [ticket] = parseTickets(`## T1 — X
Goal: g
Scope: s
Acceptance criteria:
- observable outcome
Validation: npm run test:harness
`);
  const c = classifyTicket(ticket);
  assert.equal(c.status, "AUTO_FIXED");
  assert.deepEqual(c.doneWhen, ["All acceptance criteria pass."]);
});

test("non-measurable acceptance is escalated", () => {
  const [ticket] = parseTickets(`## T1 — X
Goal: g
Scope: s
Acceptance criteria:
- works
Validation: npm run test:harness
Done when:
- ok
`);
  const c = classifyTicket(ticket);
  assert.equal(c.status, "NEEDS_DECISION");
});

test("unknown and self dependency block the ticket", () => {
  const analysis = analyzeBatch(`## T1 — X
Goal: g
Scope: s
Dependencies: T9
Acceptance criteria:
- outcome
Validation: npm run test:harness
Done when:
- ok

## T2 — Y
Goal: g
Scope: s
Dependencies: T2
Acceptance criteria:
- outcome
Validation: npm run test:harness
Done when:
- ok
`);
  const t1 = analysis.tickets.find((t) => t.id === "T1")!;
  const t2 = analysis.tickets.find((t) => t.id === "T2")!;
  assert.equal(t1.status, "BLOCKED");
  assert.equal(t2.status, "BLOCKED");
  assert.ok(t1.issues.some((i) => i.includes("Unknown dependency")));
});

test("gated dependencies block descendants but not independent tickets", () => {
  const analysis = analyzeBatch(`## T1 — Decision
Scope: s
Validation: run
Done when:
- ok

## T2 — Depends
Goal: g
Scope: s
Dependencies: T1
Acceptance criteria:
- outcome
Validation: run
Done when:
- ok

## T3 — Independent
Goal: g
Scope: s
Dependencies: none
Acceptance criteria:
- outcome
Validation: run
Done when:
- ok
`);
  assert.equal(analysis.tickets.find((ticket) => ticket.id === "T1")?.status, "NEEDS_DECISION");
  assert.equal(analysis.tickets.find((ticket) => ticket.id === "T2")?.status, "BLOCKED");
  assert.equal(analysis.tickets.find((ticket) => ticket.id === "T3")?.status, "READY");
});

test("topological order is deterministic for a DAG", () => {
  const tickets = parseTickets(`## T1 — A
Goal: g
Scope: s
Dependencies: T2
Acceptance criteria:
- outcome
Validation: run
Done when:
- ok

## T2 — B
Goal: g
Scope: s
Dependencies: none
Acceptance criteria:
- outcome
Validation: run
Done when:
- ok

## T3 — C
Goal: g
Scope: s
Dependencies: T1
Acceptance criteria:
- outcome
Validation: run
Done when:
- ok
`);
  const { order, cycles } = topoOrder(tickets);
  assert.deepEqual(cycles, []);
  assert.deepEqual(order, ["T2", "T1", "T3"]);
});

test("cyclic dependencies are detected and reported", () => {
  const analysis = analyzeBatch(`## T1 — A
Goal: g
Scope: s
Dependencies: T2
Acceptance criteria:
- outcome
Validation: run
Done when:
- ok

## T2 — B
Goal: g
Scope: s
Dependencies: T1
Acceptance criteria:
- outcome
Validation: run
Done when:
- ok
`);
  assert.equal(analysis.cycles.length, 1);
  assert.deepEqual(analysis.cycles[0], ["T1", "T2"]);
  for (const ticket of analysis.tickets) assert.equal(ticket.status, "BLOCKED");
});

test("fingerprint is whitespace-stable and content-sensitive", () => {
  const a = `## T1 — X\nGoal: g\n`;
  const b = `## T1 — X   \nGoal: g\n\n`;
  const c = `## T1 — X\nGoal: different\n`;
  assert.equal(fingerprint(a), fingerprint(b));
  assert.notEqual(fingerprint(a), fingerprint(c));
});

test("fingerprint ignores a generated manifest header", () => {
  const withHeader = `<!-- execution-manifest fingerprint=abc generated=... -->\n## T1 — X\nGoal: g\n`;
  const without = `## T1 — X\nGoal: g\n`;
  assert.equal(fingerprint(withHeader), fingerprint(without));
});

test("malformed headings are surfaced as warnings, not silently dropped", () => {
  const md = `## T1 — Good
Goal: g
Scope: s
Acceptance criteria:
- outcome
Validation: npm run test:harness
Done when:
- ok

## T2-Bad heading without separator
Goal: g
`;
  const analysis = analyzeBatch(md);
  assert.equal(analysis.tickets.length, 1);
  assert.equal(analysis.tickets[0].id, "T1");
  assert.equal(analysis.warnings.length, 1);
  assert.ok(analysis.warnings[0].includes("Unparsed heading"));
});

test("empty or heading-free sources fail closed with a warning", () => {
  const analysis = analyzeBatch("# Notes only\nNo tickets here.");
  assert.equal(analysis.tickets.length, 0);
  assert.ok(analysis.warnings.includes("No parseable tickets found."));
});

test("batch summary counts every status once", () => {
  const analysis = analyzeBatch(READY_TICKET, { repoScripts: ["npm run test:harness"] });
  const total =
    analysis.summary.READY +
    analysis.summary.AUTO_FIXED +
    analysis.summary.NEEDS_DECISION +
    analysis.summary.BLOCKED;
  assert.equal(total, analysis.tickets.length);
  assert.equal(analysis.tickets[0].status, "READY");
});
