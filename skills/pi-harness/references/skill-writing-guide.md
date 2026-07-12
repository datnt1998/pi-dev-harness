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
