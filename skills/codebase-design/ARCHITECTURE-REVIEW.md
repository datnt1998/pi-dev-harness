# Architecture Review

An active scan for **deepening opportunities** — refactors that turn shallow modules into deep ones — presented as a report, then grilled one at a time. Assumes the vocabulary in `SKILL.md` (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and the discipline in `DEEPENING.md`. Adapted for Pi from mattpocock/skills (MIT).

Vocabulary is load-bearing: use these terms exactly in every suggestion — never drift into "component," "service," "API," or "boundary." Name modules with `CONTEXT.md` domain terms, not internal class names.

## 1. Scope before you scan — YAGNI

Deepening pays off by making *future* changes easier, so weight the parts that keep changing. Decide *where* to look before looking:

- If the user named a direction (a module, subsystem, pain point), take it and skip inference.
- Otherwise walk recent history (`git log --oneline`) for hot spots — files/areas that keep coming up — and let those pull attention first. Scattered with no hot spot → widen the net.

Read `CONTEXT.md` and any ADRs in the area first; ADRs record decisions this review must not re-litigate.

Explore organically (use a `scout`/read-only subagent when the surface is large). Note where you feel friction:

- Understanding one concept requires bouncing between many small modules.
- Modules are **shallow** — interface nearly as complex as the implementation.
- Pure functions extracted only for testability, but real bugs hide in how they're called (no **locality**).
- Tightly-coupled modules leak across their seams.
- Parts that are untested or hard to test through their current interface.

Apply the **deletion test** to anything suspected shallow: would deleting it *concentrate* complexity, or just move it? "Concentrates" is the signal.

## 2. Present candidates as a report

Write a self-contained report to the OS temp dir so nothing lands in the repo. Resolve `$TMPDIR` → `/tmp` (or `%TEMP%` on Windows); write `<tmpdir>/architecture-review-<timestamp>.html` (fresh per run) and print the absolute path. An HTML file (Tailwind + Mermaid via CDN, before/after diagrams) is ideal when the user can open it; fall back to a Markdown report otherwise. For canvas diagrams, `/skill:tldraw-diagrams` is available.

Each candidate is a card:

- **Files** — modules involved.
- **Problem** — why the current shape causes friction.
- **Solution** — plain-English change.
- **Benefits** — in terms of **locality**, **leverage**, and how tests improve.
- **Before / After** — side-by-side, illustrating the shallowness and the deepening.
- **Recommendation strength** — `Strong` | `Worth exploring` | `Speculative`.

End with a **Top recommendation**: which to tackle first and why.

**ADR conflicts**: only surface a candidate that contradicts an ADR when the friction is real enough to reopen it; mark it clearly (_"contradicts ADR-000X — worth reopening because…"_). Don't list every refactor an ADR forbids.

Do NOT propose concrete interfaces yet. After writing the file, ask: "Which would you like to explore?"

## 3. Grilling loop

Once the user picks a candidate, grill the decision tree (`/skill:engineering-workflow` phase `grill-with-docs`, or the grilling discipline directly): constraints, dependencies, the shape of the deepened module, what sits behind the seam, which tests survive.

Keep the domain model current inline (`/skill:domain-modeling`):

- Naming a deepened module after a concept absent from `CONTEXT.md` → add the term (create the file lazily if needed).
- Sharpening a fuzzy term mid-conversation → update `CONTEXT.md` right there.
- User rejects a candidate with a load-bearing reason → offer an ADR so future reviews don't re-suggest it. Only when the reason would actually be needed to avoid re-suggestion; skip ephemeral ("not now") and self-evident ones.
- Exploring alternative interfaces → use `DESIGN-IT-TWICE.md` (parallel pi-subagents, compared on depth/locality/seam placement).
