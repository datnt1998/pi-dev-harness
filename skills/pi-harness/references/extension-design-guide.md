# Pi Extension Design Guide

Extensions are TypeScript modules that can add tools, commands, UI, event hooks, providers, renderers, and safety gates.

## Use Extensions For

- Custom LLM tools.
- Slash commands with logic.
- TUI widgets, overlays, footers, headers.
- Permission gates and path protection.
- Provider/model registration.
- Tool result rendering.
- Session-aware state.

## Avoid Extensions For

- Simple reusable instructions → use skills.
- Static prompt snippets → use prompt templates.
- Color changes → use themes.

## Safety Rules

- Extensions execute local code; keep them auditable.
- Avoid destructive operations without confirmation.
- If adding UI/status/timers, cleanup on `session_shutdown`.
- Do not hide critical Pi footer/header data unless explicitly requested.
- Avoid duplicate tool names with installed packages.

## TUI Rules

- Use responsive layouts.
- Each rendered line must fit the provided width.
- Use overlays for detailed information.
- Keep widgets non-intrusive.
- Preserve cwd/path, model, context usage, context %, max context, thinking level, tokens, and cost.

## Tool Rules

- Tool names should be generic and stable.
- Provide useful `promptSnippet` and `promptGuidelines`.
- Return structured `details` for rendering and future retrieval.
- Block local/private URLs for web fetch tools unless explicitly intended.

## Package Boundary

If an extension becomes useful across projects, convert it into a Pi package with a `pi` manifest instead of copying it between projects.
