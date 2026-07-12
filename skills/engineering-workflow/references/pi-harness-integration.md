# Pi Harness Integration

Use this reference when normal engineering work touches Pi agent resources.

## Boundary Rule

Use `/skill:pi-harness` before or alongside this skill when work changes:

- `AGENTS.md`
- `.pi/APPEND_SYSTEM.md` or `.pi/SYSTEM.md`
- `.pi/settings.json`
- `.pi/skills/`
- `.pi/prompts/`
- `.pi/extensions/`
- `.pi/themes/`
- installed Pi packages or package configuration

## Flow for Harness-Related Engineering Work

1. **Harness audit** — use `pi-harness` Phase 0 to inspect existing resources and detect drift/conflicts.
2. **Engineering alignment** — use `grill-with-docs` if the desired capability or workflow is unclear.
3. **Harness design** — use `pi-harness` to decide skill vs prompt vs extension vs theme vs package.
4. **Spec/tickets** — use `to-spec` and `to-tickets` if the change is large.
5. **Implementation** — use `implement` for approved edits.
6. **Validation** — use both harness validation and engineering checks.
7. **Handoff** — record changed resources, commands, tools, reload needs, and package assumptions.

## Common Decisions

- Static instruction? → `AGENTS.md` or `.pi/APPEND_SYSTEM.md`.
- Reusable workflow? → `.pi/skills/<generic-name>/SKILL.md`.
- Frequent slash command? → `.pi/prompts/<generic-name>.md`.
- Tool/TUI/event logic? → `.pi/extensions/<generic-name>.ts`.
- Color only? → `.pi/themes/<name>.json`.
- Useful across projects? → Pi package or global resource.

## Safety

- Do not hide Pi critical visibility in custom TUI.
- Avoid project-specific names for reusable resources.
- Avoid duplicate tool names with installed packages.
- Mention `/reload` after Pi resource changes.
