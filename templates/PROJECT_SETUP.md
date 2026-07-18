# Pi Harness Project Setup Contract

Copy the resolved facts into `AGENTS.md` (and `.pi/APPEND_SYSTEM.md` only for stable runtime behavior). Do not keep placeholders or guess unknown release/production details.

## Repository

- Project purpose/domain:
- Repository root:
- Workspace/package roots (monorepo):
- Source/test/generated boundaries:
- Default branch and configured upstream:
- Issue tracker; otherwise local ticket path:
- Spec/ADR/domain-doc paths:
- Scratch artifact path and ignore policy (normally `.scratch/` in `.gitignore`):

## Validation

Record exact commands and working directories. Use the repository's ecosystem; do not assume npm.

| Scope | Working directory | Command | Required when |
|---|---|---|---|
| Focused test | | | |
| Full test | | | |
| Type/static check | | | |
| Lint/format check | | | |
| Build/package | | | |
| UI/manual smoke | | | |

For monorepos, tickets should state `Working directory:` and the smallest applicable validation commands. Root-wide checks are fallback/release gates, not the default for every slice.

## Git and review

- Review base priority: user-supplied fixed point → merge-base with configured upstream/default branch → staged + unstaged worktree diff.
- Commit convention/scopes:
- Generated or protected paths never to stage:

## Release and production

Leave release automation disabled until these are repository-evidenced:

- Version source(s):
- Release-notes/changelog source (or none):
- Versioning policy:
- Release test/build commands:
- Release commit/tag convention:
- Remote/push procedure:
- Exact production/deploy trigger:
- Rollback and smoke procedure:

Push, publish, release, deploy, migration, credentials, and production actions always require explicit approval.

## Optional capabilities

- `pi-subagents`: available / unavailable (self-review fallback)
- `pi-web-access`: available / unavailable
- Memory tools: available / unavailable
- React/frontend roots, if any:
- Pi TUI/theme/project extensions, if any:

## Verification

- Run `/reload`.
- Run `npm run smoke:installed` from the `pi-dev-harness` checkout when using a local install.
- Confirm expected commands/tools/skills/prompts and zero diagnostics/conflicts.
- Run one small repository-native change through inspect → validate → review → checkpoint before enabling autonomous batches.
