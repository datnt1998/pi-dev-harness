# Pi Resource Mapping

This guide maps harness concepts to Pi-native resources.

## Resource Types

| Need | Pi resource | Notes |
|---|---|---|
| Project conventions | `AGENTS.md` | Loaded automatically from cwd/parents. Keep stable and concise. |
| System behavior | `.pi/APPEND_SYSTEM.md` | Append to Pi default prompt. Prefer over replacing with `SYSTEM.md`. |
| On-demand workflow | `.pi/skills/<name>/SKILL.md` | Best for reusable domain methods. |
| Slash prompt | `.pi/prompts/<name>.md` | Best for frequent prompt patterns. |
| Tool/command/UI | `.pi/extensions/*.ts` | TypeScript plugin code. Use for actual capabilities. |
| Visual style | `.pi/themes/*.json` | Colors only. |
| Reusable distribution | Pi package | npm/git package with `pi` manifest. |

## Local vs Global vs Package

- Project-local `.pi/*`: best while iterating or for project-specific behavior.
- Global `~/.pi/agent/*`: best for personal defaults used everywhere.
- Package: best when sharing/reusing with versioning.

## Claude-style Concepts to Pi

| Claude-style concept | Pi-native equivalent |
|---|---|
| `.claude/agents` | Skills + role sections + prompts; optional extension command for orchestration |
| `.claude/skills` | `.pi/skills` or `.agents/skills` |
| `CLAUDE.md` | `AGENTS.md` and `.pi/APPEND_SYSTEM.md` |
| Plugin | Pi package or `.pi/extensions` |
| Agent team API | Orchestrator skill, separate Pi sessions, tmux, or custom extension |
| Tool catalog | Extension tools and installed Pi packages |

## Naming Guidance

Reusable names should not include project names.

Good:
- `pi-harness`
- `repo-audit`
- `web-research`
- `release-check`
- `safe-ops`

Project-specific names belong in:
- `AGENTS.md`
- command descriptions
- theme names if truly project branded
- project package metadata
