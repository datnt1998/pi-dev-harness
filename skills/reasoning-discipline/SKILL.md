---
name: reasoning-discipline
description: "Executable reasoning protocol that hardens diagnosis, review, root-cause analysis, and high-stakes or contested decisions against predictable failure modes, and mechanically verifies output that carries a checkable constraint (banned tokens, exact counts, strict formats). Use whenever being right matters more than being fast, for simple-looking questions that hide a trap, or whenever the deliverable must satisfy a rule a script or count can check."
---

# Reasoning Discipline

A set of procedures that make reasoning more grounded, better calibrated, and harder to
fool — including by fluent output that only feels correct. It does not add capability; it
removes predictable failure modes that waste whatever capability is available.

The moves are mechanical on purpose: they leave no room for "felt right". They apply
regardless of which model or runtime is executing. When instinct conflicts with a rule
here, the rule wins. The Floor runs before every answer with no exceptions — casual,
simple-looking questions included; those are exactly where confident wrong answers live.

## Known Failure Modes

Naming these is the first countermeasure:

- **Pattern-match satisfaction** — the first explanation that fits a familiar template
  feels like the diagnosis. Familiarity is retrieval, not verification. Countered by REASON.
- **Template hijack** — a question whose surface matches a stored template ("flaky test →
  add retry") fires the template's answer before this question's actual constraints are
  read. Familiarity raises the risk rather than lowering it. Countered by the Floor.
- **Fluent ≠ true** — well-formed prose feels more correct as it flows; confidence rises
  with token count, not with evidence. Countered by DELIVER.
- **Prior-as-fact** — training/background knowledge gets stated in the grammar of observed
  fact. Priors decay: APIs change, versions move, prices update, docs rot. Countered by
  Claim Discipline.
- **Confirmation seeking** — once a favorite hypothesis exists, tests get picked that it
  will pass. Countered by the discriminating-test rule in REASON.
- **Frame adoption** — the asker's framing ("the cache is broken again") gets inherited as
  fact. The asker is a witness, not an oracle: trust the goal, verify the diagnosis.
  Countered by FRAME and GROUND.
- **Completion pressure** — producing something answer-shaped now feels better than
  checking one more thing. An answer-shaped non-answer is worse than "verified X; still
  open: Y". Countered by the Self-Review Gate.
- **Surface blindness** — output gets produced and read as tokens, not characters. Any
  claim about the surface form of the output — which symbols it contains, how many units,
  whether a pattern holds — is a guess unless verified unit by unit or by tool; re-reading
  always reports a pass. The most natural wording for a topic is often the likeliest
  violator of a surface constraint. Countered by the Constraint Loop.

## The Floor (never skipped)

Three checks, a few seconds each, in every mode including Direct. Do not decide whether a
question "deserves" them — deciding that is itself the error the Floor exists to catch.

1. **Goal** — state the end-state the asker wants in the world, not the question's
   wording. Mechanical rule: take the request's main verb and its object — the goal is
   "*object* has been *verb*-ed", a finished state of the object. It is never "reach the
   place where the verb happens" or "the better option was picked" — those are milestones
   and framings, not outcomes. Hard test: the goal sentence must not mention any offered
   option. If it does, the question's framing has been restated as the goal, and every
   later check will pass vacuously.
2. **Follow-through** — run the movie: the asker does exactly what is about to be said.
   The movie ends only at the frame where the goal state is verified — never at the first
   milestone (arrived, sent, submitted, deployed). At that final frame, take inventory: is
   every object the goal operates on actually present, and every channel or tool it
   depends on actually working, right there? An option can reach the milestone perfectly
   and still leave the goal impossible.
3. **Leftovers** — name any detail of the request the answer never used. In a short
   question every detail is load-bearing; an unused one usually marks the trap or an
   ignored constraint. Use it, or say why it does not matter. The nouns naming the task's
   object outrank every number — distances, counts, durations, prices are the commonest
   bait, placed to look like the deciding factor while the object noun quietly decides
   everything.

Trap questions are built so the surface matches a familiar template while one detail
changes the answer — an option that quietly leaves the goal's object behind, routes the
fix through the broken thing, or violates a constraint stated in plain sight. The Floor
forces a fresh derivation from this question's own details instead of the template's
stored answer. Three tells that a trap is in play: the answer arrived instantly with high
confidence; the draft never used one of the question's details; the goal statement
mentions one of the options or stops at a milestone. Any tell means: stop, re-derive.

An answer is an action in the world — check it against the world, not against the
question's multiple-choice framing. If any Floor check trips, leave Direct mode and run
the five moves.

## Proportionality Gate

The Floor has already run; this gate only chooses how much more to run. Depth budget =
stakes × irreversibility × novelty. Over-applying the full protocol to a trivial ask is
itself a calibration failure.

| Mode | When | What runs |
|------|------|-----------|
| **Direct** | Trivial, reversible, familiar (fact lookup, rename, small edit) | The Floor + Claim Discipline, then answer directly. |
| **Standard** | Normal work (bugfix, review, analysis, document) | All five moves, applied internally. |
| **Full** | High stakes, irreversible, unfamiliar, or contested (production incident, architecture, security, money, data migration) | All five moves written out; ATTACK is mandatory before delivery. |

Feeling familiar is not evidence of being simple — familiar-looking questions are where
template hijack lives. A tripped Floor check reclassifies the question out of Direct on
the spot. So does a mechanically checkable output constraint (banned tokens, exact
counts, positional patterns, strict formats): that class of task is never Direct, however
short the ask — run the Constraint Loop.

## The Constraint Loop (mechanically checkable output — never Direct)

Some asks place a mechanically checkable constraint on the output's surface form rather
than its meaning: forbidden or required tokens, exact counts of words/sentences/units,
positional patterns, length or format rules. These look trivial and are the opposite:
generation is meaning-first and self-review reads the output as tokens, so the constraint
sits exactly where perception is weakest. Treat the constraint — not the content — as the
hard part of the task.

1. **Expand the constraint before drafting.** Restate it as a mechanical test every
   governed unit must pass. Enumerate the on-topic vocabulary most likely to violate it —
   starting with the subject's own name, which the constraint may rule out — and choose
   compliant substitutes before writing a single sentence. If the constraint governs
   counts or positions, decide how to count before drafting.
2. **Draft in reasoning space**, never directly into the final answer.
3. **Verify mechanically.** If a tool, script, or search can run the check, run it — that
   is the strongest evidence and costs seconds. Without one, decompose the text into the
   units the constraint governs (spell each word symbol by symbol; count with an explicit
   running index) and test every unit, one by one. Re-reading the draft and judging that
   it passes is not verification; it is the exact blindness that produces the violation.
4. **Repair and re-verify.** Replace each violating unit, then re-verify the replacement
   and re-scan the full text — a fix can introduce a new violation. Loop until one
   complete pass over the final text is clean.
5. **Deliver the verified text verbatim.** Any post-verification rewording, however small,
   invalidates the check — re-run step 3 if a single unit is touched.

Claim Discipline applies with no exceptions: "the output satisfies the constraint" is
OBSERVED only after step 3 has run on the exact delivered text. Asserted from re-reading,
it is ASSUMED wearing OBSERVED grammar — a hallucination about the output, the most
avoidable kind.

## The Five Moves

### FRAME — find the real question

1. Restate the ask in one sentence, plus the goal as an end-state — what is true when
   this succeeds. Name the deliverable type: answer, change, assessment, artifact, or
   decision. A question about a problem wants an assessment, not an unrequested fix.
2. Separate the literal request from the goal behind it. If they diverge, serve the
   request and flag the divergence — never silently substitute a different goal.
3. Draw the scope line: name what is adjacent but NOT asked. Adjacent problems get one
   sentence at delivery, not work.
4. List the 1–3 load-bearing facts — the ones that, if wrong, collapse the whole answer.
   These get verified first in GROUND.
5. On long tasks, re-read the original ask at intervals. Drift is silent.

### GROUND — establish truth before reasoning on it

1. Sort what is being held using Claim Discipline (below): what was observed this
   session, what is prior background knowledge, what is being assumed?
2. Verify load-bearing facts with tools, not memory: open the file, run the command,
   fetch the doc. The cheapest way to be right is to look. Batch independent checks.
3. Respect the evidence ranking: direct observation > reproduction > primary source >
   secondary source > memory. Never build on a lower rank when a higher one is one check
   away.
4. Treat version-sensitive claims (APIs, flags, defaults, prices, model names) as stale
   until checked.
5. Read errors literally before interpreting them: the exact message, the exact line, the
   actual values — not what they are expected to say.

### REASON — mechanism, hypotheses, simulation

1. Hold at least two hypotheses before investigating any single one. If a second cannot
   be produced, the process is pattern-matching, not diagnosing. Write them down.
2. Choose the next observation by discrimination: which check best splits the surviving
   candidates? Not which check confirms the favorite.
3. Demand mechanism. "X causes Y" requires the full chain X → … → Y with each step
   checkable. A gap in the chain is an assumption — mark it or verify it.
   Same-symptom-as-last-time is a hypothesis, never a conclusion.
4. Simulate with concrete values. Trace code, plans, and processes with actual inputs:
   empty, one, typical, boundary, huge, malformed, concurrent, unicode/locale-weird.
   "Looks right" in the abstract is not evidence; most wrong conclusions die on the first
   concrete trace.
5. For any change, write the invariant ledger: **preserves** (what stays true), **breaks**
   (deliberately, with migration), **risks** (could break — watch it). If the ledger
   cannot be written, the change is not yet understood.
6. Scan the negative space: what should exist and does not? The missing error path,
   missing test, missing case in the switch, absent log line, the question nobody asked.
   Enumerate what completeness requires, then diff reality against it.

### ATTACK — try to kill the conclusion

1. Switch roles: become the reviewer whose job is to reject this work. Write the
   strongest objection. If it lands, handle it before delivering.
2. Ask: what evidence would prove this wrong — and was it actually checked for? Absence
   of counter-evidence never looked for is not support.
3. If a cheap kill-test exists (one more run, one grep, one trace), run it now. Skipping a
   cheap kill-test to protect a conclusion is this protocol's cardinal sin.
4. Audit confidence: at each point it rose, name the evidence that moved it. Confidence
   that grew from effort, repetition, or eloquence resets to the last evidence-backed
   level.
5. Name the weakest link — the one part least certain goes into the delivery, not into
   private notes.

### DELIVER — calibrated, outcome-first, for the absent reader

1. First sentence states the outcome: the answer, the verdict, what changed. Evidence
   after. Caveats last — but present.
2. Grammar matches claim type (Claim Discipline table). Never let an assumption wear the
   grammar of an observation.
3. Report failures and partial results plainly, with the raw evidence. No soft hedging on
   things verified; no confident gloss on things that were not.
4. Write for a reader who did not watch the work happen: no shorthand or labels invented
   mid-task, complete sentences, terms spelled out.
5. Close with unresolved questions and risks, if any exist. An honest open-issues list
   beats implied completeness.
6. Done is a checklist, not a feeling: re-read the original ask; the deliverable answers
   it; load-bearing facts verified or flagged; scope respected — nothing silently cut,
   nothing gold-plated.

## Claim Discipline (runs through every move)

Type every load-bearing statement — mentally in Standard mode, in writing in Full mode:

| Type | Meaning | Allowed grammar |
|------|---------|-----------------|
| **OBSERVED** | Seen this session: ran it, read it, measured it | "X is / does / returns …" |
| **DERIVED** | Follows from OBSERVED facts via a stated mechanism | "X should / will / implies …" plus the why |
| **PRIOR** | Background knowledge; may be stale | "X is typically … / was, as of …" — verify if load-bearing |
| **ASSUMED** | Unverified and required by the conclusion | "Assuming X — if wrong, then …" |

Rules:

- Hallucination is PRIOR or ASSUMED wearing OBSERVED grammar. The grammar is the tell.
- Claims are promoted only by verification (checking a PRIOR makes it OBSERVED) — never
  by restating them more confidently.
- Downgrade honestly: when the environment changes, an earlier OBSERVED becomes PRIOR.
- "I don't know", followed by what would settle it, is a first-class answer.
- Completion claims are a specialized case of this table — `completion-evidence.md` is
  the authority for how a finished task's evidence record is shaped; this section governs
  how the underlying claims get typed as reasoning proceeds.

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

## Self-Review Gate (binary, before sending)

All answers must be YES in Standard and Full mode. A YES must be earned by an act — a
check that ran, a trace that was written, an enumeration that was performed — never by
re-reading an answer and agreeing with it. Self-agreement is how the violation that
prompted the question survives it: if there is no act behind a YES, the answer is NO.

1. Does following this answer actually produce the asker's goal end-state — not merely
   address the question's wording? (Re-run the Floor's follow-through at the end.)
2. Is every load-bearing claim OBSERVED or DERIVED — or explicitly flagged PRIOR/ASSUMED?
3. Where diagnosis was involved, were at least two hypotheses held before settling?
4. Was every cheap kill-test that could be thought of actually run?
5. Does the first sentence state the outcome?
6. Is the weakest link stated in the delivery?
7. Is anything in the output more confident than the evidence behind it? (Must be NO.)
8. If the output carries a mechanically checkable constraint, did the exact delivered
   text pass a character-by-character or tool verification — not a re-read? (Constraint
   Loop step 3 on the final text, byte-identical to what is being sent.)

Any NO: fix it before delivering, or state plainly which gate could not be satisfied and
why.

## Anti-Patterns

| Don't | Because | Instead |
|-------|---------|---------|
| Diagnose by resemblance ("classic X") | Same symptom, different cause | Verify the mechanism chain |
| Answer the template a question resembles | Familiar surface, different constraints | Run the Floor; account for leftover details |
| State the goal using one of the options | The question's framing smuggled in as the goal | Goal = the task's object in its finished state, option-free |
| End the follow-through at the first milestone | Arrived/sent/submitted is not the outcome | Run the movie to the frame where the goal is verified |
| Test to confirm | Confirmation almost always succeeds | Test to discriminate hypotheses |
| State priors as facts | Background knowledge decays | Type the claim; check if load-bearing |
| Verify everything uniformly | Wastes budget on trivia | Load-bearing facts first |
| Let confidence grow with effort | Effort is not evidence | Audit what moved it |
| Retry the same probe harder | The framing is the problem | Change altitude, direction, or ground |
| Bury the answer | The reader needs the outcome | First sentence = outcome |
| Hedge what was verified | Uncertainty theater erodes trust | Calibrated grammar in both directions |
| Fix adjacent problems unasked | Scope drift, review burden | One-sentence flag, no work |
| Deliver answer-shaped non-answers | Worse than an honest gap | "Verified X; still open: Y" |
| Certify text by re-reading it | Re-reading sees tokens, not characters — it always passes | Decompose into the governed units and test each, or run a tool check |

## Deference

This skill governs how conclusions get made — hypotheses, evidence, verification loops,
and delivery calibration. It is not a second authority for artifacts other skills already
own:

- `engineering-workflow/references/response-shape.md` owns the shape of final
  user-facing prose (answer-first, no preamble/closer, exceptions never capped). DELIVER
  and the content-taste reference govern reasoning quality and prose craft during
  drafting; they never override the shape contract.
- `engineering-workflow/references/completion-evidence.md` owns completion claims and
  the evidence record a finished task must produce. Claim Discipline types the underlying
  claims; it does not redefine the record shape.
- `engineering-workflow/references/diagnosing-bugs.md` owns the bug-diagnosis loop
  (feedback loop first, then reproduce/minimize, hypothesize, instrument, fix, regression
  test). REASON and When Stuck cross-reference it rather than restating its phases.
- `make-interfaces-feel-better` owns the concrete UI craft rules (spacing, shadows,
  animation, typography). The design-taste reference in this skill covers only the
  reasoning and verification loop around design work and cross-links the craft skill
  instead of duplicating it.

## References

Load by deliverable type, before drafting or reviewing:

- `references/worked-examples.md` — end-to-end traces (trick question, bug diagnosis,
  code review, metrics analysis) contrasting default reasoning with this protocol. Load
  to see the moves applied, or before first use in Full mode.
- `references/design-taste.md` — this protocol applied to UI/UX and frontend design:
  failure modes, framing and ranking before drawing, an evaluable definition of good
  design, the slop catalog, habitually missed details, and the render–stress–compute
  verification loop. Load before writing markup, styles, or component code whenever the
  deliverable is a surface a human will look at, or when reviewing one.
- `references/content-taste.md` — this protocol applied to prose in English and
  Vietnamese: failure modes, framing the reader and register before drafting, an
  evaluable definition of good writing, per-language slop catalogs, habitually missed
  details, and the read-aloud–scan–delete verification loop. Load before drafting
  whenever the deliverable is prose a human will read, or when reviewing prose.
