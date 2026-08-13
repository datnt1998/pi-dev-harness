# pi-dev-harness

Reusable Pi engineering harness: portable workflow skills/prompts plus safe autonomous ticket execution. Current compatibility baseline: Node 22+ and Pi `@earendil-works/pi-coding-agent` 0.80.6; Pi-hosted SDK peers follow Pi package guidance and are verified by the installed smoke.

## Included

### Extensions

- `safe-ops` — blocks model writes to `.env`, `.git/**`, `node_modules/**`; confirms destructive model shell commands in TUI and blocks them headlessly. Guardrail, not sandbox.
- `ticket-runner` — `/implement-all`, `/implementation-status [--verbose]`, `/implement-all-stop`; tools `batch_next`, `batch_report`, `batch_worker_lane`; persisted state, source fingerprint, retries, continuation cap, and an optional generic pilot ledger.
- `harness-tui` — brandless responsive footer preserving context %, session cost, cwd/path, git branch, thinking level, and model at every width; `/harness-tui status|on|off`. Identity-free (label defaults to the folder name, no theme/branding). **One footer owner:** a project shipping its own footer must set `.pi/harness-tui.json` `{ "enabled": false }` or run `/harness-tui off` so the two never fight. Pure layout/format logic in `lib/tui-core.ts`.
- `provider-usage` — standalone belowEditor view of the same machine-readable quota snapshot used by the launch gate (the `harness-tui` footer consumes that snapshot too, so this widget is **default OFF**). It shows short/weekly capacity, freshness, band, protected balances, and gate reason. `/provider-quota status|on|off|refresh|snapshot`; enable via `.pi/provider-usage.json` `{ "enabled": true }`. Select a session-stable quota source independently of the active main model with `.pi/quota-gate.json` `{ "provider": "<supported-provider>", "providerIdentity": "<stable-account-key>" }`; without it, UI-only compatibility freezes the supported active provider at session start. **Trust/network:** OAuth is read only by the existing provider fetch adapter; credentials are never returned or persisted.
- Quota launch authority — `lib/quota-gate-core.ts` exposes the immutable `PremiumQuotaSnapshot`, reset-keyed 60/20/15/5 ledger, pure fail-closed `decideQuotaLaunch`, explicit `decideDegradation`, accounting split by production/arbitration purpose, and `QuotaLaunchRuntime` atomic reservation/finish interface. `lib/provider-usage-service.ts` supplies the process-wide single fetch authority and JSON ledger adapter. Callers must use `ProviderQuotaAuthority.start()` immediately before a scarce-premium main/child launch and always call the returned lease's `finish()`; the gate returns decisions and never chooses or silently falls back to a model.
- `autocompact` — proactive context compaction ahead of Pi's overflow safety net: tiered warnings + a "tokens left" indicator, compacts at a configurable trigger (percent AND/OR absolute token cap, effective = min) at safe idle boundaries. `/autocompact status|on|off|at <pct|tokens>|warn <pct>|focus <text|clear>|native on|off|reorient on|off|now`. Layered settings: global `$PI_CODING_AGENT_DIR/autocompact.json` + project `.pi/autocompact.json` (wins). Pure logic in `lib/autocompact-core.ts`.
  - **Context recovery after compaction:** compaction summaries fade skill rules and effort context the agent believes it still knows. The extension tracks genuine usage signals — `/skill:<name>` invocations and `skills/<name>/SKILL.md` / `.scratch/<effort>/` paths in tool-call arguments (mere mentions in listings, greps, or tool results never count) — seen on the branch **since the previous compaction** (windowed — stale skills age out instead of being re-announced forever), steers extension-triggered summaries to preserve them, and after every compaction (any source) sends one follow-up naming what to **lazily** re-read on next use — never a preemptive re-read of everything, never re-injecting full skill/reference bodies. Toggle with `/autocompact reorient on|off` (default on); `/autocompact status` shows it.
  - **Mid-run (long single runs):** our own `ctx.compact()` aborts the active run, so it can only fire at idle. To compact a long single run *without interrupting it*, the extension keeps Pi's native between-turns compaction (`compaction.reserveTokens`) aligned with your trigger — writing it to the **project** `.pi/settings.json` only (never global, so a per-model reserve can't leak). Non-interrupting; applies from the next session/reload (Pi has no runtime setter for `reserveTokens`). Toggle with `/autocompact native on|off`; `/autocompact status` shows the resulting mid-run point.
  - **If you previously ran a global `~/.pi/agent/extensions/autocompact/` copy, remove it after installing the package so the `/autocompact` command is not registered twice.**
- `review-graph` — prints a compact navigation map for a change set so reviewer briefs carry the codebase context instead of each reviewer re-deriving it: per changed file the export-surface delta, direct dependents (one hop of importers, plus a capped second hop), and guard files (test dependents at one or two hops), with workspace-package (monorepo) import resolution and an explicit `unresolved` section where static resolution cannot see. `/review-map [base..head]`; with no argument it maps the dirty tree (unstaged + staged + untracked source files). Run it when composing a reviewer brief — after the boundary commit — and read the summary line before pasting: plant the block only when it shows a wide dependent surface, since for a narrow change the paste is overhead rather than navigation; after a fix round, re-run it on the fix-round range to scope the re-review to what actually changed. TS/JS surfaces only; outside them the command degrades to a clear message. The map is advisory navigation, never evidence — findings still cite real files (review discipline: `skills/engineering-workflow/references/code-review.md`). Pure graph logic in `lib/review-graph.ts`.
- `session-gc` — reclaims disk from finished agent work across three scan areas: the host session store's directory for the current project, the subagent temp root, and the project-local `.pi-subagents/artifacts`. `/gc status|dry-run|run|auto on|off|days <sessionsDays> <artifactsDays>`; `dry-run` before `run` is the safe default flow. Protection is fail-closed: the current session, a non-terminal run, anything newer than the retention window, or an unrecognized layout is never a deletion candidate. Defaults: sessions retained thirty days, artifacts retained seven days, auto sweep off (an enabled auto sweep runs at most once a day and reports only when it reclaimed something). Deleting a session file removes its resume history — run `dry-run` first to review candidates. The sessions area targets only the directory whose name the host derives from the current project path; when that directory cannot be located the area is skipped, and other projects' session stores are never scanned. Pure planning logic in `lib/gc-core.ts`.

### Skills (18)

`pi-harness`, `engineering-workflow`, `codebase-design`, `domain-modeling`, `git-rules`, `repo-hygiene`, `release-versioning`, `release-check`, `ticket-readiness`, `batch-implementation`, `prototype`, `wayfinder`, `memory-management`, `react-best-practices`, `react-doctor`, `make-interfaces-feel-better`, `tldraw-diagrams`, `reasoning-discipline`.

### Prompts (29)

Harness: `build-pi-harness`, `audit-pi-harness`, `extend-pi-harness`, `harness-review`, `harness-team-review`, `harness-evolve`, `harness-engineering-setup`.

Workflow: `grill-with-docs`, `to-spec`, `to-tickets`, `implement`, `implement-batch`, `code-review`, `diagnose`, `handoff`, `session-review`, `prepare-tickets`, `commit-ready`, `tidy-docs`, `release`, `release-check`, `wayfinder`, `improve-architecture`, `memory-audit`.

Frontend/TUI: `ui-polish`, `fe-polish`, `react-doctor`, `tui-polish`, `diagram`.

### Project overlays

Pi packages cannot auto-install `AGENTS.md` or `.pi/APPEND_SYSTEM.md`. Copy/adapt once:

- `templates/PROJECT_SETUP.md`
- `templates/APPEND_SYSTEM.md`
- `templates/AGENTS.snippet.md`
- `templates/theme.example.json` — optional neutral starter theme (name `harness-neutral`). Copy to `.pi/themes/`, rename/rebrand, and select it in Pi. It defines the semantic roles `harness-tui` uses (`accent/dim/muted/success/warning/error`) plus the standard markdown/syntax/tool roles. Not applied automatically; product-branded themes stay in the consumer repo.

Keep product identity, test/build commands, release source, deploy trigger, themes, and product TUI in the consumer repository.

## Install

This package is distributed by git tag; there is no npm publish. The current release tag is `v0.10.0`.

```bash
# User-scope local development: all projects use this checkout.
pi install /absolute/path/to/pi-dev-harness

# Pinned git tag, user scope (reproducible):
pi install git:github.com/datnt1998/pi-dev-harness@v0.10.0

# Team/project scope:
pi install -l git:github.com/datnt1998/pi-dev-harness@v0.10.0
```

Then `/reload`.

Local-path installs follow the checkout immediately after `/reload`; pin that checkout to a known commit/tag for reproducible use. Git `@ref` values are pinned tags or commits, and pinned packages are skipped by `pi update`, so move a package to a new release explicitly with `pi install git:github.com/datnt1998/pi-dev-harness@<tag>` (add `-l` for project scope); inspect source/diff and rerun smoke before changing versions.

## Set up a new project

1. Run `/harness-engineering-setup`.
2. Resolve `templates/PROJECT_SETUP.md`; copy verified project facts into `AGENTS.md` and adapt `templates/APPEND_SYSTEM.md` only when needed.
3. Record repository/workspace roots, ecosystem-native validation commands, review base, `.scratch/` ignore and layout policy (one registered effort directory, no root-level/session/round notes), durable Markdown authorities, and release/deploy authority. Unknown production facts stay disabled—not guessed.
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

`inspect → producer → parent gate → two sealed review axes → one scoped fix round → pilot ledger → checkpoint`

For approved worker-writer pilots, ten clean primary real assignments (at least six test-bar and two no-test-bar) are evidence for an owner decision, not automatic promotion. Degraded, fallback, unknown, or silent-thinking rows remain visible but are replaced. Quality precedes a strictly lower matched production-cost comparison; arbitration calls are separate. A trigger records its action and operator consequence, and can demote or disable only the worker writer role, returning selection to the parent writer without disabling evidence, decision, review, or degradation controls. Deterministic fixtures do not promote a route.

The harness batches blocking questions and continues independent work. It always stops for unapproved scope/product/architecture/API/data decisions, destructive or irreversible work, credentials/security boundaries, migrations/data loss, production/push/publish/release/deploy, unsafe dirty state, unresolved blockers, or caps.

`--commit` authorizes precise validated commits only.

## Prerequisites and optional capabilities

| Resource | Needs | If absent |
|---|---|---|
| Subagent-assisted review | `pi-subagents` | structured self-review fallback |
| Web research | `pi-web-access` | skip web-only steps |
| `react-doctor` | `npx react-doctor` + React `src/` | inert outside React |
| `memory-management`, `memory-audit` | memory tools/extension | report unavailable and stop |
| `tldraw-diagrams`, `diagram` | tldraw offline app + its `~/skills/tldraw-offline` operator skill | prompt to install tldraw offline, else fall back to an ASCII sketch |

Memory implementation, auth providers, web access, product UI/theme, vision, notifications, and the third-party tldraw offline app/skill intentionally remain separate packages/project resources.

### Known-good companion stack

The harness runs alone, but highest-effectiveness review/research on the currently validated stack uses:

- `pi-subagents@0.34.0` — independent/forked review and delegation;
- `pi-web-access@0.13.0` — source-backed web/library research;
- `pi-codex-vision@0.1.0` — optional OpenAI/Codex image analysis (`analyze_image`, `/codex-vision`);
- `@hypabolic/pi-hypa@0.1.11` — optional context compression;
- `@gotgenes/pi-anthropic-auth@1.0.0` — optional Anthropic auth compatibility only.

Install only needed, reviewed packages with exact versions; provider/auth packages are environment-specific. These are companions, not bundled dependencies, so `pi-dev-harness` remains useful in isolation and uses documented fallbacks.

## Test-double fidelity contract

Three normative rules against rubber-stamp fakes, with their single authority in
`skills/engineering-workflow/references/tests-and-mocking.md` ("Semantic fidelity of test
doubles"): a semantic argument must be observed by the double (a no-op passthrough proves
nothing), a double standing in for a refusing operation must reproduce at least one declared
refusal path or declare tier blindness naming its covering guard, and a red produced by
increasing a double's fidelity is an implementation defect — never a reason to weaken the
double back to green. `lib/test-double-fidelity.ts` makes the claims executable as a
fail-closed `DoubleFidelityPacket` (distinguishing/refusal/echo/restoration probes with
replay commands and observed outcomes), validated by `validateDoubleFidelityPacket` and
summarized per operation by `summarizeDoubleFidelity`. Spec:
`docs/specs/test-double-fidelity.md`.

## Validate

```bash
npm test
npm run pack:check
npm run smoke:installed
npm run smoke:packed
```

The installed smoke loads Pi twice: package-only in a temporary unrelated project, then integrated with current user packages. The packed smoke additionally packs, installs, and loads the actual tarball to verify published-file closure. Both verify extensions, commands, tools, prompts, skills, diagnostics, and conflicts. Run a final smoke in the real consumer after overlay changes. Expected tests cover ticket readiness/state, continuation coordination, safe-ops policy, package integrity, and setup portability.

## Response-quality evals

`evals/response-quality/` ships a blind, paired judge-and-score harness for user-facing response quality: 19 harness-specific cases (no trivia, no answer-leaking prompts), a weighted rubric (correctness 35 / autonomy 25 / actionability 20 / safety 10 / concision 10), and a lexicographic release gate: zero blockers; a machine-evidence gate for oracle cases; candidate correctness, safety, and autonomy may not regress at all; weighted score must strictly improve; mean assistant tokens may grow at most 10%. `plan` writes a content-hashed manifest (exact case/trial/condition rows including audit rows, per-case oracles, catalog/rubric digests); `blind` and `score` require it and enforce an exact bijection among manifest, responses, key, and judgments. Provenance splits honestly: a shared `environment_hash` (provider, model, effective reasoning level, runner/CLI version, isolated config) must match across conditions, while package treatment provenance (ref, commit SHA, package content digest) must differ — equal package digests are a structural error, not a warning.

`scripts/response-evals.mjs` provides `validate`, `plan`, `blind`, and `score` only. It never calls a provider and ships no runner: response rows and recorded machine evidence are produced through the actual packaged activation path (disposable tool-enabled repos, pinned provider/model/reasoning/CLI/package, isolated Pi home, quota preflight, public audit cases) documented in `evals/response-quality/README.md`, judged blind against cryptographically random, shuffled sample ids, then gated by `score` (exit 0 pass, 1 gate fail, 2 structural error — always machine-readable JSON, for every command). The release path is pinned to the packaged full catalog and rubric: a subset or custom catalog cannot produce a releasable pass. `score` requires the judged samples file (each row digest-bound, rebound to the key and recorded responses) and a judge-provenance record (provider/model/reasoning/runner/version, prompt digest, rubric digest) recorded in the summary. Cases that claim observable behavior declare a small execution oracle (expected/forbidden changed files, forbidden-call patterns matched against recorded commands, gate command) verified from recorded evidence — candidate oracle failures gate the release, baseline oracle results are comparison data; cases without an oracle are prose-only, and the score summary reports both counts — prose scores are never claimed as verified behavior. The treatment is proven active, not merely installed: each condition copies its packaged `templates/APPEND_SYSTEM.md` into the disposable consumer's `.pi/APPEND_SYSTEM.md`, reloads, verifies byte equality, and records an `activation_digest` that `score` requires to differ across conditions (package install alone cannot write `.pi/APPEND_SYSTEM.md`, so it does not activate the always-loaded overlay). Release status: a release that changes the runtime overlay in `templates/APPEND_SYSTEM.md` treats those changed bytes as a **candidate treatment** and must not be tagged/published until a real paired baseline-vs-candidate run of this evaluation has passed `score` end-to-end. No such run exists yet for a new overlay candidate. Releases that leave the overlay byte-identical to the previous tag are outside this treatment gate.

```bash
npm run evals:validate
npm run evals:plan
```

## Acknowledgements

Two pieces of this harness are adapted from [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) at commit [c784dcb](https://github.com/ayghri/i-have-adhd/commit/c784dcb56b07c8c103323f308b25f7b055008baa) (MIT licensed):

- the user-facing response-shape contract (`skills/engineering-workflow/references/response-shape.md`) — the prose-shape rules (answer-first, no preamble/closer, every exception preserved), reworded and re-grounded as a Pi-native, evidence-driven contract;
- the response-quality evaluation design (`evals/response-quality/`) — the weighted 35/25/20/10/10 rubric, blocker veto, blind paired judging, and the `cases.jsonl`/`rubric.md` layout.

The upstream skill shapes output for a reader with ADHD; this harness deliberately drops the upstream list cap, mandatory wall-clock estimates, per-turn prose state recap, the Python subprocess runner, trivia cases, regression tolerance, and any medical framing. Credit stays here; the adapted contracts stand on their own.

## License

MIT
