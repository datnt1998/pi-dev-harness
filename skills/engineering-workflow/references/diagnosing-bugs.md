# Diagnosing Bugs

A discipline for hard bugs, regressions, flakes, and performance failures. Skip phases only when explicitly justified. Adapted for Pi from mattpocock/skills (MIT).

When exploring the codebase, read `CONTEXT.md` (if it exists) for the mental model, and check ADRs in the area you're touching.

## Phase 1 — Build a feedback loop

**This is the skill.** Everything else is mechanical. If you have a **tight** pass/fail signal that goes red on _this_ bug, you will find the cause; bisection, hypothesis-testing, and instrumentation all just consume it. If you don't have one, no amount of staring at code will save you.

Spend disproportionate effort here. Be aggressive. Be creative. Refuse to give up.

### Ways to construct one — roughly in order

1. **Failing test** at whatever seam reaches the bug — unit, integration, e2e.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **Headless browser script** (Playwright/Puppeteer) — drives the UI, asserts on DOM/console/network.
5. **Replay a captured trace** — save a real payload/event log to disk; replay it through the code path in isolation.
6. **Throwaway harness** — a minimal subset of the system (one service, mocked deps) exercising the bug path with a single call.
7. **Property / fuzz loop** — if the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode.
8. **Bisection harness** — if the bug appeared between two known states, automate "boot at state X, check, repeat" so you can `git bisect run` it.
9. **Differential loop** — run the same input through old vs new version (or two configs) and diff outputs.
10. **HITL script** — last resort. If a human must click, drive them with a structured checklist script whose captured output feeds back to you.

### Tighten the loop

Treat the loop as a product:

- **Faster?** Cache setup, skip unrelated init, narrow the test scope.
- **Sharper?** Assert on the specific symptom, not "didn't crash".
- **More deterministic?** Pin time, seed RNG, isolate filesystem, freeze network.

A 30-second flaky loop is barely better than no loop; a 2-second deterministic one is a debugging superpower.

### Non-deterministic bugs

The goal is not a clean repro but a **higher reproduction rate**. Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A 50%-flake bug is debuggable; 1% is not — keep raising the rate until it is.

### When you genuinely cannot build a loop

Stop and say so explicitly. List what you tried. Ask the user for: (a) access to an environment that reproduces it, (b) a captured artifact (HAR, log dump, core dump, recording with timestamps), or (c) permission to add temporary instrumentation. Do **not** proceed to hypothesise without a loop.

### Completion criterion — a tight loop that goes red

Phase 1 is done when you can name **one command** you have **already run at least once** (paste invocation + output) that is:

- [ ] **Red-capable** — drives the actual bug path and asserts the **user's exact symptom**. Not "runs without erroring" — it must catch _this_ bug.
- [ ] **Deterministic** — same verdict every run (flaky bugs: pinned, high reproduction rate).
- [ ] **Fast** — seconds, not minutes.
- [ ] **Agent-runnable** — runs unattended.

If you catch yourself reading code to build a theory before this command exists, **stop — jumping straight to a hypothesis is the exact failure this discipline prevents.** No red-capable command, no Phase 2.

## Phase 2 — Reproduce + minimise

Run the loop. Watch it go red. Confirm:

- [ ] The loop produces the failure mode the **user** described — not a nearby different failure. Wrong bug = wrong fix.
- [ ] Reproducible across runs (or at a debuggable rate).
- [ ] The exact symptom is captured (error message, wrong output, timing) so later phases verify the fix addresses it.

**Minimise:** shrink the repro to the smallest scenario that still goes red. Cut inputs, callers, config, data, steps **one at a time**, re-running after each cut. Done when **every remaining element is load-bearing** — removing any one makes the loop go green. A minimal repro shrinks the hypothesis space and becomes the regression test.

## Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses** before testing any. Single-hypothesis generation anchors on the first plausible idea.

Each hypothesis must be **falsifiable**: "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse." If you cannot state the prediction, it's a vibe — discard or sharpen it.

**Show the ranked list to the user before testing.** They often re-rank instantly ("we just deployed a change to #3") or have already ruled some out. Don't block on it — proceed with your ranking if the user is AFK. Use the `oracle` subagent when hypotheses genuinely compete.

## Phase 4 — Instrument

Each probe maps to a specific prediction from Phase 3. **Change one variable at a time.**

1. **Debugger / REPL inspection** if the env supports it. One breakpoint beats ten logs.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup becomes a single grep. Untagged logs survive; tagged logs die.

**Perf branch:** for performance regressions, logs are usually wrong. Establish a baseline measurement (timing harness, profiler, query plan), then bisect. Measure first, fix second.

## Phase 5 — Fix + regression test

Write the regression test **before the fix** — but only at a **correct seam**: one where the test exercises the real bug pattern as it occurs at the call site. If the only seam is too shallow (single-caller test when the bug needs multiple callers), a regression test there gives false confidence.

**If no correct seam exists, that itself is the finding** — the architecture is preventing the bug from being locked down. Note it and flag it (see `/skill:codebase-design` for the deepening vocabulary).

If a correct seam exists: minimised repro → failing test → watch it fail → fix → watch it pass → re-run the Phase 1 loop against the original un-minimised scenario.

## Phase 6 — Cleanup + post-mortem

Required before declaring done:

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
- [ ] Regression test passes (or absence of seam is documented)
- [ ] All `[DEBUG-...]` instrumentation removed (grep the prefix)
- [ ] Throwaway harnesses deleted (or clearly marked)
- [ ] The winning hypothesis stated in the commit/PR message — so the next debugger learns

**Then ask: what would have prevented this bug?** If the answer is architectural (no good test seam, tangled callers, hidden coupling), recommend a design pass with `/skill:codebase-design` — after the fix is in, not before.

## Subagents

- `scout` to map relevant code paths before Phase 1.
- `oracle` when multiple hypotheses compete in Phase 3.
- `reviewer` after the fix to check for overfitting.

## Report

Include: the feedback-loop command, root cause, fix summary, regression coverage, remaining uncertainty.
