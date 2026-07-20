---
description: Draw or edit a diagram on the tldraw offline canvas (installs the tooling if missing), delegating to the operator skill
argument-hint: "[what to draw or the doc/page to edit]"
---

Use `/skill:tldraw-diagrams` to put a diagram on the user's tldraw offline canvas.

Task: $ARGUMENTS

- First ensure the tooling is installed: operator skill at `~/skills/tldraw-offline/SKILL.md` and the app running (its server file). If missing, install tldraw offline (`https://offline.tldraw.com`) and enable agent skills before drawing; do not fabricate install steps — ask the user if it cannot be confirmed.
- Then read and follow `~/skills/tldraw-offline/SKILL.md` verbatim for all canvas operations (auth, focused doc, `/exec` edits, bound arrows, lint, screenshot).
- Keep labels plain and readable, color-code by role, add a named page instead of clobbering, use bound arrows, run lint, and verify once.
