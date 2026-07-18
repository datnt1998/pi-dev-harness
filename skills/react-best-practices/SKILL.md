---
name: react-best-practices
description: "React performance and architecture best practices: eliminating waterfalls, bundle size, re-render optimization, rendering performance, composition patterns, JS micro-optimizations. Use when writing, reviewing, or refactoring React components, hooks, data fetching, or when asked about performance, re-renders, memoization, bundle size, or component API design."
---

# React Best Practices

Curated performance + architecture rules for browser-focused React applications. Adapted for Pi from vercel-labs/agent-skills `react-best-practices` and `composition-patterns` (MIT, Vercel Engineering). First detect the project's React version and framework. These references omit most server/RSC-specific guidance; in Next/Remix or server-rendered apps, follow framework boundaries and skip any SPA advice that conflicts with them.

## How to use

1. Identify which categories the task touches (table below).
2. Read ONLY those reference files — each is self-contained with
   incorrect/correct examples.
3. Apply in priority order: waterfalls and bundle wins dwarf micro-optimizations.
4. Never memoize by default: fix architecture (state placement, derived state,
   component extraction) before reaching for `useMemo`/`useCallback`/`memo`.

## Categories by priority

| Priority | Reference | Impact | Use when |
| --- | --- | --- | --- |
| 1 | [waterfalls.md](references/waterfalls.md) | CRITICAL | async code, data fetching, `await` chains, Suspense |
| 2 | [bundle.md](references/bundle.md) | CRITICAL | imports, heavy deps, code splitting, startup cost |
| 3 | [rerender.md](references/rerender.md) | MEDIUM | state design, memoization, effects, derived state |
| 4 | [rendering.md](references/rendering.md) | MEDIUM | large lists, conditional render, hydration, SVG, transitions |
| 5 | [client.md](references/client.md) | MEDIUM | event listeners, localStorage, request dedup |
| 6 | [composition.md](references/composition.md) | MEDIUM | component APIs, boolean-prop sprawl, compound components, React 19 ref-as-prop |
| 7 | [js.md](references/js.md) | LOW-MED | hot loops, string/array work, Set/Map lookups |

## Non-negotiables (always active, no reference read needed)

- Derive state during render; never mirror props/state into other state via effects (`rerender-derived-state-no-effect`).
- Functional `setState` when next depends on previous (`rerender-functional-setstate`).
- Lazy state init for expensive initial values: `useState(() => ...)` (`rerender-lazy-state-init`).
- No inline component definitions inside render (`rerender-no-inline-components`).
- `Promise.all` for independent async work (`async-parallel`).
- Import concrete modules, not barrels (`bundle-barrel-imports`).
- Prefer explicit variant props / compound components over boolean-prop accretion (`architecture-avoid-boolean-props`).
- On React 19+, `ref` is a normal prop; on React 18 or earlier, keep the framework-compatible `forwardRef` pattern (`react19-no-forwardref`).

## Project integration

- Prefer pure logic in framework-neutral modules behind deep seams; keep hooks/components focused on React coordination and rendering.
- Route browser storage or external clients through an existing project seam; do not invent a `src/lib/storage.ts` convention when the repository uses another architecture.
- Follow the repository's file-size/component conventions. Extract components for a clear ownership or render boundary, not an arbitrary package default.
- Record framework/version, frontend roots, storage/data seams, and any line budget in the project's `AGENTS.md`.
