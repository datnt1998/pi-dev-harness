---
description: Scan a React frontend with react-doctor, then triage and fix diagnostics by severity
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
- Fix by severity (errors first, then warnings). Keep edits small/reversible and honor repository visual, copy, accessibility, architecture, and file-size conventions.
- This CLI runs via `npx` and needs network; if it is unavailable, say so and
  fall back to `/skill:react-best-practices`. Note `--no-telemetry` also disables
  the numeric score, so omit it when the regression gate compares scores; use it
  only for privacy-first scans triaged by severity counts.
- After fixing, re-run `--scope changed` plus the repository's test/build checks, then prepare a commit-ready checkpoint via `/skill:git-rules`.
