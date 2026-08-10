## Pi Engineering Harness

- Use `/skill:engineering-workflow` for engineering work and `/skill:pi-harness` for Pi resources.
- Approved reversible work runs end-to-end without intermediate confirmation; safety stop conditions remain mandatory.
- Reports follow the response-shape contract (/skill:engineering-workflow → references/response-shape.md); the reference is normative.
- Use `/implement-all <tickets-or-manifest> [--commit]` for autonomous batches; `/implementation-status [--verbose]`; `/implement-all-stop`.
- `safe-ops` is a narrow model-tool guardrail, not a sandbox.
- Docs require a consumer, canonical path, owner, and deletion trigger. Default to chat; cross-session work uses one `.scratch/<effort>/` registry, with no root/session/round notes. Use `/tidy-docs` for drift/orphans/completed efforts.
- Bootstrap from `templates/PROJECT_SETUP.md`; record roots, exact checks + working directories, review base, scratch/doc authority policy, release/deploy facts, and UI visibility requirements.
- Release automation stays disabled until version, notes, tag/push, deploy trigger, rollback, and smoke facts are repository-evidenced.
- After compaction, do not act on summarized memory of a skill or reference file — re-read it first.
- Tool-state directories (subagent artifacts, session logs) are never project evidence; repo-wide search uses ignore-respecting tools.
