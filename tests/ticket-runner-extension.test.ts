import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ticketRunner from "../extensions/ticket-runner.ts";
import { createRunState, startTicket } from "../lib/ticket-runner-state.ts";
import { fingerprint } from "../lib/ticket-readiness.ts";

function report(source: string, sourceFingerprint: string, outcome: "completed" | "retry" | "needs_decision" = "completed") {
  return {
    protocolVersion: 1,
    workUnit: { source, sourceFingerprint, ticketId: "T1", purpose: "extension gate", attempt: 1 },
    runs: [{ role: "producer", actor: "writer", runId: "writer-1", contextMode: "fresh", acceptanceMode: "checked", provider: { provider: "one", fallback: false } }],
    writerLease: { owner: "writer", phase: "closed", allowedPaths: ["lib/x.ts"], openedAt: "2026-01-01", closedAt: "2026-01-01" },
    implementation: { changedPaths: ["lib/x.ts"], fingerprint: "impl" },
    producerObservations: [{ summary: "observation", locators: ["log:1"], replayCommands: ["node --test"] }],
    parentValidation: [{ command: "node --test", outcome: outcome === "completed" ? "passed" : "failed", locator: "log:2", observedFingerprint: "impl" }],
    reviews: [
      { axis: "standards", run: { role: "standards-reviewer", actor: "standards", runId: "s", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "two", fallback: false } }, reviewedFingerprint: "impl", verdict: "no-findings", findings: [] },
      { axis: "spec", run: { role: "spec-reviewer", actor: "spec", runId: "p", contextMode: "fresh", acceptanceMode: "reviewed", provider: { provider: "three", fallback: false } }, reviewedFingerprint: "impl", verdict: "no-findings", findings: [] },
    ],
    dispositions: [], fixAndRereview: { round: 0, fixApplied: false },
    completionFidelity: { criteria: { C1: "verified", C2: "verified", C3: "verified", C4: "verified", C5: "verified", C6: "verified", C7: "verified" }, claims: [{ claim: "test", locator: "log:2", verifiedBy: "parent" }] },
    diversity: { achievedIndependence: "provider-distinct", degraded: false }, residualRisks: outcome === "completed" ? [] : ["retry safely after fix"], requestedOutcome: outcome,
    ...(outcome === "needs_decision" ? { decisionPacket: { affectedWorkUnitIds: ["T1"], affectedTicketIds: ["T1"], affectedFiles: ["lib/x.ts"], locatorOrGlob: "lib/x.ts:1", searchedScope: "lib", exclusions: [], pattern: "missing invariant", patternKind: "code-shape", occurrences: 1, representativeLocators: ["lib/x.ts:1"], question: "Which behavior should apply?", safeDefault: "No change.", consequences: "Compatibility remains unchanged.", replayCommand: "rg invariant lib", disconfirmProcedure: "Inspect the locator.", blockedStage: "implementation", unrelatedWorkSafe: true } } : {}),
    parentGate: { actor: "parent", role: "parent", action: outcome === "completed" ? "accepted" : "escalated", observedFingerprint: "impl", evidenceLocator: "log:3" },
  };
}

function fakePi() {
  const handlers: Record<string, Array<(event: unknown, ctx: unknown) => unknown>> = {};
  const tools: Record<string, { execute: (...args: any[]) => Promise<any>; parameters: any; description: string }> = {};
  const commands: Record<string, { handler: (...args: any[]) => Promise<any> }> = {};
  return {
    handlers, tools, commands, entries: [] as any[],
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) { (handlers[event] ??= []).push(handler); },
    registerCommand(name: string, def: { handler: (...args: any[]) => Promise<any> }) { commands[name] = def; }, registerTool(def: { name: string; execute: (...args: any[]) => Promise<any>; parameters: any; description: string }) { tools[def.name] = def; },
    // Match the host's custom-entry shape so reconstruction sees persisted snapshots.
    appendEntry(type: string, data: unknown) { this.entries.push({ type: "custom", customType: type, data: structuredClone(data) }); },
    events: { emit() {} }, sendUserMessage() {},
  };
}

function context(dir: string, pi: ReturnType<typeof fakePi>) {
  return { cwd: dir, mode: "headless", isIdle: () => false, hasPendingMessages: () => false, sessionManager: { getBranch: () => pi.entries }, ui: { setStatus() {}, notify() {}, theme: { fg: (_: string, text: string) => text } } };
}

test("real batch_report rejects prose then accepts structured active completion", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-runner-"));
  try {
    const source = join(dir, "tickets.md"); const raw = "# tickets\n"; writeFileSync(source, raw);
    const state = createRunState({ batchId: "b", source, fingerprint: fingerprint(raw), order: ["T1"], tickets: [{ id: "T1", dependencies: [] }], now: 1 });
    startTicket(state, "T1");
    const pi = fakePi(); pi.entries.push({ type: "custom", customType: "ticket-batch-state", data: structuredClone(state) });
    ticketRunner(pi as never);
    const ctx = context(dir, pi);
    for (const handler of pi.handlers.session_start) handler({}, ctx);
    const prose = await pi.tools.batch_report.execute("x", { id: "T1", outcome: "completed", report: { note: "done" } }, undefined, undefined, ctx);
    assert.match(prose.content[0].text, /Outcome rejected/);
    const valid = await pi.tools.batch_report.execute("x", { id: "T1", outcome: "completed", report: report(source, fingerprint(raw)) }, undefined, undefined, ctx);
    assert.match(valid.content[0].text, /Recorded T1 → completed/);
    const latest = pi.entries.at(-1) as any;
    assert.equal(latest.data.tickets[0].status, "completed");

    // batch_next uses the real registered tool and sees the completed terminal batch.
    const next = await pi.tools.batch_next.execute("x", {}, undefined, undefined, ctx);
    assert.match(next.content[0].text, /No active ticket batch|Batch not actionable/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extension restores the latest valid cloned snapshot and ignores malformed newer entries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-runner-"));
  try {
    const source = join(dir, "tickets.md"); const raw = "# tickets\n"; writeFileSync(source, raw);
    const state = createRunState({ batchId: "b", source, fingerprint: fingerprint(raw), order: ["T1"], tickets: [{ id: "T1", dependencies: [] }], now: 1 });
    startTicket(state, "T1");
    const pi = fakePi(); pi.entries.push({ type: "custom", customType: "ticket-batch-state", data: structuredClone(state) });
    pi.entries.push({ type: "custom", customType: "ticket-batch-state", data: { version: 1, malformed: true } });
    ticketRunner(pi as never); const ctx = context(dir, pi);
    for (const handler of pi.handlers.session_start) handler({}, ctx);
    const accepted = await pi.tools.batch_report.execute("x", { id: "T1", outcome: "retry", report: report(source, fingerprint(raw), "retry") }, undefined, undefined, ctx);
    assert.match(accepted.content[0].text, /Recorded T1 → queued/);
    const persisted = pi.entries.at(-1).data;
    assert.equal(persisted.tickets[0].evidence.pendingEvidence.requestedOutcome, "retry");
    // Mutating the historical seed cannot mutate the persisted reconstructed state.
    state.tickets[0].status = "failed";
    assert.equal(persisted.tickets[0].status, "queued");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extension rejects wrong active id and source changes while accepting structured needs_decision", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-runner-"));
  try {
    const source = join(dir, "tickets.md"); const raw = "# tickets\n"; writeFileSync(source, raw);
    const state = createRunState({ batchId: "b", source, fingerprint: fingerprint(raw), order: ["T1"], tickets: [{ id: "T1", dependencies: [] }], now: 1 }); startTicket(state, "T1");
    const pi = fakePi(); pi.entries.push({ type: "custom", customType: "ticket-batch-state", data: structuredClone(state) }); ticketRunner(pi as never); const ctx = context(dir, pi);
    for (const handler of pi.handlers.session_start) handler({}, ctx);
    assert.match(pi.tools.batch_report.description, /needs_decision/);
    assert.deepEqual(pi.tools.batch_report.parameters.properties.outcome.enum, ["completed", "retry", "failed", "blocked", "needs_decision"]);
    const wrong = await pi.tools.batch_report.execute("x", { id: "T2", outcome: "completed", report: report(source, fingerprint(raw)) }, undefined, undefined, ctx);
    assert.match(wrong.content[0].text, /not the active/);
    const incomplete = report(source, fingerprint(raw), "needs_decision") as any; incomplete.decisionPacket.replayCommand = "";
    const rejected = await pi.tools.batch_report.execute("x", { id: "T1", outcome: "needs_decision", report: incomplete }, undefined, undefined, ctx);
    assert.match(rejected.content[0].text, /Outcome rejected/);
    const decision = await pi.tools.batch_report.execute("x", { id: "T1", outcome: "needs_decision", report: report(source, fingerprint(raw), "needs_decision") }, undefined, undefined, ctx);
    assert.match(decision.content[0].text, /Recorded T1 → needs_decision/);
    assert.match((pi.entries.at(-1) as any).data.tickets[0].note, /Safe default: No change/);
    // Fresh state for the source freshness branch because the valid decision is terminal.
    const fresh = createRunState({ batchId: "fresh", source, fingerprint: fingerprint(raw), order: ["T1"], tickets: [{ id: "T1", dependencies: [] }], now: 1 }); startTicket(fresh, "T1"); pi.entries.push({ type: "custom", customType: "ticket-batch-state", data: structuredClone(fresh) });
    for (const handler of pi.handlers.session_start) handler({}, ctx);
    writeFileSync(source, "changed");
    const changed = await pi.tools.batch_report.execute("x", { id: "T1", outcome: "completed", report: report(source, fingerprint(raw)) }, undefined, undefined, ctx);
    assert.match(changed.content[0].text, /source changed; result not recorded/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extension instances do not leak reconstructed state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-runner-"));
  try {
    const source = join(dir, "tickets.md"); writeFileSync(source, "# tickets\n");
    const state = createRunState({ batchId: "one", source, fingerprint: fingerprint("# tickets\n"), order: ["T1"], tickets: [{ id: "T1", dependencies: [] }], now: 1 });
    const first = fakePi(); first.entries.push({ type: "custom", customType: "ticket-batch-state", data: structuredClone(state) }); ticketRunner(first as never);
    for (const handler of first.handlers.session_start) handler({}, context(dir, first));
    const second = fakePi(); ticketRunner(second as never); const secondCtx = context(dir, second);
    for (const handler of second.handlers.session_start) handler({}, secondCtx);
    const next = await second.tools.batch_next.execute("x", {}, undefined, undefined, secondCtx);
    assert.match(next.content[0].text, /No active ticket batch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("verbose legacy status gives recovery guidance through the real extension", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ticket-runner-"));
  try {
    const state = createRunState({ batchId: "legacy", source: "missing.md", fingerprint: "fp", order: ["T1"], tickets: [{ id: "T1", dependencies: [] }], now: 1 });
    const pi = fakePi(); pi.entries.push({ type: "custom", customType: "ticket-batch-state", data: structuredClone(state) }); ticketRunner(pi as never); const ctx = context(dir, pi);
    for (const handler of pi.handlers.session_start) handler({}, ctx);
    await pi.commands["implementation-status"].handler("--verbose", ctx);
    assert.match(pi.entries.at(-1).data.text, /re-gate, revalidate, and re-review/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
