# Pi Skill Writing Guide

Pi skills follow the Agent Skills standard: a directory with `SKILL.md`, required frontmatter `name` and `description`, and optional references/scripts/assets.

## Good Skill Names

- lowercase
- reusable
- no project-specific branding unless the skill is truly project-only
- examples: `repo-audit`, `web-research`, `pi-harness`, `release-check`

## Description

The description is the trigger. Be specific and assertive.

Good:
```yaml
description: Audit a repository for architecture, security, test coverage, and maintainability. Use when the user asks for repo review, codebase audit, or quality assessment.
```

Poor:
```yaml
description: Helps with code.
```

## Progressive Disclosure

Keep the main `SKILL.md` focused:

- purpose
- triggers
- workflow
- safety rules
- references to load only when needed

Move details to:

```txt
references/
scripts/
assets/
```

## Structure

```txt
skill-name/
├── SKILL.md
├── references/
│   └── detailed-guide.md
└── scripts/
    └── helper.sh
```

## Checklist

- Name is generic and reusable.
- Description says when to use it.
- Main file is not bloated.
- References are linked from the main file.
- Commands/scripts use relative paths.
- The skill does not assume Claude-only APIs unless explicitly designed for Claude.

## The mental model — writing skills that behave the same every time

Adapted for Pi from mattpocock/skills (MIT). A skill wrangles determinism out of a stochastic system: the goal is not the same *output* every run but the same *process*. **Predictability is the root virtue** — judge every choice against it, not against how clever, complete, or exhaustive the skill reads.

### Two loads every skill spends

- **Context load** — a *model-invoked* skill keeps its `description` in the window every turn: it fires on its own but costs tokens continuously.
- **Cognitive load** — a *user-invoked* skill (`disable-model-invocation`-style) strips that description to zero context cost, but now *the human* is the index who must remember it exists.

Most workflow skills are user-invoked, so cognitive load is the pressure to manage. When user-invoked skills multiply past what a person can hold, the cure is a **router skill** (here: `engineering-workflow`'s phase router, `pi-harness`) that names the others and when to reach for each. Split-or-don't, inline-or-disclose, model- or user-invoked are the same trade made in different places.

### Levers for spending those loads well

- **Leading words** — anchor execution on a compact concept already in the model's pretraining (*tight*, *red-green*, *tracer bullet*, *seam*, *deep module*). One well-chosen word retires paragraphs of restatement; hunt restatements a single word can replace.
- **Information hierarchy / progressive disclosure** — a ladder: in-`SKILL.md` step → in-skill `references/` file → external reference behind a **context pointer** ("read X when Y"). Move detail *down* the ladder so the top stays legible. Keep `SKILL.md` to purpose, triggers, workflow, safety; push the rest to `references/`.
- **Pruning** — apply single-source-of-truth, relevance, and a **no-op test** sentence by sentence: if a line changes no behaviour, cut it.

### Failure modes to diagnose against

- **Premature completion** — the skill stops before the process is actually done (e.g. "fix" before evidence). Add an explicit gate.
- **Duplication** — the same rule stated in two places drifts; keep one source and point at it.
- **Sediment** — stale instructions left behind after the behaviour changed. Delete on change.
- **Sprawl** — the skill grows to cover cases it was never for. Re-scope, don't accrete.
- **No-op** — prose that reads well but steers nothing. Cut it.

When a skill misfires, name the failure mode first, then fix the lever that caused it.
