# Evidence Binding

What makes a proof binding rather than decorative. Callers point here instead of restating these rules.

Lifecycle: living reference. The engineering-workflow maintainers reconcile it whenever the binding-proof rules change.

## Bind to the thing, not a copy

A proof binds to the implementation, never to a copy of it. Artifact text a proof carries — SQL, query plans, projected rows, serialized output — is captured from the implementation at run time, or the site names which other guard actually bites in its place. A held-over hand-written copy of the artifact can stay green while the named behavior breaks; that is not a binding proof.

The test of a proof is a mutation of the implementation: change what the proof names and watch the proof die. A proof that survives a meaning-changing mutation of the thing it claims to check was never bound to it.

## Expected values come from authority

Expected values come from authority, never pasted back from the code's own output. A figure is either quoted from an authority (with citation) or derived from a named rule and labeled as such; neither may pretend to be the other.

A test's name is a claim. When a defect was asserted under a name that endorsed it, renaming the test is part of the fix.

## Cardinality witnesses

A fixture whose shape is too narrow to distinguish the guarded case leaves that case unguarded. Cover, per claim:

- a tie on every tie-broken sort key (for a nullable key, at least two rows in the null bucket);
- a parent with more than one child under every 1:many join with a limit or aggregate;
- a subject on the far side of every isolation boundary claimed proved.

## Positive control for absence

An absence-shaped assertion carries a positive control: a subject the same probe must find the needle in. A probe that finds nothing anywhere is inert, not proof of absence.

## Tier blindness

Tier blindness is declared, not discovered. When a contract's only guard lives in another test tier, the site or its spec says so, and a green run of the blind tier is never presented as covering it.

## Pointers

- `code-review.md` (Axis A) — falsification method that attacks these proofs.
- `tests-and-mocking.md` — tautological-test and mocking rules.
- `completion-evidence.md` — the completion record these bindings support.
