# The Constraint Loop

The full procedure for output that carries a mechanically checkable surface constraint (banned or required tokens, exact counts, positional patterns, strict formats). The core skill's Proportionality Gate owns the trigger; this file owns the procedure.

## The Loop

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
