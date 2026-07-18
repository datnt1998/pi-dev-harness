# Pi Harness Validation & Testing Guide

Use this checklist after changing Pi resources.

## Reload

- Run or ask the user to run `/reload` after changing `.pi/*`, skills, prompts, extensions, themes, or context files.
- If project trust is required, ask the user to run `/trust` or approve the prompt.

## Resource Checks

- New prompt files appear as slash commands.
- New skills appear as `/skill:<name>`.
- New extension commands appear in slash autocomplete.
- New tools do not conflict with package/project tools.
- `safe-ops` loads once; ticket-runner commands and `batch_next`/`batch_report` load once.
- Theme name matches `.pi/settings.json` when a project theme exists.

## UI Checks

- Footer remains readable at narrow widths.
- Critical data remains visible:
  - cwd/path
  - model
  - context used/max
  - context percentage
  - thinking level
  - tokens/cost where relevant
- Overlays close with Escape/Ctrl+C or documented keys.
- Custom UI cleans up on reload/shutdown.

## Safety Checks

- Destructive commands require confirmation.
- Secret files are not read or printed unless explicitly needed.
- Local/private URLs are blocked for generic web fetchers.
- External packages are reviewed before install.

## Drift Audit

Look for:

- Skills with project-specific names that should be reusable.
- Dead commands documented in `AGENTS.md` but not registered.
- Extensions with stale status widgets after reload.
- Duplicate tools from local extensions and installed packages.
- Overly large `AGENTS.md` or `APPEND_SYSTEM.md` content that should move to skills.

## Package Checks

- `npm test` passes in the package.
- `npm pack --dry-run` includes extensions, libs, skills, prompts, templates, README, and LICENSE.
- Consumer SDK reload has zero extension/resource diagnostics and tool-name conflicts.
- Copied local skill/prompt names are removed or backed up after package cutover.
- Product identity, TUI/theme, memory implementation, credentials, and deploy rules stay in consumer-owned resources unless separately packaged.
