---
description: Scan the React frontend (src/) with react-doctor, then triage and fix diagnostics by severity
argument-hint: "[changed|full|<area>] (default: changed)"
---

Use `/skill:react-doctor` to scan and clean up the React frontend for:

$ARGUMENTS

Rules:
- Default scope is `changed` (regression check vs the base branch). Use `full`
  only when the user asks for a whole-codebase cleanup.
- For a full triage pass, fetch and follow the canonical playbook from the skill
  (`https://www.react.doctor/prompts/react-doctor-agent.md`); it edits the working
  tree but never commits.
- Fix by severity (errors first, then warnings). Keep edits small and reversible
  and honor project conventions (ADR-0017 flat/no-shadow, pastel chips never
  accent/CTA, Vietnamese UI copy, files under ~200 lines).
- This CLI runs via `npx` and needs network; if it is unavailable, say so and
  fall back to `/skill:react-best-practices`. Note `--no-telemetry` also disables
  the numeric score, so omit it when the regression gate compares scores; use it
  only for privacy-first scans triaged by severity counts.
- After fixing, re-run `--scope changed` plus `npm run test` + `npm run build`,
  then prepare a commit-ready checkpoint via `/skill:git-rules` (do not commit
  without the user's go-ahead).
