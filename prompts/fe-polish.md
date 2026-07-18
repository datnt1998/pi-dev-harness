---
description: Full frontend polish pass — React best practices (perf/architecture) + visual/UX detail work on src/ code
---

Run a two-axis frontend polish pass on: $ARGUMENTS

If no target is given, infer it from the current diff and repository frontend conventions; ask only if multiple choices would materially change scope.

## Axis A — React quality (perf + architecture)

Load `/skill:react-best-practices`. Read only the reference categories the
target actually touches. Hunt in priority order:

1. Waterfalls: sequential awaits, fetch-in-effect chains
2. Bundle: heavy imports, missing `React.lazy`, barrel imports
3. Re-renders: state mirrored via effects, missing lazy init, unstable
   props/identities, inline components, memoization used as a band-aid
4. Rendering + client: list virtualization needs, listener hygiene, storage schema
5. Component API: boolean-prop sprawl → variants/compound components

## Axis B — Visual & UX detail

Load `/skill:make-interfaces-feel-better` and apply its full checklist
(concentric radii, optical alignment, icon-swap, stagger/exit animations,
tabular-nums, press scale 0.96, hit areas, `initial={false}`, specific
transition properties). Discover and enforce the repository's visual, copy, accessibility, and file-size conventions.

## Discipline

- Inspect before editing; keep edits small and reversible; files ≤200 lines
  (extract modules/components when over).
- Pure logic changes belong in `.ts` seams with unit tests; hooks/JSX stay thin.
- Do NOT add `useMemo`/`useCallback`/`memo` without pointing at the concrete
  re-render or identity problem it fixes.
- Skip axes that are already clean — empty findings are a valid result.

## Output

1. Findings + changes as Before/After tables grouped by principle/rule
   (cite `file:line`; include every change).
2. Validation: discover and run the affected frontend/workspace's repository-native test and build checks; do not assume npm. Note commands and counts.
3. Commit-ready checkpoint per `/skill:git-rules` — propose a Conventional
   Commit message (`polish(scope): ...` or `perf(scope): ...`), do not commit
   without confirmation.
