# Known Failure Modes and Anti-Patterns

The failure catalog behind the reasoning-discipline protocol. Load when calibrating against a suspected failure mode, when writing or reviewing reasoning-heavy work in Full mode, or when a countermeasure's rationale is contested.

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
