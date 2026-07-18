## Pi Engineering Harness

- Use `/skill:engineering-workflow` for engineering work and `/skill:pi-harness` for Pi resources.
- Approved reversible work runs end-to-end without intermediate confirmation; safety stop conditions remain mandatory.
- Reports: shortest useful form; expand only exceptions.
- Use `/implement-all <tickets-or-manifest> [--commit]` for autonomous batches; `/implementation-status [--verbose]`; `/implement-all-stop`.
- `safe-ops` is a narrow model-tool guardrail, not a sandbox.
- Bootstrap from the package's `templates/PROJECT_SETUP.md`; record repository/workspace roots, exact validation commands + working directories, review base, scratch ignore policy, release source, deploy trigger, and UI visibility requirements below this section.
- Release automation stays disabled until version, notes, tag/push, deploy trigger, rollback, and smoke facts are repository-evidenced.
