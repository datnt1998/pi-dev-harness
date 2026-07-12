# Pi Harness Validation & Testing Guide

Use this checklist after changing Pi resources.

## Reload

- Run or ask the user to run `/reload` after changing `.pi/*`, skills, prompts, extensions, themes, or context files.
- If project trust is required, ask the user to run `/trust` or approve the prompt.

## Resource Checks

- New prompt files appear as slash commands.
- New skills appear as `/skill:<name>`.
- New extension commands appear in slash autocomplete.
- New tools do not conflict with package tools.
- Theme name matches `.pi/settings.json`.

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
