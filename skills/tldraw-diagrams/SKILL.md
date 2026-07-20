---
name: tldraw-diagrams
description: "Draw and edit visual diagrams on the user's tldraw offline canvas — architecture, workflow, flow, and handoff visuals — by delegating to the installed tldraw-offline operator skill. Use when the user asks to visualize a design, sketch a diagram/flow/architecture on a canvas, or turn an ASCII/textual diagram into a real tldraw drawing. If the operator skill or app is not installed, guide the user through installing tldraw offline first."
---

# tldraw Diagrams

Harness bridge for putting engineering diagrams onto the user's **tldraw offline**
canvas. This skill does not reimplement the canvas API — it **ensures the tooling
is installed, then delegates every canvas operation to the third-party
`tldraw-offline` operator skill**.

> tldraw offline is a separate, proprietary desktop app ("not open source, all
> rights reserved"). Never vendor or copy its skill/API into this package or a
> project; reference and delegate only. It officially supports Pi as an agent.

## When to use

- Turn a design, architecture, or workflow discussion into a real diagram.
- Convert an ASCII/textual sketch (e.g. from `handoff` or `code-review`) into a canvas.
- Edit/arrange/connect/lint an already-open tldraw document.

Prefer a quick ASCII sketch in chat for tiny throwaway ideas; use the canvas when
the user wants a durable, shareable, or visual-first artifact.

## Step 1 — Ensure it is installed

Detect, in order, and only install if missing:

1. **Operator skill present?** Check for `~/skills/tldraw-offline/SKILL.md` (vendor
   copies may also live under `~/.claude`, `~/.codex`, `~/.cursor`, `~/.gemini`).
2. **App running?** Check for the desktop app's server file — on macOS
   `~/Library/Application Support/tldraw/server.json` (Windows/Linux paths differ;
   the operator skill defines them). Present + reachable ⇒ ready.

If either is missing, install before proceeding:

- **Install the app:** download **tldraw offline** from `https://offline.tldraw.com`
  (or the latest GitHub release at `github.com/tldraw/tldraw-offline/releases/latest`);
  macOS/Windows/Linux builds exist. On macOS a Homebrew cask may also work
  (`brew install --cask tldraw-offline`) — verify the cask exists before relying on it.
- **Install the agent skill:** launch the app and enable agent access / "install
  agent skills"; the app writes the shared operator skill to `~/skills/tldraw-offline/`
  (and vendor dirs). See the app's user manual for the exact setup and the security
  model.
- **Security:** granting an agent canvas access lets it read/edit documents, and
  file-embedded scripts can run on open. Only enable for trusted agents/files.
- **Do not fabricate steps.** If the download/cask cannot be confirmed, stop and ask
  the user to install tldraw offline, then continue once it is running.

Confirm readiness before drawing: the app must be open with a document, and
`~/skills/tldraw-offline/SKILL.md` must exist.

## Step 2 — Delegate to the operator skill

Read `~/skills/tldraw-offline/SKILL.md` and follow it verbatim for all canvas work
(server auth, discovering the focused doc, `/exec` edits, arrows-with-bindings,
lint, screenshots). Do not guess the API from memory — that skill is the source of
truth and may change with the app version.

## Harness usage guidance

- **Plain and readable.** For explainer diagrams, favor short plain-language labels
  over technical jargon; color-code by role; one screen when possible.
- **Real connections.** Use the operator skill's bound-arrow helper for every
  meaningful edge; never leave raw unbound arrows. Run its lint before reporting done.
- **New page, don't clobber.** Add a named page rather than overwriting an existing
  canvas unless the user asked to edit in place.
- **Verify once.** Confirm with a shapes read or a single screenshot; stop after one
  successful verification.

## Pairs with

- `/skill:engineering-workflow` — visualize architecture during `to-spec`, or attach
  a diagram to a `handoff`.
- `/skill:codebase-design` — diagram module seams and deep-module boundaries.
- `/skill:repo-hygiene` — a canvas is a report/plan artifact: give it a lifecycle
  (a `.tldraw` file the user keeps, or a throwaway page), don't leave orphan pages.

## Done criteria

One terse line: the doc/page touched, shape/arrow count or the single verification
result, and whether install was required. Expand only on install blockers or lint
failures.
