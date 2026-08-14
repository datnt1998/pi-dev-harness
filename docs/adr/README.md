# Architectural Decision Records

This directory holds numbered ADRs for the pi-dev-harness project.

## Statuses

- **proposed** — under discussion, not yet decided. The record states the options and trade-offs.
- **accepted** — decided and in effect. The record states what was chosen and why.
- **rejected** — a considered option that was not chosen. The record states which option was rejected and the reason in one short section. Rejected records are frozen after closure; they document reasoning but do not change behavior.

## Rules

1. **Sequential numbering**: ADRs are numbered `NNNN-<slug>.md` starting from `0001`. Numbers are never reused.
2. **Promotion**: a `proposed` ADR becomes `accepted` when the decision is made. Update the frontmatter `status` field.
3. **Freeze**: a `rejected` ADR is immutable after closure. Do not edit its content or status.
4. **Frontmatter**: every ADR must have YAML frontmatter with at least `status` (one of `proposed`, `accepted`, `rejected`) and a title in the first heading.
