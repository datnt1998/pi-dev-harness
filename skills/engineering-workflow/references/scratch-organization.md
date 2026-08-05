# Scratch and Markdown Organization

Use this contract whenever an agent may create a Markdown file or anything under
`.scratch/`. The default is **no new file**: answer in chat unless a named future
consumer needs repository-local state.

## Creation gate

Before writing, state five facts internally:

1. **Consumer** — the next command, session, agent, or human that will read it.
2. **Artifact type** — plan, report, spec, ADR, vocabulary/context, ticket/map, or runtime output.
3. **Persistence tier** — durable authority, cross-session working state, or session-only output.
4. **Canonical path** — the one existing or allowed file that owns this information.
5. **Owner and deletion trigger** — who keeps it current and the observable event that removes or supersedes it.

Every answer is mandatory. If any is missing, do not create the file. Search for an
existing effort and canonical artifact before creating another one.

## Path routing

| Information | Canonical destination |
|---|---|
| Stable agent routing/instructions | repository-declared `AGENTS.md` / Pi overlay |
| Domain vocabulary | `CONTEXT.md` or repository-declared glossary |
| Intended behavior and acceptance | repository-declared living spec path |
| Durable architectural decision | repository-declared ADR path |
| Multi-session disposable work | `.scratch/<effort>/` |
| Logs, probes, generated output | `.scratch/<effort>/tmp/` or tool runtime directory |
| Session summary with no future consumer | chat only |

Do not place plans, review reports, worker reports, scratch notes, or generated
logs in the repository root or durable `docs/` paths. Repository-specific signed
authorities override the generic destinations above.

## One effort, one directory

Every cross-session working set uses one short kebab-case effort slug:

```text
.scratch/<effort>/
├── index.md       # required; map.md may serve instead for Wayfinder
├── map.md         # Wayfinder only
├── tickets.md     # implementation tickets, when needed
├── tickets/       # Wayfinder decision tickets, when needed
├── handoff.md     # one replace-in-place continuation note, when needed
├── assets/        # only evidence referenced by a retained artifact
└── tmp/           # probes, logs, generated output; no durable claims
```

Rules:

- No files directly under `.scratch/`.
- Reuse an active effort for the same goal; do not create date-, session-, agent-,
  model-, review-round-, `final`, `v2`, or `misc` sibling directories/files.
- `index.md` is the registry, not a diary. Wayfinder's `map.md` may replace it when
  it carries the lifecycle fields below.
- Keep one canonical file per role. Update `handoff.md` and `tickets.md` in place.
- Subagent output stays in its runtime artifact directory. Copy only the minimum
  load-bearing evidence needed by a named later consumer.
- A file not linked from `index.md`, `map.md`, a ticket, or `handoff.md` is an orphan
  and must be linked, promoted, or deleted before handoff.

Required frontmatter for `index.md` or the Wayfinder `map.md`:

```yaml
---
effort: short-kebab-slug
status: active        # active | blocked | complete; Wayfinder may use charting | working | complete
owner: durable-person-or-role
created: YYYY-MM-DD
delete-when: observable completion or supersession event
authority: none       # scratch is never authority
---
```

The body contains only: goal, governing authority links, retained artifact links,
and the exit/deletion condition. Do not narrate session history. Transfer `owner`
during handoff when responsibility changes.

## Markdown density

Prefer names, types, tests, code, and canonical authority over explanatory notes.
Do not persist:

- prose that merely repeats code, a ticket, or another document;
- per-round review/worker reports when the source runtime artifact exists;
- speculative proposals with no named decision consumer;
- duplicate summaries (`summary-final-v2.md`, dated copies, or status diaries).

When evidence must persist across sessions, consolidate it by subject in one linked
asset and replace stale content instead of appending another report.

## Close-out

Before handoff or completion:

1. Inventory session-only Markdown, `tmp/` output, orphans, and duplicates; propose
   deletion rather than applying it implicitly.
2. Consolidate retained evidence after deletion approval.
3. Promote durable outcomes to the governing spec, ADR, or vocabulary authority.
4. Update `index.md`/`map.md` status and the single `handoff.md` if another session
   still needs the effort.
5. When the effort is complete and promoted, propose deleting the whole effort directory.

Apply deletions only with explicit user approval. Scratch is commonly gitignored and
may be non-recoverable, including files created during the current session. A tracked
`.scratch/**` path is a repository-policy exception that must be explicit; otherwise
report it as drift.

## Sweep checks

A hygiene sweep checks at least:

```bash
find .scratch -maxdepth 1 -type f
find .scratch -type f -name '*.md'
git ls-files '.scratch/**'
```

Flag top-level files, missing registries, unlinked Markdown, duplicate effort roots,
per-round/status-report sediment, completed efforts, and tracked scratch without an
explicit repository exception.
