# Handoff

Use this reference to create a continuation note for another session, agent, or human.

## Handoff Structure

```markdown
# Handoff — <task>

## Goal

## Current Status

## Files Changed

## Decisions Made

## Validation Run

## Known Risks

## Next Steps

## Useful Commands
```

## Rules

- Be compact but specific.
- Include paths and commands.
- Separate facts from recommendations.
- Mention anything intentionally not done.
- If context is large, link artifacts rather than pasting everything.
- Before writing the handoff, run the close-out in `scratch-organization.md`: inventory disposable/orphan/duplicate files, propose deletion, apply it only after explicit approval, consolidate retained evidence, and promote durable outcomes. Reconcile or supersede any governing artifact that changed this session (`/skill:repo-hygiene`). Do not hand off dead files that will read as authoritative later.

## Destination

Default output is a response in chat. If a named later consumer requires a file,
update the one canonical handoff inside the active registered effort:

```txt
.scratch/<effort>/handoff.md
```

Do not create dated, agent-named, or round-numbered handoff copies.
