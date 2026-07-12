---
description: Break a spec or plan into small tracer-bullet tickets
argument-hint: "[spec-or-plan]"
---

Use `/skill:engineering-workflow` phase `to-tickets`.

Input: ${1:-current spec/plan/conversation}

Create small tracer-bullet tickets with dependencies, validation, and recommended order. Default to local markdown under `.scratch/` unless an issue tracker convention exists.
