# pi-dev-harness

A reusable [Pi](https://pi.dev) coding harness — the project-agnostic skills and
slash-command prompts extracted from a real product harness so any project can
inherit disciplined engineering workflow.

## What's inside

### Skills (`/skill:<name>`)
- **pi-harness** — design, audit, extend, evolve Pi harnesses
- **engineering-workflow** — grill → spec → tickets → implement → review → handoff
- **codebase-design** — deep modules, seams, adapters
- **domain-modeling** — CONTEXT.md + ADR discipline
- **git-rules** — Conventional Commits, small reversible changes, checkpoints
- **release-versioning** — SemVer, release gate, professional notes
- **ticket-readiness** / **batch-implementation** — gate + autonomously run ticket batches
- **prototype** — throwaway prototypes to answer design questions
- **wayfinder** — chart oversized/foggy efforts as investigation maps
- **memory-management** — safe use of persistent memory tools
- **react-best-practices** — perf + architecture for React/Vite SPAs
- **make-interfaces-feel-better** — design-engineering UI polish

### Prompts (`/name`)
Harness: `build/audit/extend-pi-harness`, `harness-review`, `harness-team-review`,
`harness-evolve`, `harness-engineering-setup`.
Workflow: `grill-with-docs`, `to-spec`, `to-tickets`, `implement`, `code-review`,
`diagnose`, `handoff`, `session-review`, `prepare-tickets`, `implement-all`,
`commit-ready`, `release`, `ui-polish`, `fe-polish`, `wayfinder`, `memory-audit`,
`tui-polish`.

## Install

Add to `~/.pi/agent/npm/package.json` dependencies and install:

```jsonc
// during development, from a local checkout:
"pi-dev-harness": "file:../../Projects/exp/pi-dev-harness"
// or once published:
"pi-dev-harness": "^0.1.0"
```

Pi discovers the package's `skills/` and `prompts/` via the `"pi"` field in
`package.json`. Reload Pi (`/reload`) and the skills/prompts appear.

## Prerequisites & optional extensions

This package ships **skills and prompts only** — no extensions. Most resources
work standalone, but a few lean on capabilities a project must provide:

| Resource | Needs | If absent |
| --- | --- | --- |
| `memory-management`, `memory-audit` | a memory extension (`memory_manage`/`memory_search` tools, `/memories` command) | inert — skill/prompt say so and stop |
| `batch-implementation`, `implement-all` | `ticket-runner` extension (`/implement-all` command) | **degrades gracefully** — the skill runs the batch loop manually |
| subagent-assisted prompts (`harness-team-review`, `code-review`…) | `pi-subagents` package | falls back to single-agent flow |
| research in workflow prompts | `pi-web-access` package (`web_search`/`fetch_content`) | skip web steps |

## Notes

- Project identity, TUI/theme, and product-specific extensions stay in each
  project's `AGENTS.md` and `.pi/` — this package ships only portable resources.
- Adapt the "Project fit" section of `react-best-practices` per project.
- Memory as a full capability (extension + lib + tests) is a candidate for its
  own future `pi-memory` package, not this one.

## License

MIT
