---
name: release-versioning
description: "Repository-aware release discipline: discover the project's versioning and release contract, gate validation, draft approved notes, synchronize declared version sources, and create only the repository-authorized commit/tag. Use for version bumps, release notes, publishing, or releases."
---

# Release and Versioning

Run releases from repository evidence, never from package defaults or memory. This skill works across ecosystems and monorepos; project-specific facts belong in `AGENTS.md`, `CONTRIBUTING.md`, or another documented release contract.

## Required project contract

Before any release write, identify:

- versioning policy (SemVer or repository-defined equivalent);
- authoritative version source(s) and selected workspace/package;
- release-notes/changelog source, or an explicit declaration that none exists;
- exact test/static-check/build/package commands and working directories;
- release commit and tag conventions;
- remote/publish procedure and the exact deploy trigger;
- rollback and post-release smoke procedure.

Use `templates/PROJECT_SETUP.md` when bootstrapping this contract. If a material fact is absent or contradictory, inspect primary repository evidence, then ask one batched question set. You may draft a proposal, but do not change versions, commit, tag, push, publish, or deploy.

## Version decision

Follow the repository's policy. For SemVer projects:

- `MAJOR`: breaking compatibility or an explicit major launch; never infer casually.
- `MINOR`: backward-compatible user/developer capability.
- `PATCH`: backward-compatible correction or polish.

Honor an explicit user bump only when compatible with repository policy. Use changes since the last relevant release fixed point; in a monorepo, scope history to the selected package where possible.

## Release gate — before writes

1. Intended repository/workspace and fixed point are explicit.
2. Working tree/index are clean, unless the documented release process intentionally creates the release diff in a controlled branch.
3. Every contract-required validation command passes in its declared working directory.
4. Version-source and notes-source updates are known and internally consistent.
5. User approves the exact target version and release-note wording.
6. `/skill:release-check` has no unresolved applicable blocker.

Stop on failed or unavailable required evidence. Never substitute `npm test`/`npm build` unless those are the repository's actual commands.

## Release notes

Follow the project locale, audience, format, and source of truth. For user-facing applications when no stricter format exists:

- explain user value, not implementation details;
- order features → improvements → fixes;
- use concise action-led lines and product glossary terms;
- avoid commit hashes, internal file names, and unexplained jargon;
- use the release date in the project's declared timezone.

Never create a parallel changelog or release module when the repository already has an authority. If the project explicitly has no persisted notes source, report notes in the approved release surface only.

## Mechanics

- Change only declared version/notes/generated lock or metadata sources required by the repository process.
- Re-run required validation after version writes.
- Inspect the exact release diff before staging.
- Use the repository's commit/tag convention; a common default is `chore(release): vX.Y.Z` plus annotated `vX.Y.Z`, but do not impose it over documented conventions.
- Commit/tag permission does not authorize push, publish, deploy, credentials, migration, or production access.
- Before any push, re-read the exact deploy trigger from repository evidence and ask for explicit approval. A tag push may itself be production deployment.

## Final report

Report version/workspace, changed authorities, validation, commit/tag state, and separately authorized remaining actions. Happy path is one terse line; expand blockers, unknown release facts, production risk, or rollback gaps.
