# Pi Harness Architecture Patterns

Use these patterns to design reusable Pi harnesses. They mirror agent-team architecture thinking but are implemented with Pi skills, prompts, extensions, packages, and workflows.

## 1. Pipeline

Sequential dependent phases.

Use when:
- Each step depends on the previous output.
- The user needs a predictable process.
- Validation should happen at phase boundaries.

Pi implementation:
- One orchestrator skill defines phases.
- Prompt templates invoke specific phases.
- Intermediate artifacts go into `_workspace/` or documented project files.

Example:
`analyze → plan → implement → test → review → handoff`

## 2. Fan-out / Fan-in

Parallel independent perspectives merged into one result.

Use when:
- Code review needs architecture/security/performance/style views.
- Research needs multiple source categories.
- Risks are better found by specialized reviewers.

Pi implementation:
- Multiple focused prompt templates or skills.
- Orchestrator skill merges findings.
- Optional separate Pi sessions/tmux panes for true parallelism.

## 3. Expert Pool

A pool of specialized skills selected by task context.

Use when:
- Many domains exist but only some apply per request.
- You want progressive disclosure and low baseline context.

Pi implementation:
- Create multiple skills with precise descriptions.
- Keep `AGENTS.md` minimal.
- Use `/skill:<name>` when forcing a specific expert.

## 4. Producer-Reviewer

One workflow generates, another verifies.

Use when:
- Quality matters more than speed.
- The same agent may miss its own mistakes.

Pi implementation:
- `/build-*` prompt creates output.
- `/review-*` prompt or skill audits output.
- Extension can add safety checks or test runners.

## 5. Supervisor

A central orchestrator chooses the next action dynamically.

Use when:
- Tasks are ambiguous or multi-step.
- The user wants the agent to coordinate tools and skills.

Pi implementation:
- One orchestrator skill with decision criteria.
- Commands/prompt templates for common entrypoints.
- Optional extension tools for state, tracking, or external APIs.

## 6. Hierarchical Delegation

High-level workflow delegates to lower-level workflows.

Use when:
- A domain has subdomains and many references.
- You need reusable nested workflows.

Pi implementation:
- Top-level skill points to specialized sub-skills/references.
- Details live in `references/` and scripts.
- Avoid loading all details upfront.

## Pattern Selection Heuristic

- Linear repeatable work → Pipeline.
- Multiple independent reviews → Fan-out/Fan-in.
- Many possible specialties → Expert Pool.
- Need quality gate → Producer-Reviewer.
- Ambiguous multi-step work → Supervisor.
- Large domain with subdomains → Hierarchical Delegation.
