---
name: react-doctor
description: "Deterministically scan the React frontend (src/) for state/effect, performance, architecture, security, and accessibility issues via the react-doctor CLI, then triage and fix by severity. Use after finishing a feature, before committing React changes, when the user runs /react-doctor, or asks to scan/triage/clean up React diagnostics or check for a health-score regression."
---

# React Doctor

Deterministic React code scanner. Complements `/skill:react-best-practices`
(heuristic review) with a tool that actually scans `src/` and reports a
0-100 health score across state & effects, performance, architecture,
security, and accessibility. Built on oxlint.

Adapted for Pi from `millionco/react-doctor` by Aiden Bai (MIT). This project
is a **Vite + React 19 SPA** — every React file lives under `src/`, so the
scanner applies directly; there are no Next/RSC/React-Native concerns here.

The CLI is run on demand via `npx` (no dependency added to `package.json`).

**Telemetry vs score tradeoff (verified):** `--no-telemetry` also disables the
0-100 numeric score (react-doctor gates the score behind telemetry) — you still
get the full per-severity issue breakdown. So:
- Regression checks that compare the **score** must run WITHOUT `--no-telemetry`.
- Privacy-first full scans can use `--no-telemetry` and triage by the severity
  counts (Security/Bugs/Performance/Accessibility/Maintainability) instead.

## After making React code changes (regression check)

Run against only what changed and confirm the score did not drop:

```bash
npx react-doctor@latest --verbose --scope changed
```

If the score regressed, fix the newly introduced issues before you prepare a
commit-ready checkpoint. This slots into the engineering-workflow validate
step alongside `npm run test` + `npm run build`.

## Full cleanup pass (whole codebase)

```bash
npx react-doctor@latest --verbose            # with score
npx react-doctor@latest --verbose --no-telemetry   # private, severity counts only
```

Fix by severity: errors first, then warnings. Keep edits small and reversible;
respect the project's conventions (ADR-0017 flat/no-shadow, pastel chips never
accent/CTA, Vietnamese UI copy, files under ~200 lines).

## /react-doctor — full local triage workflow

When the user runs `/react-doctor`, says "run react doctor", or asks for a full
triage/cleanup pass (not just a regression check), fetch the canonical
local-triage playbook and follow every step in it:

```bash
curl --fail --silent --show-error \
  --header 'Cache-Control: no-cache' \
  https://www.react.doctor/prompts/react-doctor-agent.md
```

The playbook is the single source of truth: a scan -> filter -> triage -> fix ->
validate loop that edits the working tree directly. It **never commits and never
opens PRs** — that stays with `/skill:git-rules` after the user reviews the diff.
Pair it with per-rule recipes fetched on demand from
`https://www.react.doctor/prompts/rules/<plugin>/<rule>.md`.

If `curl` has no network, fall back to the plain scan commands above and triage
by severity manually.

## Configuring or explaining rules

When the user wants to understand a rule, disagrees with one, or wants to tune
which rules run (not fix code), read [references/explain.md](references/explain.md)
and follow it. Start with `npx react-doctor@latest rules explain <rule>`, then
apply the narrowest control (`rules disable|set|category|ignore-tag`), which
edits `doctor.config.*` (or `package.json#reactDoctor`) in place.

## Command reference

```bash
npx react-doctor@latest --verbose --scope changed --no-telemetry
```

| Flag              | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `.`               | Scan current directory                                           |
| `--verbose`       | Show affected files and line numbers per rule                    |
| `--scope changed` | Only report issues introduced vs the base branch (default: full) |
| `--scope lines`   | Only report issues on the changed lines                          |
| `--score`         | Output only the numeric score (cannot combine with `--no-telemetry`) |
| `--no-telemetry`  | Disable anonymous reporting; also disables the numeric score     |

## Relationship to the rest of the harness

- **`/skill:react-best-practices`** — human-curated rules for how to write
  components/hooks; use while authoring. `react-doctor` verifies the result.
- **`/fe-polish`** — two-axis FE pass; run `react-doctor --scope changed` as its
  objective gate before the commit-ready checkpoint.
- **`/skill:git-rules`** — the scanner never commits; you do, after review.
