# Session and Artifact Garbage Collection

## Problem

Nothing in the harness or its host reclaims disk from finished agent work. Measured on one
machine (2026-08-10): the host session store held 865MB of transcript JSONL (344 files older
than two weeks), the subagent temp root held 962MB of async run artifacts, and one project's
working tree carried 399MB of `.pi-subagents/artifacts` debug transcripts. Beyond disk, the
in-repo artifacts are an evidence hazard: repo-wide searches that do not respect ignore files
surface old run transcripts, and sealed reviewers then read them — stale claims enter a fresh
context. Retention must be mechanical, not remembered.

## Requirements

- **R1 — Pure planning core.** `lib/gc-core.ts` exposes pure functions that, given injected
  filesystem facts (file list with path, mtime, size, kind) and a retention policy, produce a
  GC plan: per-area candidate lists with age and bytes, plus a summary. No direct fs or clock
  access in planning; the extension supplies facts. Deterministic output ordering.
- **R2 — Three scan areas.** (a) Host session store for the **current project's** slug
  directory (session `.jsonl` files and their sibling same-stem directories); (b) the
  subagent temp root for the current uid (`<tmpdir>/pi-subagents-uid-<uid>/async-subagent-runs/*`
  and sibling transient areas); (c) the project-local `.pi-subagents/artifacts/*`. Area roots
  are parameters with these defaults; unknown layouts are skipped, never guessed.
- **R3 — Protection rules (fail-closed).** A candidate is protected when any of: it is (or
  belongs to) the current session; a run's `status.json` reports a non-terminal state; it is
  newer than the area's retention window; its path does not match the area's known layout.
  Protection beats deletion on any doubt, including unreadable metadata.
- **R4 — Extension surface.** `extensions/session-gc.ts` registers a `/gc` command with
  `status` (per-area totals), `dry-run` (the plan, capped listing plus summary), and `run`
  (delete plan candidates, report per-area reclaimed bytes and any errors). Settings persist
  under the same settings mechanism the autocompact extension uses: `sessionsDays` (default
  30), `artifactsDays` (default 7), `auto` (default off). With `auto` on, one throttled sweep
  per day may run at session start; it must never block or fail the session (all host access
  behind safe wrappers), and it reports one short line only when it reclaimed something.
- **R5 — Deletion is bounded and observable.** `run` deletes only paths present in the
  freshly computed plan, collects errors per path instead of throwing, and never follows
  symlinks out of an area root. The report states bytes reclaimed per area and totals.
- **R6 — Tool-state is never evidence (docs).** `templates/AGENTS.snippet.md` gains one line:
  tool-state directories (subagent artifacts, session logs) are not project evidence; search
  with ignore-respecting tools. `skills/engineering-workflow/references/code-review.md` gains
  one sentence in the reviewer conduct area stating the same for reviewers. README documents
  the `/gc` command, defaults, and the retention warning (deleting a session removes its
  resume history).

## Non-goals

Compression, archival, cross-machine sync, cleaning other projects' session directories in
auto mode, and any change to how the host or the subagent package writes these files.

## Risks

- Deleting a session file removes `/resume` for it; mitigated by conservative defaults,
  dry-run-first command shape, and the protection rules in R3.
- Async run state files may change shape across subagent package versions; mitigated by
  fail-closed layout matching (R2/R3) — unknown shapes are skipped.
