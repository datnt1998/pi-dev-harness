<!-- pi-harness-attribution:v1 {"source":"conversation","purpose":"production"} -->
# Review graph: navigation map for token-lean reviews

Status: draft
Owner: harness maintainer

## Problem

Reviewers spend most of their token budget on navigation, not judgment: repo-wide greps to
find who imports a changed file, full-file reads to locate the guard tests, repeated
orientation passes that every fresh reviewer pays again. The delegating agent already knows
the diff; nobody hands the reviewer a map of what the diff touches.

## Goal

A deterministic, dependency-free map generator: given a change set, emit a compact markdown
"review map" the delegating agent plants into reviewer briefs — changed files with their
export-surface deltas, direct dependents (blast radius), and guard files (tests importing the
changed files) — so a reviewer navigates by reading the map instead of re-deriving it.

## Non-goals

- No semantic analysis, type resolution, or call graphs; import/export edges only.
- No persistent index or watcher; each run scans fresh (repo-scale full scan is acceptable).
- No external dependencies; node core only, TS/JS surfaces only (`.ts`, `.tsx`, `.js`,
  `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`).
- The map is advisory navigation, not evidence: findings still cite the real files.

## Requirements

### R1 — pure graph core (`lib/review-graph.ts`)

- `parseImports(source)`: extract import/require/export-from/dynamic-import specifiers from
  a source text without executing it. Comments and string literals containing import-like
  text must not produce false edges (line-comment and block-comment stripping is enough;
  perfection is not required, determinism is).
- `parseExports(source)`: extract the named export surface (exported const/function/class/
  type/interface/enum names, re-exports, presence of a default export).
- `resolveSpecifier(fromPath, specifier, fileIndex, packageIndex)`: resolve a relative
  specifier to a repo path against a provided file index (extension probing and `/index.*`
  probing). A bare specifier is first matched against `packageIndex` — a caller-provided map
  of workspace package names to package root directories — so cross-package monorepo imports
  (`@scope/pkg`, `@scope/pkg/subpath`) resolve to repo paths: exact name match probes the
  package root (`src/index.*`, `index.*`, `package.json` main/module fields when provided in
  the index), and a subpath probes under the package root. Bare specifiers with no
  `packageIndex` match resolve as external and produce no edge. tsconfig path aliases are out
  of scope; an unresolved relative or workspace specifier is recorded as unresolved, never
  guessed.
- `buildReviewGraph(input)`: given changed files (with before/after content), all candidate
  repo files with their content, and the file index, produce per changed file: export delta
  (added/removed names), direct dependents, dependents-of-dependents (depth 2, capped and
  marked), and guards — depth-1 or depth-2 dependents whose path matches test naming
  (`.test.` / `.spec.` / `__tests__/`), listed with their depth. Relative specifiers whose
  explicit extension is outside the source set (assets such as css or svg) classify as
  external, never unresolved. Circular import pairs terminate without looping. The
  unresolved list is deduplicated and sorted.
- `formatReviewMap(graph)`: compact markdown — one section per changed file, tables not
  prose, a blast-radius summary line, and an approximate token size of the map itself.
  Deterministic ordering (path-sorted) so two runs over the same tree emit identical maps.
- Pure: no fs, no child_process, no env reads in the lib.

### R2 — extension command (`extensions/review-graph.ts`)

- `/review-map [base..head]`: changed files from `git diff --name-only <range>` plus, when no
  range is given, the dirty tree (`git diff --name-only` + staged + untracked source files).
- Range semantics: changed content (both sides) comes from the range via `git show`, never
  the worktree; importer scanning always reads the working tree — a documented decision
  that keeps scanning subprocess-free and matches what a reviewer will read, with the
  commit-at-boundary review rule making tree and head coincide at review time.
- Candidate importers come from `git ls-files` filtered to source extensions; before-content
  for export deltas from `git show <base>:<path>` when a range is given, index/HEAD otherwise.
- The workspace package index is gathered by reading each tracked `package.json`'s `name`
  (and `main`/`module` when present) — no workspace tool is invoked; a malformed manifest is
  skipped and listed, never fatal.
- Non-git directories, empty change sets, and unreadable files degrade to a clear message,
  never a throw. Files larger than a fixed guard size are skipped and listed as skipped.
- Output: print the map, and offer the same text for brief-planting (the printed block is
  copy-ready; no clipboard integration).

### R3 — brief integration (docs)

- `skills/engineering-workflow/references/code-review.md`: the reviewer brief should carry a
  review map when one is available; a reviewer holding a map does not re-derive it with
  repo-wide searches — it reads the named files and spends its budget on judgment.
- README: command summary and when to use it (before staffing reviewers; after a fix round to
  re-scope the re-review).

## Acceptance

- Unit tests for parse/resolve/build/format cover: comment-shadowed imports, re-exports,
  index resolution, unresolved alias recorded not guessed, guard classification, export
  delta add/remove, deterministic ordering, depth-2 cap marking.
- Extension tests cover: range mode vs dirty mode, non-git degradation, empty change set,
  oversized-file skip listing.
- Full suite and pack check green; no new dependencies.
