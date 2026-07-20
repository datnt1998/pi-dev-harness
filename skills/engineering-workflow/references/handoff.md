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
- Before writing the handoff, close finished artifacts: delete ephemeral plans and session reports, and reconcile or delete any spec that drifted this session (`/skill:repo-hygiene`). Do not hand off dead files that will read as authoritative later.

## Destination

Default output is a response in chat. If the user asks for a file, use:

```txt
.scratch/handoff-<slug>.md
```
