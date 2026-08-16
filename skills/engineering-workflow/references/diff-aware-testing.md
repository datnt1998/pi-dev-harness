# Diff-Aware Test Selection

Use this reference during `implement` and `code-review` to map a diff to the smallest behavioral checks that can prove the changed application-owned behavior. `testing-strategy.md` is the normative policy for ordering, escalation, failure handling, concurrency, specialized tests, and full-suite gates.

## Change-set discovery

Resolve the diff surface through Git, consistent with `code-review.md`'s Fixed Point rules:

- worktree diff (staged plus unstaged, including relevant untracked files) during active implementation;
- an explicit fixed point (`git diff <fixed-point>...HEAD`) when reviewing a branch, PR, or completed slice.

```bash
git diff --name-only [<fixed-point>...HEAD]
git diff --name-status [<fixed-point>...HEAD]   # catch renames (R entries)
```

## Mapping strategies

Use repository evidence and choose the narrowest binding guard. More than one strategy may apply.

| Strategy | Pattern | Default action |
|---|---|---|
| A — Co-located | `foo.ts` → `foo.test.ts` or `__tests__/foo.test.ts` | Run the single related file/case. |
| B — Mirrored test directory | `src/foo.ts` → `test/foo.test.ts` | Run the mirrored file/case. |
| C — Reverse import graph | tests import the changed module | Run only guards whose public seam covers the changed behavior. |
| D — Boundary/config/helper | package manifest, compiler config, integration adapter, fixture, mock, or test helper changed | Run focused owning guards, then the affected package/workspace or integration gate when semantics can fan out. |
| E — High fan-out public surface | shared barrel/index, public types, common runtime, many importers | Run focused owning guards plus the smallest affected package/workspace gate; reserve the full repository suite for repository-required or release gates. |

## Escalation rules

Escalate beyond the focused test only when one of these holds:

- the acceptance criterion crosses a real module, process, persistence, network, package, extension, or browser boundary;
- a focused double declares tier blindness for a load-bearing behavior;
- changed config/test infrastructure can alter the affected package/workspace's test meaning;
- mapped focused guards cannot bind the claimed behavior;
- repository policy explicitly requires a broader gate.

Run the full suite only when the user requests it, repository policy/CI requires it for the change, high-fan-out infrastructure makes narrower repository evidence insufficient, or release/version/publish work reaches its declared gate. A config/helper/barrel change is a reason to assess and often broaden the affected workspace—not an automatic command to run every test in the repository.

## Pitfalls

- Barrel/`index` files are high fan-out, but full-repository execution is still gate-driven.
- Fixtures, mocks, and other test helpers require a fidelity and fan-out assessment; do not silently trust existing green tests.
- Check `git diff --name-status` for rename (`R`) entries; a rename can hide a strategy-A match under the old path.
- A broad green suite does not replace a missing direct guard for the changed acceptance criterion.
- Static checks are selected separately under `testing-strategy.md`; this file maps behavioral tests.

## Unmapped files

A changed behavior with no mapped guard is a coverage gap, not a silent skip. Report it with a suggested application-owned seam. A documentation-only or non-behavioral file can be marked `not-applicable` with the appropriate structural/content validation instead of inventing a behavioral test.

## Selection report

```text
Diff-aware selection: analyzed N changed files
  Changed:  <files>
  Owned behavior: <public seams / acceptance criteria>
  Mapped:   <test files or cases> (strategy used)
  Unmapped: <behavior/files with no binding guard> — suggested seam
  Broader gate: none | <package/workspace/integration command + reason>
  Full suite: not-needed | <command + repository/release reason>
```

Reuse `code-review.md`'s Fixed Point resolution rather than reimplementing diff scoping here.
