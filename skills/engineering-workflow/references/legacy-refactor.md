# Legacy Refactor (characterize before you change)

Use when changing, refactoring, or extending code that has **weak or no tests** —
the common brownfield case. The danger is silent behavior change: without a net,
a "pure refactor" can alter what the system does and nobody notices until
production.

Rule: **pin the current behavior first, refactor under green, change behavior
last.** Do not refactor untested code and change its behavior in the same step.

## Characterization vs spec tests

- A **characterization test** locks *what the code currently does*, even if that
  behavior is arguably wrong. Its job is a tripwire, not a judgment.
- A **spec test** locks *what the code should do*. You only write these when you
  deliberately change behavior.

Keep them distinct. When a characterization test encodes a bug you must keep for
now, say so in a comment (WHY), so a later reader does not "fix" the test.

## Loop

1. **Find the seam.** Pick the smallest stable interface around the change: a
   public function, module boundary, CLI, or HTTP endpoint. Test through that seam,
   not private internals, so the tests survive the refactor.
2. **Capture current behavior as golden.** Feed representative and edge inputs
   through the seam and record the actual outputs as the expected values
   (golden/snapshot). Include the messy real inputs that motivated the change.
3. **Make it deterministic.** Pin time, seed RNG, isolate filesystem/network, and
   freeze ordering so the golden values are stable. A flaky characterization test
   is worse than none.
4. **Cover the risky paths first.** Prioritize the code you are about to touch and
   its error/edge branches. You are buying a net under the change, not 100%
   coverage.
5. **Refactor under green.** Restructure with the characterization tests passing
   unchanged. If a test goes red, you changed behavior — revert or make it
   intentional. Commit the pure refactor separately from any behavior change.
6. **Change behavior deliberately.** Now modify behavior; update the affected
   golden values to the new intended output and promote them to spec tests with
   clear names. Every changed golden value is a reviewable behavior decision.

## Scope and escalation

- If the current behavior looks like a bug, do **not** silently "fix" it mid-
  refactor. Characterize it as-is, flag it, and treat the fix as its own approved
  change with its own spec test.
- Stop for unapproved product/API/data/scope decisions surfaced while
  characterizing (e.g. an undocumented contract other code depends on).
- If a seam is impossible to test without a large structural change, that
  structural change is itself the ticket — get it approved before proceeding.

## Report

State the seam, how many characterization/golden cases pin it, that the refactor
kept them green, and list every golden value intentionally changed (each is a
behavior change reviewers must see). Map to `completion-evidence.md`.
