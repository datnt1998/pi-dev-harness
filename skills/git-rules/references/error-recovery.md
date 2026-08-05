# Error Recovery

Use when a commit needs undoing, a merge or rebase needs aborting, or local changes need discarding. Every step in this file is destructive to some history or working-tree state; run none of them without explicit user confirmation for the specific operation, on the specific target (commit, file, or branch).

## Undo the last unpushed commit

Confirm the commit has not been pushed before offering this (`git log origin/<branch>..HEAD --oneline`; if the commit is not listed, it is unpushed).

Keep the changes staged, ready to re-commit:

```bash
git reset --soft HEAD~1
```

Keep the changes unstaged, ready to re-review:

```bash
git reset HEAD~1
```

Requires explicit user confirmation before running. Never use `git reset` to remove a commit that already exists on the remote — see "Never rewrite pushed history" below.

## Abort an in-progress merge or rebase

```bash
git merge --abort
git rebase --abort
```

Either command discards the in-progress operation and returns to the pre-merge/pre-rebase state, dropping any conflict resolution done so far. Requires explicit user confirmation before running. Prefer resolving the conflict (see `references/merge-conflicts.md`) over aborting when the user's intent is to complete the merge.

## Discard local changes

Single file, working-tree changes only (does not affect the index):

```bash
git checkout -- <file>
```

Single file, staged and working-tree changes:

```bash
git restore --staged --worktree <file>
```

All files, working tree and index reset to `HEAD` (irrecoverable local edits):

```bash
git reset --hard HEAD
```

Each of these permanently discards uncommitted work on the named path(s). Requires explicit user confirmation before running, naming the exact file(s) or confirming "all files" for the `--hard` form.

## Never rewrite already-pushed history

`git reset`, `git rebase`, `git commit --amend`, and `git filter-branch`/`git filter-repo` all rewrite commit history. Once a commit is on a shared remote branch, rewriting it requires a force-push and can discard collaborators' work. Do not perform any local history rewrite of a commit already present on `origin/<branch>` without the user explicitly approving both the rewrite and the subsequent force-push (see `references/branching-and-pr.md` for force-push rules). When in doubt whether a commit is pushed, check `git log origin/<branch>..HEAD` before rewriting.
