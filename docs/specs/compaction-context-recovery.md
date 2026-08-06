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

- **R1 — Activity tracking (pure).** `lib/autocompact-core.ts` gains pure, tested functions that scan session-branch entries and extract:
  - **skill activations**: user messages invoking `/skill:<name>` and tool calls/results referencing a path ending in `skills/<name>/SKILL.md` (both detection routes; name plus best-known path recorded once per skill);
  - **effort directories**: paths matching `.scratch/<effort>/` in message or tool text (deduplicated effort names).
  Scanning is incremental-friendly: callers pass a slice of entries; the extension owns the cursor. Malformed/unknown entry shapes are skipped, never thrown on.
- **R2 — Steered summary.** When the extension triggers compaction (auto or `/autocompact now` without explicit instructions), the effective custom instructions are the user's configured focus (if any) composed with an auto-generated preserve block naming: active skills (names + paths), active effort directories, current task/phase state, and any open lease/batch state. A pure `buildCompactionFocus` composes this; explicit `now <instructions>` still wins unchanged. Native/overflow compaction cannot be steered — R3 covers it.
- **R3 — Post-compaction re-orientation.** On `session_compact` (any source), when observations exist and the feature is enabled, the extension sends one follow-up user message (`pi.sendUserMessage`, `deliverAs: "followUp"`) built by a pure `buildReorientationMessage`: previously active skills with paths ("re-read before acting under a skill — do not act from summarized memory"), active effort directories ("re-read the effort's index/tickets before continuing it"), and a reminder that always-loaded project rules remain in force. No message when nothing was observed. The branch-scan cursor resets after compaction; in-memory observations survive it.
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
- Detection is heuristic (string patterns); false negatives acceptable, false positives limited by the two narrow patterns.
- Consecutive compactions re-inject each time by design (each compact wipes context again).

## Validation Plan

`npm test`, `npm run pack:check`; sealed two-axis review (Falsification / Adversarial authority).
