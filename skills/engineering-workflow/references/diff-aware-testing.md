# Diff-Aware Test Selection

Use this reference during `implement` and `code-review` to pick focused checks from
a diff, with safe escalation to the full suite. It narrows *which* tests run; it
does not replace the full suite, which still runs at the end when feasible
(`implementation-tdd.md`).

## Change-set discovery

Resolve the diff surface through Git, consistent with `code-review.md`'s Fixed
Point rules:

- worktree diff (staged plus unstaged, including relevant untracked files) during
  active implementation;
- an explicit fixed point (`git diff <fixed-point>...HEAD`) when reviewing a
  branch, PR, or completed slice.

```bash
git diff --name-only [<fixed-point>...HEAD]
git diff --name-status [<fixed-point>...HEAD]   # catch renames (R entries)
```

## Mapping strategies (priority order, first match wins)

| # | Strategy | Pattern |
|---|---|---|
| A | Co-located | `foo.ts` → `foo.test.ts` or `__tests__/foo.test.ts` in the same directory |
| B | Mirrored test directory | `src/foo.ts` → `test/foo.test.ts` (or the repository's mirrored layout) |
| C | Reverse import graph | grep tests that import the changed module |
| D | Config/infra/test-helper change | → full suite |
| E | High fan-out module (many importers, barrel/index files) | → full suite |

## Auto-escalation to the full suite

Escalate when any of these hold:

- a config, infra, or test-helper file changed;
- mapped tests approach the size of the whole suite;
- the full suite is explicitly requested.

## Pitfalls

- Barrel/`index` files are high fan-out — treat any change to one as strategy E.
- Fixtures, mocks, and other test helpers count as config for escalation purposes.
- Check `git diff --name-status` for rename (`R`) entries; a rename can hide a
  strategy-A match under the old path.

## Unmapped files

A changed file with no mapped test is a coverage gap, not a silent skip. Report it
with a suggested test seam.

## Selection report

```text
Diff-aware selection: analyzed N changed files
  Changed:  <files>
  Mapped:   <test files> (strategy used)
  Unmapped: <files with no mapped test> — suggested seam
  Escalation: none | <config/infra/helper change | mapped-tests near full suite | requested>
```

Reuse `code-review.md`'s Fixed Point resolution rather than reimplementing diff
scoping here.
