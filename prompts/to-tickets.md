---
description: Break a spec or plan into small tracer-bullet tickets
argument-hint: "[spec-or-plan]"
---

Use `/skill:engineering-workflow` phase `to-tickets`.

Input: ${1:-current spec/plan/conversation}

Create readiness-gate-compatible tickets with Goal, Scope, Dependencies, testable Acceptance criteria, Validation, and Done when. Prefer tracer-bullet vertical slices; use expand-contract for a wide mechanical refactor whose blast radius cannot stay green slice by slice. Default to `tickets.md` inside one existing/registered `.scratch/<effort>/` directory per `references/scratch-organization.md`; never create standalone or dated/session-named ticket sets unless an issue tracker convention exists.
