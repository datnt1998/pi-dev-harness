# Wayfinder Local Tracker Format

Layout for one effort:

```
.scratch/<effort>/
├── map.md
├── tickets/
│   ├── 001-choose-sync-backend.md
│   ├── 002-offline-conflict-model.md
│   └── ...
└── assets/            ← research notes, prototype pointers (created lazily)
```

`<effort>` is a short kebab-case slug. Ticket ids are zero-padded sequence numbers; scan `tickets/` for the highest and increment. A ticket's filename never changes after creation (links depend on it).

## map.md

```markdown
---
effort: multi-device-sync
status: charting   # charting | working | complete
---

# Map: Multi-device sync

## Destination

A reviewed spec for multi-device sync, ready for /to-tickets.

## Notes

- Domain vocabulary lives in CONTEXT.md; keep it updated via /skill:domain-modeling.
- Prefer boring tech; the tracker is a personal tool, not a product.

## Decisions so far

- [Choose sync backend](tickets/001-choose-sync-backend.md) — SQLite + Litestream to object storage; no server component.

## Not yet specified

- Something about migration of existing local data — depends on backend choice.

## Out of scope

- [Real-time collaborative editing](tickets/004-realtime-collab.md) — single-user tool; ruled out, revisit only if the destination is redrawn.
```

## tickets/NNN-slug.md

```markdown
---
id: 001
title: Choose sync backend
type: grilling      # research | prototype | grilling | task
status: open        # open | claimed | closed | out-of-scope
blocked-by: []      # ticket ids, e.g. [002, 003]
claimed-by: ""      # who/which session is working it, e.g. "dat 2026-07-12"; "" = unclaimed
---

## Question

Which sync backend fits a single-user local-first app: hosted DB, object storage, or peer-to-peer?

## Answer

<filled on resolution: the decision and its reasoning, links to assets.
 Closing a ticket = writing this section, setting status: closed, and
 appending one gist line to the map's Decisions so far.>
```

## Conventions

- **Claim before work**: set `status: claimed` + `claimed-by` in the same edit, before reading deeply. Re-read frontmatter right before claiming — another session may have taken it.
- **Frontier query**: tickets with `status: open`, empty `claimed-by`, and every `blocked-by` id pointing at a `closed` ticket. Check with a quick scan:

  ```bash
  grep -l "status: open" .scratch/<effort>/tickets/*.md
  ```

  then verify blockers by reading the listed files' frontmatter.
- **Assets**: research notes and prototype pointers go under `assets/` (or a linked throwaway branch), linked from the ticket's Answer — never pasted into the map.
- **Answers are immutable history**: to revisit a closed decision, open a *new* ticket that supersedes it and link both ways; don't rewrite the old Answer.
