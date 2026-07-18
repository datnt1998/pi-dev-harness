---
description: Polish web UI (React/Tailwind/motion) with design-engineering details
argument-hint: "[file or component]"
---

Use `/skill:make-interfaces-feel-better` to review and polish the web UI for ${1:-the current component}.

Scope:
- Discover the repository's React/Tailwind/motion frontend root (NOT the Pi terminal UI — use `/tui-polish` for that).
- If no target is given, infer it from the current diff; ask only when ambiguity changes scope.

Apply the skill's principles, prioritizing what this stack supports:
- Concentric border radius on nested surfaces (outer = inner + padding).
- Optical over geometric alignment for icons/buttons (`lucide-react`).
- `motion` spring transitions with `bounce: 0`; `initial={false}` on `AnimatePresence` for default-state elements.
- `scale(0.96)` on press; tabular-nums for dynamic numbers; `text-wrap: balance`/`pretty`.
- Specific `transition-property` only — never `transition: all`; `will-change` sparingly.
- Minimum hit area (44×44px touch/mobile, ≥40×40px dense desktop).

Constraints:
- Small, reversible edits; cite the exact file and property changed.
- Preserve Radix accessibility behavior and existing keyboard/focus handling.
- Present results as the skill's Before/After markdown tables grouped by principle.
