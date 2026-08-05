# Branching and Pull Requests

Covers branch naming, lifecycle, force-push protection, PR creation, and merge readiness. Every push, PR-create, merge, and branch-delete operation requires explicit user authorization; commit permission never implies any of them (see the Core Policy in `SKILL.md`).

## Branch naming

Follow the repository's observed convention first: look at existing branch names, `CONTRIBUTING.md`, and `AGENTS.md`. Match whatever pattern the repository already uses.

If no convention is evident, fall back to `<type>/<short-slug>` using the Conventional Commit types already defined in `SKILL.md` (`feat`, `fix`, `docs`, `refactor`, `test`, `build`, `chore`, `perf`, `ci`, plus `style`). Do not invent a project-specific taxonomy (no `hotfix/`, `bugfix/`, or similar unless the repository already uses it).

## Lifecycle

- Branch from the updated default branch (fetch/pull it first).
- Keep the branch current with the default branch by rebase, unless the repository documents a different merge policy (for example an explicit "merge, don't rebase" convention) — follow the repository's documented policy over this default.
- After the branch's work is merged, delete both the local and the remote branch.

## Force-push protection

- Never force-push the default branch, a production branch, or a release branch, under any circumstance.
- Force-push a feature branch only after a rebase the user has approved, and only when the branch is solely owned (no other contributor has pulled or is building on it).
- Prefer `--force-with-lease` over a bare `--force`; it refuses if the remote has commits not yet seen locally.

## Remote-first comparisons

Compare PR diffs against the remote, never against local worktree state:

```bash
git diff origin/<base>...origin/<head>
```

Do not use `git diff <base>...HEAD` or `git status` for this purpose — they include unpushed and uncommitted local changes that are not part of the PR.

## PR creation

- Title: Conventional Commit summary format (`type(scope): imperative summary`), following the same subject rules as commit messages (see `SKILL.md`).
- Body: link the governing spec/ticket and include validation evidence — the checks run and their results (the same evidence used for the commit-ready checkpoint).
- Use `gh pr create` when the `gh` CLI is available and authenticated. Otherwise, report the manual PR-creation step (title, body, base/head) for the user to execute.

## Merge readiness gates

Before merging, verify all of:

- No merge conflicts against the target branch.
- Required CI checks are green — not red, not still pending.
- No outstanding "changes requested" review.

Refuse to merge and report the blocker if any gate fails.

After a merge completes, verify post-merge CI on the target branch before reporting the operation done — a merge that introduces a red build on the target branch is not finished.

## Authority header

Every one of these operations requires explicit user authorization, separate from and never implied by commit permission:

- push
- PR creation
- merge
- branch delete (local or remote)

Release tagging, changelog generation, and version-bump flows are out of scope here; defer to `release-versioning` and `release-check` and cross-reference them if a release comes up mid-branch/PR work.
