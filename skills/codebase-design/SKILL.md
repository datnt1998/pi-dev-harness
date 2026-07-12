---
name: codebase-design
description: "Shared vocabulary and discipline for designing deep modules: small interfaces, clean seams, testable through the interface. Use when designing or improving a module's interface, deciding where a seam goes, making code more testable or agent-navigable, or when another skill needs the deep-module vocabulary."
---

# Codebase Design

Design **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. Use this language and these principles wherever code is being designed or restructured. The aim is leverage for callers, locality for maintainers, and testability for everyone.

Adapted for Pi from mattpocock/skills (MIT).

## Glossary

Use these terms exactly — don't substitute "component," "service," "API," or "boundary." Consistent language is the whole point.

- **Module** — anything with an interface and an implementation. Deliberately scale-agnostic: a function, class, package, or tier-spanning slice. _Avoid_: unit, component, service.
- **Interface** — everything a caller must know to use the module correctly: the type signature, but also invariants, ordering constraints, error modes, required configuration, and performance characteristics. _Avoid_: API, signature (too narrow).
- **Implementation** — what's inside a module, its body of code.
- **Depth** — leverage at the interface: the amount of behaviour a caller (or test) can exercise per unit of interface they have to learn. Deep = small interface, lots of behaviour. Shallow = interface nearly as complex as the implementation.
- **Seam** _(Michael Feathers)_ — a place where you can alter behaviour without editing in that place; the *location* at which a module's interface lives. Where the seam goes is its own design decision. _Avoid_: boundary (overloaded with DDD's bounded context).
- **Adapter** — a concrete thing that satisfies an interface at a seam. Describes *role* (what slot it fills), not substance.
- **Leverage** — what callers get from depth: more capability per unit of interface learned. One implementation pays back across N call sites and M tests.
- **Locality** — what maintainers get from depth: change, bugs, knowledge, and verification concentrate in one place. Fix once, fixed everywhere.

## Deep vs shallow

Deep module = small interface + lots of implementation. Shallow module = large interface + little implementation (avoid — often just a pass-through).

When designing an interface, ask:

- Can I reduce the number of methods?
- Can I simplify the parameters?
- Can I hide more complexity inside?

## Principles

- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small, mockable, swappable parts — they just aren't part of the interface. A module can have **internal seams** (private to its implementation, used by its own tests) as well as the **external seam** at its interface.
- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.** Callers and tests cross the same seam. If you want to test *past* the interface, the module is probably the wrong shape.
- **One adapter means a hypothetical seam. Two adapters means a real one.** Don't introduce a seam unless something actually varies across it.

## Designing for testability

1. **Accept dependencies, don't create them.** `processOrder(order, paymentGateway)` beats constructing the gateway inside.
2. **Return results, don't produce side effects.** `calculateDiscount(cart): Discount` beats mutating the cart in place.
3. **Small surface area.** Fewer methods = fewer tests needed. Fewer params = simpler test setup.

This project applies it as: pure logic in `.pi/lib/` or `src/lib/`, thin shells (extensions, UI) around it, tests against the pure interface (`npm run test:harness`).

## Relationships

- A **Module** has exactly one **Interface**; **Depth** is measured against it.
- A **Seam** is where the **Interface** lives; an **Adapter** sits at a seam and satisfies the interface.
- **Depth** produces **Leverage** for callers and **Locality** for maintainers.

## Rejected framings

- **Depth as ratio of implementation-lines to interface-lines**: rewards padding the implementation. Use depth-as-leverage instead.
- **"Interface" as the TypeScript `interface` keyword**: too narrow — interface here includes every fact a caller must know.
- **"Boundary"**: say **seam** or **interface**.

## Going deeper

- **Deepening a cluster given its dependencies** — read `DEEPENING.md` (same directory): dependency categories, seam discipline, replace-don't-layer testing.
- **Exploring alternative interfaces** — read `DESIGN-IT-TWICE.md` (same directory): fan out parallel pi-subagents to design the interface several radically different ways, then compare on depth, locality, and seam placement.
