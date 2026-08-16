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
4. How do we select and order validation so application-owned behavior is checked at the smallest binding layer?
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

A coding harness should point to `../../engineering-workflow/references/delegation-policy.md` as its single normative source for briefs, routing tiers, fresh/fork choice, explicit acceptance, attribution, concurrency, control, fidelity, and claim verification. Do not copy the policy into always-loaded instructions or substitute role-name/package inference.

The surrounding workflow still owns the producer/reviewer sequence: validation contract before implementation; stable writer handoff; fresh independent review; parent evidence verification and synthesis; one fix writer; focused re-review when substantial; escalation instead of guessed decisions.

## Harness Audit Questions

- Are engineering workflow commands documented in `AGENTS.md`?
- Are prompt/skill names reusable across projects?
- Do implementation prompts point to `../../engineering-workflow/references/testing-strategy.md` and define a validation contract: static checks first when available, smallest related behavioral guard, evidence-driven integration, full suites at repository-required/requested/release gates, sequential execution, intentional specialized tests, and diagnosed retries?
- Does code review separate the falsification and adversarial-authority axes while preserving evidence through parent synthesis?
- Are async, fresh/fork, parent authority, single-writer, and escalation semantics documented on demand?
- Do docs artifacts have default paths (`CONTEXT.md`, `docs/adr/`, `docs/specs/`, `.scratch/`)?
- Is subagent model routing cost-aware?
