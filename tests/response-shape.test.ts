import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const text = (path: string) => readFileSync(resolve(root, path), "utf8");

const REF = "skills/engineering-workflow/references/response-shape.md";
const SKILL = "skills/engineering-workflow/SKILL.md";
const AUTONOMOUS = "skills/engineering-workflow/references/autonomous-execution.md";
const EVIDENCE = "skills/engineering-workflow/references/completion-evidence.md";
const APPEND = "templates/APPEND_SYSTEM.md";
const SNIPPET = "templates/AGENTS.snippet.md";
const README = "README.md";

test("response-shape.md is the single normative source for user-facing prose shape", () => {
  const ref = text(REF);
  assert.match(ref, /single normative source/i);
  assert.match(ref, /user-facing prose/i);
  // the seven required shape rules are all present
  assert.match(ref, /lead with the answer/i);
  assert.match(ref, /answer, result, blocker, or decision/i);
  assert.match(ref, /no filler preamble or closer/i);
  assert.match(ref, /bounded numbered user actions/i);
  assert.match(ref, /suppress tangents/i);
  assert.match(ref, /make verified wins visible/i);
  assert.match(ref, /matter-of-fact failures/i);
  assert.match(ref, /requested explanations stay detailed/i);
});

test("response-shape bans filler openers and closers", () => {
  const ref = text(REF);
  assert.match(ref, /Great question/);
  // closers are described, not quoted verbatim from upstream (M3 reword)
  assert.match(ref, /help-offer and sign-off pleasantries/);
  assert.match(ref, /asking whether the user needs anything else/);
  assert.match(ref, /hoping the answer helped/);
  assert.doesNotMatch(ref, /"Let me know if you need anything else," "Hope this helps," "Happy to clarify," "Feel free to ask\."/);
  assert.doesNotMatch(ref, /Keep a hedge that carries real uncertainty; deleting it manufactures confidence\./);
});

test("response-shape preserves autonomy and never manufactures a user next action", () => {
  const ref = text(REF);
  assert.match(ref, /never (?:manufacture|invent|fabricate)s? a user next action/i);
  assert.match(ref, /approved (?:agent )?work remains/i);
});

test("response-shape preserves every exception: rank and group, never hard-cap", () => {
  const ref = text(REF);
  assert.match(ref, /rank and group/i);
  assert.match(ref, /never hard-cap/i);
  assert.match(ref, /preserve every blocker, failure, review finding, and unverified acceptance criterion/i);
  // no list cap is imposed anywhere in the contract
  assert.doesNotMatch(ref, /cap lists at/i);
  assert.doesNotMatch(ref, /\bfive items\b/i);
  assert.doesNotMatch(ref, /\bat most (?:five|5)\b/i);
  assert.doesNotMatch(ref, /\blimit (?:the )?list to\b/i);
});

test("response-shape routes recurring state to the TUI/status, not prose", () => {
  const ref = text(REF);
  assert.match(ref, /recurring state/i);
  assert.match(ref, /TUI\/status/i);
  assert.match(ref, /not(?: prose)?(?: every turn)?/i);
});

test("response-shape rejects mandatory wall-clock estimates for evidenced scope units", () => {
  const ref = text(REF);
  assert.match(ref, /no mandatory wall-clock estimates/i);
  assert.match(ref, /evidenced scope units/i);
});

test("response-shape keeps a hard scope boundary over artifacts and evidence", () => {
  const ref = text(REF);
  for (const guarded of [
    "tool payloads",
    "evidence contracts",
    "commit messages",
    "tickets",
    "specs",
    "ADRs",
    "handoff structure",
    "subagent briefs",
    "exhaustive",
  ]) assert.match(ref, new RegExp(guarded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), guarded);
  // when shape and an artifact contract disagree, the artifact contract wins
  assert.match(ref, /artifact contract wins/i);
});

test("response-shape carries no medical claim and is not an ADHD-named resource", () => {
  const ref = text(REF);
  assert.doesNotMatch(ref, /ADHD/i);
  assert.doesNotMatch(ref, /diagnos\w*|disorder|neurodiverg\w*|\bmedical\b/i);
  // no ADHD-named resource was added under the portable surface
  for (const dir of ["skills", "prompts", "extensions", "templates"]) {
    const stack = [resolve(root, dir)];
    while (stack.length) {
      const d = stack.pop()!;
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = resolve(d, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else assert.doesNotMatch(entry.name, /adhd/i, full);
      }
    }
  }
});

test("authorities wire response-shape.md without duplicating it", () => {
  for (const path of [SKILL, AUTONOMOUS, EVIDENCE]) {
    assert.match(text(path), /response-shape\.md/, path);
  }
  // the detailed forbidden opener/closer tokens live only in the normative reference
  const duplicates: string[] = [];
  for (const path of [SKILL, AUTONOMOUS, EVIDENCE, APPEND, SNIPPET]) {
    const body = text(path);
    if (/Great question|Hope this helps|Happy to clarify/i.test(body)) duplicates.push(path);
  }
  assert.deepEqual(duplicates, []);
  // L4: the rule summary may live in at most one always-loaded template — pin
  // every distinctive summary phrase, not a single literal, so re-duplication
  // of the summary in different wording still fails.
  for (const phrase of [
    "answer first",
    "no preamble/closer",
    "rank/group, never cap",
    "answer/result/blocker/decision first",
    "every exception preserved",
  ]) {
    const carriers = [APPEND, SNIPPET].filter((path) => text(path).includes(phrase));
    assert.ok(carriers.length <= 1, `rule summary phrase "${phrase}" duplicated across ${carriers.join(", ")}`);
  }
});

// Always-loaded template budget: a recorded baseline plus a tolerance band,
// not a one-byte cliff. Growth within the band passes; sustained bloat fails.
// If you intentionally grow the templates, re-record the baseline and say why.
const TEMPLATE_BASELINE_BYTES = 2449; // APPEND_SYSTEM.md + AGENTS.snippet.md, response-shape dedup + installed-package skill path (M6/L4)
const TEMPLATE_GROWTH_ALLOWANCE = Math.ceil(TEMPLATE_BASELINE_BYTES * 0.1); // ~244 bytes of slack
const TEMPLATE_HARD_CAP = 2700; // absolute sanity ceiling

test("always-loaded templates stay near the recorded baseline and point at response-shape", () => {
  const append = text(APPEND);
  const snippet = text(SNIPPET);
  const combined = Buffer.byteLength(append, "utf8") + Buffer.byteLength(snippet, "utf8");
  const approxTokens = Math.ceil(combined / 4);
  assert.ok(
    combined <= TEMPLATE_BASELINE_BYTES + TEMPLATE_GROWTH_ALLOWANCE,
    `APPEND_SYSTEM + AGENTS snippet grew to ${combined} bytes (~${approxTokens} approx tokens); ` +
      `baseline ${TEMPLATE_BASELINE_BYTES} + ${TEMPLATE_GROWTH_ALLOWANCE} allowance. ` +
      "Re-record the baseline with justification if the growth is intentional.",
  );
  assert.ok(combined < TEMPLATE_HARD_CAP, `APPEND_SYSTEM + AGENTS snippet is ${combined} bytes (hard cap ${TEMPLATE_HARD_CAP})`);
  // meaningful headroom must remain below the hard cap
  assert.ok(TEMPLATE_BASELINE_BYTES + TEMPLATE_GROWTH_ALLOWANCE < TEMPLATE_HARD_CAP);
  assert.match(append, /response-shape/i);
  assert.match(snippet, /response-shape/i);
  // M6: the always-loaded overlay references the skill path that exists in an
  // installed package, not a repo-relative source path
  assert.doesNotMatch(append, /skills\/engineering-workflow\/references\/response-shape\.md/);
  assert.match(append, /\/skill:engineering-workflow/);
  assert.match(snippet, /\/skill:engineering-workflow/);
  // the expanded rule summary lives once in the reference, not duplicated in both templates
  assert.doesNotMatch(append, /recurring state in TUI\/status/i);
  assert.doesNotMatch(snippet, /recurring state in TUI\/status/i);
});

test("no new skill, prompt, or extension was added for response shape", () => {
  // skill count is unchanged (package-integrity also pins 17); the contract is a reference, not a skill
  assert.ok(existsSync(resolve(root, REF)));
  assert.doesNotMatch(text(SKILL), /^name:\s*response-shape/m);
});

test("README credits upstream and documents the real git-tag install contract", () => {
  const readme = text(README);
  // transparent credit/link to the upstream inspiration
  assert.match(readme, /ayghri\/i-have-adhd/);
  assert.match(readme, /c784dcb56b07c8c103323f308b25f7b055008baa/);
  assert.match(readme, /MIT licensed/);
  // M3: both adapted assets are credited by name, not just the response-shape contract
  assert.match(readme, /skills\/engineering-workflow\/references\/response-shape\.md/);
  assert.match(readme, /evals\/response-quality\//);
  assert.match(readme, /35\/25\/20\/10\/10/);
  // M7: the overlay is documented as an un-released candidate pending a real paired eval
  assert.match(readme, /candidate treatment/);
  assert.match(readme, /must not be released/);
  assert.match(readme, /no such run exists yet/i);
  // the false npm@0.5.0 install examples are gone; no npm spec remains
  assert.doesNotMatch(readme, /npm:pi-dev-harness@0\.5\.0/);
  assert.doesNotMatch(readme, /npm:pi-dev-harness@/);
  // the actual distribution contract: git tags, current v0.7.0
  assert.match(readme, /git:github\.com\/datnt1998\/pi-dev-harness@v0\.7\.0/);
  assert.match(readme, /git tag/i);
});
