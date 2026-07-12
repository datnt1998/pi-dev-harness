---
name: release-versioning
description: "Semantic versioning and release discipline for apps with a single releases source of truth: SemVer bumps, release gate (clean tree, green tests, clean build, approved notes), professional user-facing release notes, chore(release) commits and annotated git tags. Use when the user runs /release, asks to bump a version, publish a release, or write release notes."
---

# Release & Versioning

Standard for releasing an app version. The project keeps ONE source of
truth for versions and user-facing release notes — a single releases module
(e.g. `src/lib/releases.ts`: `RELEASES` newest-first, `APP_VERSION` derived);
`package.json.version` is synced to it at release time. Git tags and
commit messages remain the technical history for developers. Record the
project's actual releases path in `AGENTS.md`.

## SemVer

- Versions are always full `MAJOR.MINOR.PATCH` (display included).
- **MINOR** (second number): a feature release — anything users can see
  or do that they could not before.
- **PATCH** (third number): fixes, polish, small updates with no new
  capability.
- **MAJOR**: only when the user explicitly declares it (e.g. 1.0.0 launch
  or a breaking re-imagining). Never bump major on your own.

## Release Gate — all must pass BEFORE any write

1. Working tree is clean (`git status`).
2. Tests green (`npm run test`).
3. Build clean (`npm run build`).
4. Release notes drafted AND approved by the user.

If any gate fails: stop and report. Never release over a dirty tree or
red tests.

## Release notes rules (user-facing, Vietnamese)

- Write for the end user, professionally. Never technical: no
  "refactor", "seam", "component", commit hashes, or file names.
- Start each line with a verb: "Thêm…", "Cải thiện…", "Sửa lỗi…".
- Describe user value, not code: ❌ "Refactor recurrence seam" →
  ✅ "Việc lặp lại giữ đúng chuỗi khi bạn hoàn thành trễ".
- No emoji overload, no abbreviations, no slang. Product terms follow
  the project glossary (CONTEXT.md).
- Order: new features → improvements → fixes.
- 3–6 lines for a minor release; 1–2 lines for a patch.
- Notes are data, not a file dump: one entry `{ version, date, notes[] }`
  prepended to `RELEASES`. `date` is the RELEASE day (`YYYY-MM-DD`,
  local calendar), never a build timestamp.

## Release mechanics

- One release = one commit + one tag, nothing else mixed in:
  - Commit message: `chore(release): vX.Y.Z`
  - Annotated tag: `git tag -a vX.Y.Z -m "vX.Y.Z"` on that commit.
- Writes in the release commit: new `RELEASES` entry + `package.json`
  version sync. Nothing else.
- Tags stay local until the repo has a remote; then push with
  `git push --follow-tags`.
- Deriving the bump: read `git log <last-tag>..HEAD` (no tags yet →
  summarize at product level; do NOT enumerate every commit). `feat:`
  commits suggest minor; only `fix:`/`polish:`/`docs:` suggest patch.

## Agent conduct

- NEVER release on your own initiative. After a large feature batch
  ships, REMIND the user that a release may be warranted and offer
  `/release` — then wait.
- Never invent notes content the user has not seen: always show the
  draft and wait for approval before writing anything.
- After the release commit, report: new version, tag name, and any
  follow-up steps (e.g. deploy/PWA refresh).
