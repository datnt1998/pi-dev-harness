---
description: Gate, draft and (after approval) publish a new app release with SemVer bump, notes entry, chore(release) commit and git tag
argument-hint: "[minor|patch] (optional — suggest from git log when omitted)"
---

Use `/skill:release-versioning` to run a release: $ARGUMENTS

Follow exactly this order:

1. **Gate** — verify clean working tree, `npm run test` green,
   `npm run build` clean. Any failure: stop and report; do not continue.
2. **Propose** — find the last `v*` tag; read `git log <tag>..HEAD`
   (no tag yet: summarize the product state instead of listing commits).
   Propose the bump (minor vs patch — honor an explicit argument) and the
   next version, and draft the Vietnamese release notes per the skill's
   notes rules.
3. **Approve** — show version + notes draft and WAIT for the user to
   approve or edit the wording. Write nothing before approval.
4. **Write** — prepend the approved entry to `RELEASES` in the project's
   releases source of truth (e.g. `src/lib/releases.ts`, per `AGENTS.md`),
   sync `package.json.version`, run tests + build
   again, then commit `chore(release): vX.Y.Z` and create annotated tag
   `vX.Y.Z`. Nothing unrelated goes into this commit.
5. **Report** — confirm version, tag, and remaining follow-ups
   (push `--follow-tags` once a remote exists; PWA users get the update
   prompt on next visit).
