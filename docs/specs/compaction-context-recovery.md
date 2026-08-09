# Spec: Compaction context recovery

> **Lifecycle:** update or delete this spec in the same change that alters the shipped behavior below. Code and tests are the source of truth.
>
> **Motivating failure:** in long pane sessions, auto-compaction summarizes away conversation history — including skill content loaded via `/skill:` commands, reference files read by tools, and the working-effort context. The always-loaded overlay (`AGENTS.md` / `.pi/APPEND_SYSTEM.md`) survives by design, but after compaction the agent acts on a faded memory of skill rules it believes it still knows. Nothing today re-orients it.

## Goal

After any compaction (extension-triggered, native idle, or overflow), the session is re-oriented: the compaction summary is steered to preserve harness-critical state, and a follow-up message names the skills and efforts that were active with an instruction to re-read their files before acting under them — without re-injecting full skill bodies.

## Non-goals

- No re-injection of full SKILL.md/reference contents post-compact (that re-spends the tokens compaction just reclaimed; re-read-on-demand is the contract).
- No changes to Pi's native compaction mechanics, `compaction.reserveTokens` sync, existing trigger/warning/indicator behavior, or `templates/APPEND_SYSTEM.md` (release-gated by the response-quality eval; the prose rule goes in `templates/AGENTS.snippet.md` instead).
- No persistence of observations across process restarts (in-memory per session; `session_start` rescans the branch).
- No new extension: this extends `autocompact` (lib + extension + tests).

## Requirements

- **R1 — Activity tracking (pure, usage signals only).** `lib/autocompact-core.ts` gains pure, tested functions that scan session-branch entries and extract:
  - **skill activations**: user messages invoking `/skill:<name>`, and tool-call **arguments** referencing a path ending in `skills/<name>/SKILL.md` (deliberate file access; name plus best-known path recorded once per skill);
  - **effort directories**: `.scratch/<effort>/` paths in user messages or tool-call arguments (deduplicated effort names).
  **Mentions are not usage**: tool results, assistant prose, and bare path mentions in user text are never scanned — a directory listing, grep, or pack output names every skill in the repository and would otherwise mark the whole catalog active. User messages carrying the re-orientation sentinel (the extension's own follow-ups, which name paths) are skipped entirely so a follow-up can never re-seed the next window. Scanning is incremental-friendly: callers pass a slice of entries; the extension owns the cursor. Malformed/unknown entry shapes are skipped, never thrown on.
- **R2 — Steered summary.** When the extension triggers compaction (auto or `/autocompact now` without explicit instructions), the effective custom instructions are the user's configured focus (if any) composed with an auto-generated preserve block naming: active skills (names + paths), active effort directories, current task/phase state, and any open lease/batch state. A pure `buildCompactionFocus` composes this; explicit `now <instructions>` still wins unchanged. Native/overflow compaction cannot be steered — R3 covers it.
- **R3 — Post-compaction re-orientation (windowed, lazy).** On `session_compact` (any source), when observations exist and the feature is enabled, the extension sends one follow-up user message (`pi.sendUserMessage`, `deliverAs: "followUp"`) built by a pure `buildReorientationMessage`. The message instructs a **lazy** re-read: nothing is re-read immediately; only when next acting under a listed skill or continuing a listed effort is its file re-read instead of trusting summarized memory. Observations are **windowed per compaction**: the follow-up covers only activity since the previous compaction, then the window resets — a skill still in use re-enters the next window on its next sighting (including the agent's own lazy re-read), so stale skills age out instead of being re-announced forever. No message when the window is empty. The branch-scan cursor resets after compaction.
- **R4 — Toggle and status.** New boolean setting `reorient` (default on), normalized like existing fields, persisted the same way, controlled via `/autocompact reorient on|off`, shown in `/autocompact status` and help text. When off, R2's auto-preserve block and R3's follow-up are both suppressed (user focus text still applies).
- **R5 — Teardown safety.** All new ctx access follows the extension's existing stale-ctx discipline (`safeCtx`/`safeCtxAsync`); a session replacement across an await never throws or crashes teardown. `sendUserMessage` failures are non-fatal.
- **R6 — Docs.** README `autocompact` bullet gains the recovery behavior and the `reorient` subcommand; `templates/AGENTS.snippet.md` gains one line: after compaction, do not act on summarized memory of a skill or reference — re-read the file first. Extension docstring updated.

## Acceptance Criteria

1. Pure functions in `lib/autocompact-core.ts` with unit tests: extraction (both skill routes, effort dirs, malformed entries), focus composition (user focus + auto block; explicit instructions win; suppressed when `reorient` off), re-orientation message (skills+efforts; empty → no message), settings normalize/parse/apply/help for `reorient`.
2. Extension tests: post-`session_compact` follow-up sent exactly once with observed content; nothing sent when no observations or `reorient` off; stale-ctx teardown paths still pass.
3. `npm test` green (count grows only by new tests), `npm run pack:check` green, no new files beyond test additions (lib/extension edits in place).
4. README + AGENTS.snippet updated; `templates/APPEND_SYSTEM.md` byte-identical.

## Risks / Edge Cases

- Follow-up injection consumes a small turn after each compaction; gated on observations existing and `reorient` on.
- Detection is heuristic (string patterns); false negatives acceptable by design — the usage-signal narrowing (arguments only, mentions ignored) trades recall for precision, because a false positive costs tokens on every subsequent compaction.
- Consecutive compactions re-orient only on the window of activity between them; a session that stopped using a skill stops paying for its announcement.

## Validation Plan

`npm test`, `npm run pack:check`; sealed two-axis review (Falsification / Adversarial authority).
