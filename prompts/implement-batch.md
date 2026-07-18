---
description: Run or continue an approved ticket batch manually; prefer /implement-all when the packaged runner is active
argument-hint: "<manifest-or-tickets-path> [--commit]"
---

Use `/skill:ticket-readiness` and `/skill:batch-implementation` for:

$ARGUMENTS

If `/implement-all` is available, tell the user the single preferred command and stop; that extension command owns durable autonomous execution. Otherwise use the skill's manual fallback: gate live tickets, run only READY/AUTO_FIXED work in dependency order, continue independent work, batch decisions, validate/review/fix, and report tersely. `--commit` authorizes precise validated commits only; never push, release, deploy, migrate, or use credentials without separate approval.
