# pi-dev-harness

Reusable Pi engineering harness: portable workflow skills/prompts plus safe autonomous ticket execution. Current compatibility baseline: Node 22+ and Pi `@earendil-works/pi-coding-agent` 0.80.6; Pi-hosted SDK peers follow Pi package guidance and are verified by the installed smoke.

## Included

### Extensions

- `safe-ops` — blocks model writes to `.env`, `.git/**`, `node_modules/**`; confirms destructive model shell commands in TUI and blocks them headlessly. Guardrail, not sandbox.
- `ticket-runner` — `/implement-all`, `/implementation-status [--verbose]`, `/implement-all-stop`; tools `batch_next`, `batch_report`; persisted state, source fingerprint, retries, continuation cap.

### Skills (17)

`pi-harness`, `engineering-workflow`, `codebase-design`, `domain-modeling`, `git-rules`, `repo-hygiene`, `release-versioning`, `release-check`, `ticket-readiness`, `batch-implementation`, `prototype`, `wayfinder`, `memory-management`, `react-best-practices`, `react-doctor`, `make-interfaces-feel-better`, `tldraw-offline`.

### Prompts (28)

Harness: `build-pi-harness`, `audit-pi-harness`, `extend-pi-harness`, `harness-review`, `harness-team-review`, `harness-evolve`, `harness-engineering-setup`.

Workflow: `grill-with-docs`, `to-spec`, `to-tickets`, `implement`, `implement-batch`, `code-review`, `diagnose`, `handoff`, `session-review`, `prepare-tickets`, `commit-ready`, `tidy-docs`, `release`, `release-check`, `wayfinder`, `memory-audit`.

Frontend/TUI: `ui-polish`, `fe-polish`, `react-doctor`, `tui-polish`, `diagram`.

### Project overlays

Pi packages cannot auto-install `AGENTS.md` or `.pi/APPEND_SYSTEM.md`. Copy/adapt once:

- `templates/PROJECT_SETUP.md`
- `templates/APPEND_SYSTEM.md`
- `templates/AGENTS.snippet.md`

Keep product identity, test/build commands, release source, deploy trigger, themes, and product TUI in the consumer repository.

## Install

```bash
# User-scope local development: all projects use this checkout.
pi install /absolute/path/to/pi-dev-harness

# Published, exact version (reproducible):
pi install npm:pi-dev-harness@0.2.0

# Team/project scope after publishing:
pi install -l npm:pi-dev-harness@0.2.0
```

Then `/reload`.

Local-path installs follow the checkout immediately after `/reload`; pin that checkout to a known commit/tag for reproducible use. Exact npm specs are pinned. Upgrade/rollback explicitly with `pi install npm:pi-dev-harness@<version>` (add `-l` for project scope); inspect source/diff and rerun smoke before changing versions.

## Set up a new project

1. Run `/harness-engineering-setup`.
2. Resolve `templates/PROJECT_SETUP.md`; copy verified project facts into `AGENTS.md` and adapt `templates/APPEND_SYSTEM.md` only when needed.
3. Record repository/workspace roots, ecosystem-native validation commands, review base, `.scratch/` ignore policy, and release/deploy authority. Unknown production facts stay disabled—not guessed.
4. `/reload`, then run `npm run smoke:installed` in this checkout.
5. Exercise one small native change through inspect → validate → review → checkpoint before autonomous batches.

Example discovery after reload: `/skill:engineering-workflow`, `/prepare-tickets`, `/implement-all <tickets>`, `/implementation-status`, and tools `batch_next`/`batch_report`.

Generic names such as `/release` or `/code-review` can collide with another package/project copy. The SDK smoke reports diagnostics; remove copied duplicates or use Pi package filters before proceeding.

## Cutover from copied resources

1. Install package.
2. Reload; verify skills, prompts, extension commands/tools, and zero diagnostics/conflicts.
3. Preserve project-specific instructions in `AGENTS.md`/`.pi/APPEND_SYSTEM.md`.
4. Move copied `.pi/skills` and `.pi/prompts` to a reversible backup; do not leave duplicate names loaded.
5. Reload and rerun the smoke/tests.

## Autonomous contract

One approval envelope covers reversible work inside an approved spec/ticket/batch:

`inspect → implement → validate → review → scoped fixes → checkpoint`

The harness batches blocking questions and continues independent work. It always stops for unapproved scope/product/architecture/API/data decisions, destructive or irreversible work, credentials/security boundaries, migrations/data loss, production/push/publish/release/deploy, unsafe dirty state, unresolved blockers, or caps.

`--commit` authorizes precise validated commits only.

## Prerequisites and optional capabilities

| Resource | Needs | If absent |
|---|---|---|
| Subagent-assisted review | `pi-subagents` | structured self-review fallback |
| Web research | `pi-web-access` | skip web-only steps |
| `react-doctor` | `npx react-doctor` + React `src/` | inert outside React |
| `memory-management`, `memory-audit` | memory tools/extension | report unavailable and stop |
| `tldraw-offline` (vendored), `diagram` | tldraw offline desktop app running | prompt to install tldraw offline, else fall back to an ASCII sketch |

Memory implementation, auth providers, web access, product UI/theme, vision, notifications, and the third-party tldraw offline app/skill intentionally remain separate packages/project resources.

### Known-good companion stack

The harness runs alone, but highest-effectiveness review/research on the currently validated stack uses:

- `pi-subagents@0.34.0` — independent/forked review and delegation;
- `pi-web-access@0.13.0` — source-backed web/library research;
- `@hypabolic/pi-hypa@0.1.11` — optional context compression;
- `@gotgenes/pi-anthropic-auth@1.0.0` — optional Anthropic auth compatibility only.

Install only needed, reviewed packages with exact versions; provider/auth packages are environment-specific. These are companions, not bundled dependencies, so `pi-dev-harness` remains useful in isolation and uses documented fallbacks.

## Validate

```bash
npm test
npm run pack:check
npm run smoke:installed
npm run smoke:packed
```

The installed smoke loads Pi twice: package-only in a temporary unrelated project, then integrated with current user packages. The packed smoke additionally packs, installs, and loads the actual tarball to verify published-file closure. Both verify extensions, commands, tools, prompts, skills, diagnostics, and conflicts. Run a final smoke in the real consumer after overlay changes. Expected tests cover ticket readiness/state, continuation coordination, safe-ops policy, package integrity, and setup portability.

## License

MIT
