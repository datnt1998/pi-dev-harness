# Design It Twice

When the user wants to explore alternative interfaces for a chosen deepening candidate, use this parallel subagent pattern. Based on "Design It Twice" (Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in `SKILL.md` — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before spawning subagents, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see `DEEPENING.md`)
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2. The user reads and thinks while the subagents work in parallel.

### 2. Fan out pi-subagents

Use the `subagent` tool in PARALLEL mode with 3+ read-only design tasks (e.g. `planner` or `oracle` agents — never `worker`; this phase produces designs, not edits). Each must produce a **radically different** interface for the deepened module.

Prompt each subagent with a separate technical brief (file paths, coupling details, dependency category from `DEEPENING.md`, what sits behind the seam). Give each a different design constraint:

- Task 1: "Minimize the interface — aim for 1–3 entry points max. Maximise leverage per entry point."
- Task 2: "Maximise flexibility — support many use cases and extension."
- Task 3: "Optimise for the most common caller — make the default case trivial."
- Task 4 (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both the `SKILL.md` vocabulary and `CONTEXT.md` vocabulary in the brief so each subagent names things consistently with the architecture language and the project's domain language.

Each subagent outputs:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see `DEEPENING.md`)
5. Trade-offs — where leverage is high, where it's thin

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu. The parent session synthesizes and (after approval) applies the chosen design as the sole writer.
