# Engineering Workflow Integration for Pi Harness

Use this reference when designing or auditing a Pi harness for software engineering work.

## Responsibility Split

| Layer | Owns |
|---|---|
| `pi-harness` | Resource architecture: instructions, skills, prompts, extensions, themes, tools, package stack, naming, safety, UI visibility, validation. |
| `engineering-workflow` | Daily engineering flow: alignment, shared language, specs, tickets, implementation, TDD, review, diagnosis, handoff. |
| `pi-subagents` | Delegation layer: scout, planner, worker, reviewer, oracle, researcher. |
| `pi-web-access` | Research/source layer: web search, URL/GitHub/PDF/video content extraction. |

## When Building a Coding Harness

A coding harness is incomplete unless it answers:

1. How do we clarify ambiguous work?
2. How do we turn discussion into a spec?
3. How do we split work into small tickets?
4. How do we implement with feedback loops?
5. How do we review independently?
6. How do we hand off long-running context?

If these are not covered, add or recommend `/skill:engineering-workflow` plus its prompt wrappers.

## Required Checks

Audit for these resources:

- `/skill:engineering-workflow`
- `/grill-with-docs`
- `/to-spec`
- `/to-tickets`
- `/implement`
- `/code-review`
- `/diagnose`
- `/handoff`

If missing, create reusable prompt wrappers instead of project-specific commands.

## Subagent Model Routing

Recommended cheap/light roles:

- `scout`
- `context-builder`
- `delegate`
- `researcher` when doing simple lookups

Recommended stronger/inherited roles:

- `planner`
- `worker`
- `reviewer`
- `oracle`

For OpenAI Codex subscription, project overrides can use:

```json
{
  "subagents": {
    "agentOverrides": {
      "scout": { "model": "openai-codex/gpt-5.4-mini", "thinking": "minimal" }
    }
  }
}
```

## Subagent Orchestration Contract

A coding harness should make these defaults explicit in an on-demand workflow skill or reference rather than duplicating the full package manual in always-loaded instructions:

- parent owns delegation, synthesis, decisions, and final acceptance;
- async by default, followed by `wait()` when the result is required;
- one writer per active worktree; parallelize read-only work unless writers use isolated worktrees;
- forked `worker`/`oracle` when inherited context matters, fresh reviewers for independent checks;
- validation contract before implementation;
- worker handoff → fresh review → parent synthesis → one fix writer → focused re-review when substantial;
- children escalate unapproved decisions through supervisor/intercom rather than guessing;
- acceptance levels match the run: package inference for ordinary review-only tasks, evidence gates for writer workflows.

## Harness Audit Questions

- Are engineering workflow commands documented in `AGENTS.md`?
- Are prompt/skill names reusable across projects?
- Do implementation prompts define a validation contract and complete the review/fix loop before final summary?
- Does code review separate Standards and Spec axes while preserving evidence through parent synthesis?
- Are async, fresh/fork, parent authority, single-writer, and escalation semantics documented on demand?
- Do docs artifacts have default paths (`CONTEXT.md`, `docs/adr/`, `docs/specs/`, `.scratch/`)?
- Is subagent model routing cost-aware?
