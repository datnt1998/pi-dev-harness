# Execution Techniques

HOW to execute the checking the five moves demand: portable techniques, harness leverage, altitude control, and the when-stuck protocol. Load when a task begins to need deliberate technique — an answer forming automatically, a stall, a capability inventory worth taking — rather than at every skill load.

## Portable Techniques

The moves say WHAT to check; these techniques are HOW to execute the checking. They need
no special capability beyond reasoning itself, and they are the highest-leverage habits
when an answer starts forming automatically:

- **Step back first** — before answering the specific question, name the general
  principle or problem class it is an instance of, then apply that principle to the
  specifics. Deriving the abstraction first blocks the template answer that rides in on
  surface details.
- **Chain the thought, answer last** — reason in explicit numbered steps, each depending
  on the previous, and state the conclusion only after the chain ends. Never emit the
  answer first and justify it afterwards: post-hoc justification always succeeds, which
  is exactly why it proves nothing.
- **Restate before solving** — rewrite the question with every detail and constraint
  included. A detail that will not fit in the restatement is either the trap or a
  constraint about to be dropped. This is the Floor's Leftovers check run proactively.
- **Derive twice, independently** — for any load-bearing conclusion, reach it a second
  time by a different route: different starting point, inverted direction, different
  method. Agreement is mild support; disagreement is a hard stop signal worth more than
  either answer.
- **Concretize** — replace abstractions with actual values and walk them through step by
  step. "Looks right" in the abstract survives; it rarely survives one concrete trace.
- **Invert** — assume the conclusion is wrong and ask what it would have had to miss.
  Working backwards from imagined failure finds holes forward reasoning steps over.
- **Treat instant answers as alarms** — an answer that arrived before the question
  finished being read is retrieval, not reasoning. Demote it to a hypothesis and run the
  Floor against it deliberately. Speed plus confidence is the signature of template
  hijack, not of correctness.

## Harness Leverage

Portable techniques need only reasoning; most runtimes grant more. At the start of a
task, take inventory of what the current environment actually grants — running commands,
reading and writing files, fetching or searching documents, spawning subagents for
isolated checks — and treat that inventory as the verification budget. Two rules govern
its use:

- **Anything a granted capability can check, it must check.** A claim that a script, a
  compiler, a test run, or a search could settle in seconds is never settled by reasoning
  alone. Manual unit-by-unit verification is the fallback for capability-poor
  environments, not a substitute where a check is available.
- **Checkable work runs as a loop, not a single pass.** Produce → verify with the
  strongest available check → repair → re-verify, and keep looping until one complete
  verification of the final artifact comes back clean — or the remaining uncertainty is
  named explicitly in the delivery. One green check on the last edit says nothing about
  its neighbors: re-verify the whole artifact, not just the change.

Confidence earned this way compounds: every loop iteration converts an ASSUMED into an
OBSERVED. Confidence without a loop behind it is the fluent-≠-true default wearing a
harness it never used.

## Altitude Control

Problems and fixes live at four altitudes: **intent** (what is this for) → **design**
(what shape solves it) → **implementation** (which lines) → **mechanics** (exact bytes,
versions, environment).

- Diagnose the altitude before fixing. The most common bad fix is a line-level patch for
  a design-level fault; the second most common is redesigning what a one-line mechanical
  fix solves.
- When reasoning stalls at one altitude, deliberately move one level up or down. Errors
  hide at altitude boundaries.

## When Stuck

Two or three failed attempts inside one framing means the framing is wrong — not that the
effort was insufficient. Never repeat a failed probe harder. Change exactly one of:

- **Altitude** — zoom out (what is this actually for?) or in (what are the exact bytes?).
- **Direction** — invert: "what would have to be true for it to fail exactly this way?"
  and work backwards from the failure.
- **Ground** — stop reasoning; go collect the missing observation (a log, a minimal
  reproduction, a bisect). For bug diagnosis specifically, `diagnosing-bugs.md` owns the
  full ground-collection loop (feedback loop, minimize, instrument) — use its phases
  rather than re-deriving them here.

For an oversized or foggy exploration that outgrows a single stuck moment — a
multi-session effort needing its own decision map — hand off to `/skill:wayfinder` rather
than continuing to probe inside one framing.
