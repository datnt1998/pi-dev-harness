---
description: Turn the current conversation or plan into a concrete spec
argument-hint: "[scope]"
---

Use `/skill:engineering-workflow` phase `to-spec`.

Scope: ${1:-current conversation}

Synthesize the current conversation and repository evidence into a concrete spec with goal, non-goals, requirements, acceptance criteria, risks, validation plan, and explicit open questions. Do not restart the requirements interview. Ask only when publishing the spec would require an unapproved decision or a newly proposed test seam needs confirmation.
