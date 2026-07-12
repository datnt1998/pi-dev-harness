---
description: Polish Pi TUI/UX without hiding important default info
argument-hint: "[component]"
---

Polish the Pi TUI for ${1:-the current component}.

Constraints:
- Do not hide cwd/path, model, context usage, context %, max context, or thinking level.
- Keep built-in header unless there is a strong reason to replace it.
- Make layouts responsive for narrow terminals.
- Prefer overlay panels for detailed information.
- Add cleanup on session_shutdown for custom UI state.
