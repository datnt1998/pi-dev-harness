# Engineering Research

Use this reference when external facts, docs, APIs, versions, or libraries matter.

## Tools

Prefer `pi-web-access` tools when installed:

- `web_search`
- `fetch_content`
- `get_search_content`

Use `researcher` subagent for focused source-backed research.

## Source Priority

1. Official docs
2. Source repository
3. Release notes / changelog
4. Standards/specifications
5. Maintainer comments/issues
6. Blogs and community posts

## Rigor

- Key claims need at least 3 independent sources; no single-source conclusions.
- Weight source credibility: official docs, maintainer material, and production case studies above tutorials and aggregators.
- Compare options across the dimensions that matter for the decision (performance, complexity, maintenance, cost — as applicable).
- State adoption risk: maturity, community, breaking-change history, abandonment risk.
- Evaluate architectural fit against the existing stack and constraints.
- End with a ranked recommendation and explicit limitations (what the research did not cover and why it matters).

## Report

Include:

- concise answer
- source URLs
- date/version relevance
- uncertainty
- recommended next action

Do not rely on a search snippet when page content is needed; fetch the source.
