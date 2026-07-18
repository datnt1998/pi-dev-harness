# Resolving Merge Conflicts

Use when a git merge/rebase is in progress with conflicts. Adapted for Pi from mattpocock/skills (MIT).

1. **See the current state** of the merge/rebase. Check git history and the conflicting files (`git status`, `git log --merge`, `git diff`).

2. **Find the primary sources** for each conflict. Understand deeply why each change was made and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets/specs.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort` (aborting requires explicit user confirmation — it discards the merge in progress).

4. Discover the project's **automated checks** from its overlay, CI, and build manifests; run the smallest affected checks, then any repository-required merge gate. Do not assume npm, `.pi/`, or a `src/` layout. Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage everything and commit (a merge commit concluding a conflicted merge is part of the in-progress operation — completing it is expected; still follow Conventional Commit style for the message when the tool allows). If rebasing, continue until all commits are rebased.
