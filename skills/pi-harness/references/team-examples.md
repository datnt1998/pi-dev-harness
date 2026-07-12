# Reusable Pi Harness Examples

## 1. Coding Quality Harness

Pattern: Fan-out/Fan-in + Producer-Reviewer

Resources:
- `AGENTS.md`: coding conventions and safety rules.
- `.pi/prompts/review.md`: general review.
- `.pi/prompts/security-review.md`: security angle.
- `.pi/prompts/perf-review.md`: performance angle.
- `.pi/skills/repo-audit/SKILL.md`: orchestrates full audit.

## 2. Research Harness

Pattern: Expert Pool + Supervisor

Resources:
- package: `pi-web-access`
- `.pi/skills/web-research/SKILL.md`
- `.pi/prompts/source-summary.md`
- `.pi/prompts/claim-check.md`

Rules:
- Search first for current facts.
- Fetch original sources.
- Cite URLs.
- Separate facts from inference.

## 3. TUI Product Harness

Pattern: Pipeline

Resources:
- `.pi/themes/product-pro.json`
- `.pi/extensions/product-ui.ts`
- `.pi/prompts/tui-polish.md`
- `.pi/skills/tui-review/SKILL.md`

Rules:
- Preserve Pi critical context visibility.
- Use responsive footer variants.
- Use overlays for detailed views.

## 4. Safe Operations Harness

Pattern: Producer-Reviewer

Resources:
- `.pi/extensions/safe-ops.ts`
- `.pi/skills/deploy-check/SKILL.md`
- `.pi/prompts/preflight.md`

Rules:
- Confirm destructive commands.
- Require explicit environment target.
- Summarize planned changes before execution.

## 5. Reusable Package Harness

Pattern: Hierarchical Delegation

Resources:
- `package.json` with `pi` manifest.
- `extensions/`
- `skills/`
- `prompts/`
- `themes/`

Rules:
- Keep package resources generic.
- Version releases.
- Document install and configuration.
