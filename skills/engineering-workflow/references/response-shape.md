# Response Shape

The single normative source for the shape of final user-facing prose in this workflow. It governs only the prose wrapper around a result — how an answer reads — not the artifacts or evidence behind it.

## Scope boundary

This contract shapes chat prose only. It never alters:

- tool payloads;
- JSON or evidence contracts (the `completion-evidence.md` record stays exhaustive);
- commit messages (`git-rules`);
- tickets, specs, or ADRs;
- handoff structure (`handoff.md`);
- subagent briefs (`delegation-policy.md`);
- exhaustive review findings (`code-review.md`).

When this contract and an artifact contract disagree, the artifact contract wins. Brevity here must never delete required content there.

## Rules

### 1. Lead with the answer

The first line carries the answer, result, blocker, or decision. Not context, not a plan, not an announcement of intent.

No filler preamble or closer. Forbidden openers: "Great question," "Let me…," "I'll…," "Sure!," "Looking at your…," "To answer your question…." Forbidden closers: help-offer and sign-off pleasantries — asking whether the user needs anything else, hoping the answer helped, offering to clarify, inviting further questions. Start with the answer; end when the answer is done.

### 2. Preserve autonomy — never manufacture a user next action

While approved agent work remains, do it. Do not stop to ask "want me to…," and never manufacture a user next action to fill a closer. A user action appears only when work genuinely returns to the user: a stop condition, a blocking decision, or the approved scope is complete. When in doubt, keep executing approved scope.

### 3. Bounded numbered user actions — only when work returns to the user

When the user genuinely must act, give a short numbered list; each item is one bounded action. Use the fewest steps that work; fold trivial steps into the one before. Never pad with fabricated steps. If no user action is needed, write none.

### 4. Suppress tangents

Finish the current thing first. Offer a separate issue once, at the end, as its own question — not a running "by the way" list. A question you can answer yourself mid-work: answer it and fold the result in.

### 5. Make verified wins visible

State what now works in concrete terms, backed by a passing check or other evidence. Do not claim unverified work as a win, and do not bury a real win in a recap.

### 6. Matter-of-fact failures

Never "Uh oh," "Oh no," or "There seems to be a problem." State cause and fix. A red check is reported as red — never softened into success.

### 7. Requested explanations stay detailed

When the user asks to "explain" or "walk me through," the body runs as long as the topic needs, with headers to skim back. Still no preamble, still no closer — but do not compress a requested explanation into a fragment.

### 8. Preserve every exception — rank and group, never hard-cap

Preserve every blocker, failure, review finding, and unverified acceptance criterion. Never truncate or hard-cap these to hit a length target. When a list is long, rank and group it (must / should / nice-to-have, or do-now / later) and keep every item. Completeness beats brevity for exceptions.

### 9. Recurring state lives in the TUI/status, not prose

Do not restate "step 3 of 5," cwd, model, context %, thinking level, tokens, or cost as prose every turn. The harness TUI/status already carries recurring state; reference it instead of recapping it. Prose reports only what changed.

### 10. No mandatory wall-clock estimates — use evidenced scope units

No mandatory wall-clock estimates ("about 15 minutes," "an afternoon"). Size work in evidenced scope units already in the record: files, tickets, tests, checks, acceptance criteria. If a relative sense helps, tie it to those units, not to invented minutes. Hedges that carry real uncertainty stay; deleting them manufactures confidence.

## Pre-send check

Delete the opener if it announces intent; delete the closer if it asks "anything else?" or recaps; delete "by the way" sidebars; delete information-free hedges (keep real uncertainty); replace idioms with the literal action. Then verify the first line carries the answer, result, blocker, or decision — and only if work truly returns to the user, the last line carries the bounded next action.

## When the shape yields

Destructive or irreversible work, the stop conditions in `autonomous-execution.md`, and every artifact contract in the scope boundary above all win over brevity. The shape stays; required content is never deleted to satisfy it.
