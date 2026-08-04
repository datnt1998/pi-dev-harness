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
- **Cognitive load** — a Pi *user-invoked* skill sets `disable-model-invocation: true`, hiding it from the model inventory while keeping direct `/skill:name` access for the human.

Pi expands a direct skill command at the user's entry point; merely writing `Use /skill:name` inside a prompt, extension message, or another skill does not recursively load a hidden skill. Build a caller matrix before hiding anything, and keep routers or extension dependencies visible unless their caller injects the actual skill content.

When human-only skills multiply past what a person can hold, use a visible router or a documented command menu. Split-or-don't, inline-or-disclose, model- or user-invoked are the same load trade made in different places.

### Levers for spending those loads well

- **Leading words** — front-load a compact concept already in the model's pretraining (*tight*, *red*, *tracer bullet*, *seam*, *deep module*). One well-chosen word retires paragraphs of restatement and sharpens both invocation and execution.
- **One trigger per branch** — a description names each genuinely distinct way the skill should fire once; synonym lists are duplication.
- **Completion criteria** — end each step on a checkable, sufficiently demanding condition. Sharpen the condition before splitting a sequence to fight premature completion.
- **Information hierarchy / progressive disclosure** — a ladder: in-`SKILL.md` step → in-skill `references/` file → external reference behind a **context pointer** ("read X when Y"). Move detail *down* the ladder so the top stays legible. Keep `SKILL.md` to purpose, triggers, workflow, safety; push the rest to `references/`.
- **Positive steering** — describe the target behavior. A prohibition names the elephant and can make it more available; keep negation for hard guardrails and pair it with the positive action.
- **Negative-space audit** — every unspecified decision falls back to model priors. Decide deliberately whether to define it or leave it as a real branch.
- **Pruning** — apply single-source-of-truth, relevance, and a **no-op test** sentence by sentence: if a line changes no behaviour, cut it.

### Failure modes to diagnose against

- **Premature completion** — the skill stops before the process is actually done. Sharpen the completion criterion first; split only when later visible steps still pull the agent forward.
- **Duplication** — the same rule stated in two places drifts; keep one source and point at it.
- **Sediment** — stale instructions left behind after the behaviour changed. Delete on change.
- **Sprawl** — the skill grows beyond a legible path. Disclose reference or split by a real branch/sequence.
- **No-op** — prose that reads well but steers nothing. Cut it.
- **Negation** — a prohibition activates the behavior it names. State the positive target.
- **Negative space** — an omitted decision silently delegates to priors. Fill it or declare the branch.

When a skill misfires, name the failure mode first, then fix the lever that caused it.
