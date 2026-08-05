---
name: git-rules
description: "Standard Git workflow for Pi coding sessions: inspect status/diff, keep commits small, write Conventional Commit messages, avoid unrelated changes, and create commit-ready checkpoints after implementation. Use before staging, committing, reviewing git state, or finishing an implement phase."
---

# Git Rules

Use this skill whenever work reaches a commit boundary, especially after `/implement` completes validation and review.

## Core Policy

1. **Never commit blindly**
   - Do not run `git add .` unless the diff has been inspected, all changed files are intended, and they belong to one commit under the Classify split rules.
   - Do not commit secrets, `.env`, local temp files, logs, or unrelated generated output.
   - Do not commit unless the user explicitly asked for a commit or confirms the proposed commit.

2. **One logical change per commit**
   - Prefer one ticket or one coherent vertical slice per commit.
   - Keep harness/Pi-resource changes separate from product app changes when practical.
   - Split unrelated docs, harness, and product code if they can stand alone.

3. **Evidence before commit**
   - Inspect `git status --short`.
   - Inspect the relevant diff.
   - Run focused checks appropriate to the change.
   - Run review phase or self-review before proposing the commit.

4. **Commit after successful implement checkpoint**
   - After every successful `/implement`, prepare a **commit-ready summary**:
     - changed files
     - checks run
     - review result
     - proposed commit type/scope/message
   - If the user says `commit`, `commit it`, `ok commit`, or gave explicit per-ticket/batch commit permission, stage only intended files and commit without asking again.

## Commit Flow

### 1. Inspect

```bash
git status --short
git diff -- <paths>
```

If the repo has no `.git`, say so and skip commit actions.

### 2. Classify

When the intended changes mix Conventional types or scopes (code + docs, feat + fix, deps/config + code), split before staging:

- Group the files in `git status --short` by Conventional type + scope, using per-path `git diff` to confirm each file's classification.
- Propose one sequential commit per group, staging each group precisely (explicit paths or `git add -p`).
- Never blanket-stage (`git add -A` or `git add .`) to analyze a mixed diff — analysis starts from `git status --short` and per-path diffs, not from a staged snapshot.
- There is no numeric file-count or line-count threshold for deciding to split; classify by type/scope mixing, not size.

Use Conventional Commit type:

- `feat` — user-visible feature
- `fix` — bug fix
- `docs` — documentation/spec/tickets only
- `style` — formatting/CSS-only visual polish with no behavior change
- `refactor` — code restructure without behavior change
- `test` — tests only
- `build` — build system/dependencies/package config
- `chore` — maintenance/tooling not affecting app behavior
- `perf` — performance improvement
- `ci` — CI configuration

Choose scopes from repository evidence: existing Conventional Commits, workspace/package names, bounded contexts, or `AGENTS.md`. If no convention exists, use a stable module/domain noun (for example `api`, `cli`, `auth`, `storage`, `harness`, `docs`, `build`) or omit the scope rather than inventing project taxonomy.

### 3. Propose message

Format:

```txt
<type>(<scope>): <imperative summary>
```

Examples:

```txt
build(cli): add repository-native packaging
feat(auth): add session revocation
fix(api): reject malformed pagination tokens
chore(harness): refresh reusable workflow resources
```

Subject line rules:

- 72 characters or fewer.
- Imperative mood ("add", not "added" or "adds").
- No trailing period.
- Describe WHAT changed, not HOW it was implemented.
- Never include AI attribution, an AI co-author trailer, or a tool advertisement in the subject or body.

### 4. Stage precisely

Prefer explicit paths:

```bash
git add package.json package-lock.json vite.config.ts src/main.tsx
```

Use patch mode when only part of a file belongs in the commit:

```bash
git add -p <file>
```

### 5. Commit

```bash
git commit -m "fix(api): reject malformed pagination tokens"
```

## Commit-Ready Summary Template

Use this before asking for approval or before committing:

```markdown
## Commit-ready checkpoint

Changed files:
- `path`

Checks:
- `<repository-native validation command>` — pass

Review:
- reviewer/self-review result

Proposed commit:
`type(scope): summary`

Commit now? (`yes`/`no`)
```

## Safety Gates

### Secret scan

Before proposing any commit, scan the staged diff mechanically:

```bash
git diff --cached | grep -iE "(AKIA|api[_-]?key|token|password|secret|credential|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|mongodb://|postgres://|mysql://|redis://)"
```

Also check staged filenames for sensitive files: `.env*` (except `.env.example`), `*.key`, `*.pem`, `*.p12`, `credentials.json`, `secrets.json`.

On any hit: block the commit proposal, show the matching lines, and suggest unstaging the file (`git reset HEAD <file>`) and adding it to `.gitignore`. A hit blocks the proposal pending human inspection — it does not block the underlying work, and patterns can false-positive on legitimate text (for example docs mentioning "token"); treat a hit as a required look, not an automatic verdict.

The `safe-ops` extension guardrail complements this scan but does not replace it: `safe-ops` blocks risky writes as they happen, while this scan catches secret content that is already staged from any source.

### Ask before commit

- Untracked files exist and their purpose is unclear.
- Diff includes Pi harness resources and product app code together.
- Diff includes lockfile changes not caused by package install/update.
- Diff includes generated `dist/`, screenshots, temp files, logs, or artifacts.
- Checks failed or were not run.
- User requested no commits.

## Final Response Behavior

Default to one terse checkpoint line. If commit permission is absent, propose the message and ask once. If already authorized, commit without re-confirming and report hash/message/checks/remaining changes. Commit permission never implies push, publish, release, deploy, migration, or destructive cleanup.

## Merge/Rebase Conflicts

When a merge or rebase is in progress with conflicts, read `references/merge-conflicts.md` (same directory): understand the intent of both sides from primary sources, preserve both intents where possible, never invent new behaviour, run checks, and finish the operation.

## Error Recovery

When a commit needs undoing, a merge/rebase needs aborting, or local changes need discarding, read `references/error-recovery.md` (same directory): every destructive recovery step requires explicit user confirmation, and already-pushed history is never rewritten.

## Branching and Pull Requests

For branch naming, lifecycle, force-push protection, remote-first PR comparisons, PR creation, and merge readiness gates, read `references/branching-and-pr.md` (same directory): every push, PR-create, merge, and branch-delete operation requires explicit user authorization, separate from and never implied by commit permission.
