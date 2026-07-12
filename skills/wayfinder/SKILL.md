---
name: wayfinder
description: "Plan a huge, foggy chunk of work — more than one agent session can hold — as a shared map of investigation tickets under .scratch/, resolved one per session until the way to the destination is clear. Use when the user invokes /wayfinder, has a greenfield project or oversized feature idea, or when grilling keeps surfacing questions that each need their own session."
---

# Wayfinder

A loose idea has arrived — too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** in the repo, then works its tickets one at a time until the route is clear.

Adapted for Pi from mattpocock/skills (MIT). Uses a local markdown tracker; formats live in `MAP-FORMAT.md` (same directory).

## Plan, don't do

Wayfinder is **planning**: each ticket resolves a decision, and the map is done when the way is clear — nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off to the execution pipeline (`/to-spec` → `/to-tickets` → `/prepare-tickets` → `/implement-all`). Absent an explicit override in the map's **Notes**, produce **decisions, not deliverables**.

## Refer by name

Every ticket has a **name** — its title. In everything the human reads, refer to it by name with a link, never by a bare id. A wall of `001, 002, 003` is illegible; names read at a glance.

## The Map

The map lives at `.scratch/<effort>/map.md`; tickets are files under `.scratch/<effort>/tickets/`. Exact formats: `MAP-FORMAT.md`.

The map is an **index**, not a store. It lists decisions made and points at the tickets that hold their detail; a decision lives in exactly one place — its ticket — so the map never restates it, only gists it and links. Open tickets are **not** listed in the map — they are found by scanning `tickets/` frontmatter.

Map sections:

- **Destination** — what reaching the end looks like (a spec, a decision, a change). One or two lines; every session orients to it before choosing a ticket.
- **Notes** — domain, skills every session should consult, standing preferences.
- **Decisions so far** — one line per closed ticket: `[title](tickets/NNN-slug.md) — gist`.
- **Not yet specified** — the fog (see below).
- **Out of scope** — work consciously ruled beyond the destination.

## Tickets

Each ticket is one **question**, sized to one agent session. Status, type, blocking, and claims live in frontmatter (see `MAP-FORMAT.md`).

- A ticket is **unblocked** when every ticket in its `blocked-by` is closed.
- The **frontier** = open, unblocked, unclaimed tickets — the edge of the known.
- A session **claims** a ticket by setting `claimed-by` **first**, before any work, so concurrent sessions skip it. An open, unclaimed ticket is takeable.

### Ticket types → Pi tools

Every ticket is **HITL** (worked *with* the user — the agent never answers the user's side itself) or **AFK** (agent-driven):

- **research** (AFK): investigate against primary sources; delegate to the `researcher` subagent with `pi-web-access`; output a cited markdown file linked from the ticket.
- **prototype** (HITL): raise discussion fidelity with a cheap runnable artifact via `/skill:prototype`; link the prototype branch as an asset. Use when "how should it look/behave" is the question.
- **grilling** (HITL, the default): interview via `/grill-with-docs`, with `/skill:domain-modeling` maintaining `CONTEXT.md`/ADRs inline.
- **task** (HITL or AFK): manual work that must happen before a decision can be made (sign up for a service, provision access, move data). The one type that *does* — and it earns its place by unblocking a decision. The answer records what was done and any resulting facts later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. **Not yet specified** holds the dim view — suspected questions you can't phrase sharply yet. Resolving a ticket clears fog, graduating whatever's now specifiable into fresh tickets.

**Fog or ticket?** The test is whether you can state the question precisely **now** — not whether you can answer it now.

- **Ticket when** the question is sharp — even if blocked.
- **Fog when** you can't phrase it that sharply. Don't pre-slice fog into ticket-sized pieces; one patch may graduate into several tickets, or none.

## Out of scope

The destination fixes the scope; work beyond it is out of scope — not fog. When an existing ticket turns out to sit past the destination, **close it** with `status: out-of-scope` and add one line to the map's Out of scope section (gist + why, linking the ticket). It stays out of Decisions so far. Out-of-scope work never graduates — it returns only if the destination is redrawn, as a fresh effort.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session** — this pairs with autocompact and `/handoff` for session hygiene.

### Chart the map (user brings a loose idea)

1. **Name the destination.** Run `/grill-with-docs` (+ `/skill:domain-modeling`) to pin down what this map is finding its way to. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first**: fan out across the whole space, surfacing open decisions and first takeable steps. **If this surfaces no fog** — the journey fits one session — you don't need a map. Stop and suggest the normal flow (`/to-spec` or direct implement).
3. **Create the map** at `.scratch/<effort>/map.md`: Destination and Notes filled, Decisions empty, fog sketched into Not yet specified.
4. **Create the tickets you can specify now**, then wire `blocked-by` edges in a **second pass** (tickets need ids before they can reference each other).
5. Stop — charting is one session's work; do not also resolve tickets.

### Work through the map (user brings a map path, ticket optional)

1. Load the **map** — the low-res view, not every ticket body.
2. Choose the ticket. If the user named one, use it; otherwise take the first frontier ticket. **Claim it** (set `claimed-by`) before any work.
3. Resolve it — zoom into related/closed tickets on demand; use the tool its type names; consult the map's Notes.
4. Record the resolution: write the **Answer** section in the ticket, set `status: closed`, append one line to the map's Decisions so far.
5. Add newly-surfaced tickets (create-then-wire); graduate fog the answer made specifiable, removing it from Not yet specified. If the answer reveals a ticket sits beyond the destination, rule it out of scope. If the decision invalidates other tickets, update or delete them.

Expect other sessions to be editing the effort concurrently — re-read ticket frontmatter before claiming.

## Done — merging onto the main flow

When no open tickets remain and Not yet specified is empty, the way is clear. Propose the exit named by the Destination: usually `/to-spec` (feeding Decisions so far), then `/to-tickets` → `/prepare-tickets` → `/implement-all`. If the effort turned out small, go straight to `/implement`.
