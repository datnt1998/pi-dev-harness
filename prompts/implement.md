---
description: Implement an approved spec/ticket in small tested slices
argument-hint: "<spec-or-ticket>"
---

Use `/skill:engineering-workflow` phase `implement` for:

$ARGUMENTS

Treat the named approved target as one approval envelope. Inspect → implement → validate → review → scoped fixes → checkpoint without intermediate questions. Ask one batched question set only when ambiguity crosses the stop conditions in `autonomous-execution.md`; continue independent approved work first. Keep one writer. Follow `testing-strategy.md`: test application-owned behavior, run repository-native lint/type-check first when available, then the smallest related behavioral guard; broaden only for a named boundary/risk and reserve the full suite for repository-required/requested/release gates. Run sequentially by default. For behavior changes and bug fixes, require a meaningful focused red before production implementation; use an explicit not-applicable reason plus alternative evidence for pure refactors, non-behavioral docs, generated output, or no runnable seam. Expected TDD red proceeds to minimal implementation; diagnose every unexpected red before a bounded rerun, and never weaken a guard merely to restore green. Use `diff-aware-testing.md` for focused mapping, fresh falsification + adversarial-authority review, `completion-evidence.md`, then `/skill:git-rules`. Do not commit unless explicitly authorized; commit permission never implies push/release/deploy.
