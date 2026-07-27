# Delegation Policy

This is the normative delegation reference for reusable engineering workflows. Callers point here instead of restating these rules. **Must**, **never**, and **fail closed** are requirements.

Lifecycle: living specification. The engineering-workflow maintainers reconcile it whenever delegation behavior changes and delete it if the workflow no longer delegates.

## 1. Authority and model-tier vocabulary

The parent owns scope, the brief, routing, launch, synthesis, claim verification, final acceptance, and rollback. A child may collect evidence or execute a settled decision; it does not widen scope or make unresolved product, architecture, API, data, security, destructive, release, or acceptance decisions.

This policy uses capability/cost archetypes rather than model names:

- **scarce-premium** — the strongest, quota-scarce reasoning and independent-judgment tier;
- **metered-mid** — a capable general reasoning tier with metered use;
- **flat-fee** — a quota-limited tier with no useful per-call price signal.

A configured model is mapped to one archetype outside this document. Routing by role name alone is forbidden.

## 2. Parent launch preflight

Before every non-trivial delegation, the parent must:

1. identify the work unit and add the attribution marker;
2. classify whether the task contains important reasoning under T4;
3. select fresh or forked context through the three context gates;
4. select acceptance explicitly from the delegation shape;
5. establish the writer lease, dependency edges, and concurrency allowance;
6. choose reader budgets or mutation milestones and control notices;
7. write the brief and its parent-known falsifiable bar;
8. check quota state before scarce-premium work and declare its category;
9. define the evidence and claim-verification record required at fan-in.

Missing attribution, acceptance policy, important-reasoning classification, or required quota state fails closed.

## 3. Delegation brief contract

The parent writes the brief. If the parent can write the complete diff faster than the brief—typically under about 20 lines in one known file—the parent should make the change directly.

### Required content

Every brief includes:

1. **Coordinates** — repository paths, precise locations where known, and bounded inspection commands with the reason each matters.
2. **Claims to verify** — hypotheses are labelled “verify, then act,” never presented as settled facts.
3. **Negative scope** — files, behavior, formatting, commits, and decisions the child must not touch or make.
4. **A falsifiable bar** — an expected count, exit status, exact output, or bounded observation known by the parent before launch.
5. **Deliverable shape** — three to five report fields, including failures and residual risks.

Read-heavy work also receives an extraction budget, such as a maximum number of quoted lines per file. Use `output: false` unless a second consumer genuinely needs a durable output file.

Do not inline readable file bodies, rediscoverable repository conventions, narrative session history, or acceptance-schema prose. Name paths and requirements instead.

### Authored size bands

These are starting bands, excluding runtime-injected contracts:

| delegation shape | target authored tokens |
|---|---:|
| implementation worker | 400–900 |
| reviewer | 300–700 |
| scout / researcher | 250–500 plus an extraction budget |
| context-builder | 200–400 |
| exact probe / verification | under 100; suppress acceptance |

Below-band briefs tend to invite invented scope; above-band briefs often contain source bodies or the answer itself. Size never excuses omission of a load-bearing field.

## 4. Attribution marker

Every caller-authored task starts with exactly one line:

```markdown
<!-- pi-harness-attribution:v1 {"source":"tickets/work.md","ticket":"T3","purpose":"production"} -->
```

Rules:

- `source` is a normalized repository-relative ticket collection or map path; absolute paths and `..` escapes are invalid.
- `ticket` is the exact work-unit id. The canonical key is **source + ticket**.
- `purpose` is exactly `production` or `arbitration`.
- Production includes implementation, planned validation, ordinary required review, and fix work. Arbitration is only a separate dispute-settling call.
- A reviewer role does not imply arbitration. Split mixed-purpose work into separate runs.
- Missing, duplicate, malformed, or unknown-purpose markers are `UNATTRIBUTED`; never infer from role, timestamp, or session.

Any relevant unattributed run makes a routing evidence window incomplete. Session/timestamp reconstruction is diagnostic only.

## 5. Fresh versus forked context

Fresh context is the default. Fork only when all three gates pass and the needed context is narrative rather than nameable.

1. **Independence gate.** Work intended to disagree with or independently check the parent—review, validation, adversarial reconnaissance, or claim-checking—is always fresh.
2. **Signed-thinking gate.** If the parent transcript contains signed hidden reasoning and any child candidate, including fallbacks or an unresolved id, may force forked thinking off, use fresh context unless intentional no-thinking history inspection was predeclared.
3. **Transcript-tax gate.** Fork input grows with the parent transcript. Prefer a filtered written brief in a mature session; fork only when rejected approaches, user preferences, or discussion history would be longer or less faithful to restate.

Per-work-shape defaults:

| work | default | fork exception |
|---|---|---|
| implementation worker | fresh + written brief | a same-session fix pass where continuity is load-bearing |
| reviewer / validator | fresh | never |
| scout / context-builder / researcher | fresh | never |
| planner | fresh + spec | a plan that must continue unresolved narrative design history and passes all gates |
| oracle/advisory reasoning | fresh + written state | history/drift audit only, with any thinking reduction explicit and informational |

Never place a thinking-sensitive fallback on a fork-default route. Unresolvable candidates fail closed. An intentional thinking-off history audit cannot serve as acceptance, arbitration, emergency authorization, or routing-window evidence.

## 6. Explicit acceptance by delegation shape

Use `agentContract: { version: 1 }`. Select acceptance at every task/step from the work shape; never rely on package inference or `auto`. Criteria and evidence may only mirror obligations already in the brief.

| delegation shape | explicit policy | required shape |
|---|---|---|
| exact probe / liveness check | reason-bearing `none` | parent validates exact response/process behavior |
| trivial lookup or advisory question | reason-bearing `none` | no completion claim; action-changing facts still enter the claim gate |
| consequential scout / inventory / research | minimal `attested` | criterion matches named questions; request notes and residual risks, not reviewer severity |
| implementation worker | `checked`, or `verified` only with safe deterministic runtime commands | approved scope; changed files, tests, commands, residual risks, and no staged files |
| Reviewer verdict | minimal `checked` | supplied review scope, findings, verdict, and residual risks |

Independent review is a separate run; never ask a worker or reviewer run to label itself `reviewed`. Enable a v1 completion guard only when the workflow deliberately relies on runtime mutation effects; disk-state checks remain mandatory either way.

A reason-bearing suppressed contract records `not-required` and is neutral under C3. Unexpected absence remains hostile. A report parse rejection is `UNATTESTED`, not content-false or execution-failed: retain the prose, verify the load-bearing claim, and request a report-only repair only when the ledger itself is required. Chain execution normally advances on execution; use an acceptance gate only when rejection of an explicit machine/verified contract must stop the chain.

## 7. Result-fidelity contract C1–C7

Evidence ranks, strongest first:

1. current disk/repository state;
2. parent-run validation;
3. acceptance ledger;
4. child structured report;
5. process exit code.

Exit code labels a result; it never accepts or discards work by itself.

Run C1–C3 on every delegation, C4–C6 on mutation/completion claims, and C7 before acting on a child report:

- **C1 — Record exists.** A terminal record contains usage and duration. Otherwise classify `NOT-RUN`.
- **C2 — Something happened.** Turns and output are both greater than zero. Otherwise classify `NOT-RUN`.
- **C3 — Ledger is policy-consistent.** Requested acceptance is present and not rejected; predeclared reason-bearing `not-required` is neutral. Otherwise classify `REJECTED` or `UNATTESTED` as appropriate.
- **C4 — Claimed mutations are on disk.** Every changed path exists and is visible in repository state. Otherwise classify `FALSE-CLAIM`.
- **C5 — Parent revalidates.** The parent reruns at least one claimed validation command or the predeclared equivalent. Otherwise classify `UNVERIFIED`.
- **C6 — Exit code comes last.** Label validated work with a non-zero exit as an infrastructure fault; never redo accepted work merely to clean the process signal.
- **C7 — Verify one load-bearing claim.** The parent directly checks the highest-consequence fact it is about to use. Acceptance structure is not truth evidence.

Contradictions resolve as follows:

- Work present on disk plus passing parent validation is success with an infrastructure fault, even with non-zero exit. Do not rerun it.
- Zero exit with missing/zero usage, absent required acceptance, or no claimed artifact is `NOT-RUN`; a retry is allowed.
- Disk state wins in both directions.
- Each parallel child passes C1–C7 independently; a sibling pass cannot mask a failed child.

## 8. Claim-verification gate

Only action-changing factual claims enter this gate. Recommendations remain judgment, but their load-bearing factual premises do not.

| code | class | examples | parent check |
|---|---|---|---|
| R | repository/file/config state | existence, supported key, current/default value, call behavior | inspect current disk or named primary source |
| M | measurement/run result | test count, artifact count, duration, cost | rerun bounded command or read raw artifact |
| E | external contract | API behavior, compatibility, pricing | open versioned official source and relevant section |
| J | judgment/inference | a value is sensible; one design is safer | decide trade-off after verifying each R/M/E premise |

`N` modifies negative or exhaustive claims such as zero, none, unsupported, or all. An N-claim is malformed without the searched scope and a disconfirming command/source search. Every N-claim is verified before use.

A child report with action-changing facts ends with this table; otherwise it states `Claims: none`:

```markdown
| id | exact claim (scope/version/time) | class | consequence if false | primary locator | parent replay/check + expected observation | cost |
|---|---|---|---|---|---|---|
| C1 | ... | R/N | ... | path:line | `command` → expected observation | V1 |
```

The child supplies candidate evidence and a replay recipe, never its own verification verdict. The parent records:

```markdown
Claim verification: C1 — VERIFIED|FALSIFIED|UNVERIFIABLE|NOT-CHECKED
Observed: <parent-observed primary evidence>
Action: adopt | drop | escalate | carry-unverified-without-use
```

Verification costs:

| cost | meaning | executor |
|---|---|---|
| V0 | already parent-observed in current diff/output | parent records it |
| V1 | one deterministic local check, normally under 30 seconds | parent runs it |
| V2 | bounded primary-source retrieval or multi-file search | parent; a fresh cheap scout may locate candidates |
| V3 | conflicting sources, ambiguous semantics, or consequential judgment | fresh scarce-premium arbitration, then owner if unresolved |

Always verify V0/V1 load-bearing claims, every N-claim, every numeric success/performance bar, risky R/E claims, and contradictions. For other used advisory facts, check at least one highest-consequence claim per report and one per independent consequential action. A second agent may locate evidence but cannot close the loop; the parent must observe the primary evidence.

`NOT-CHECKED` and `UNVERIFIABLE` claims cannot justify edits, completion, or success statements. Drop optional unverifiable claims; if the action depends on one, stop or escalate. `FALSIFIED` is a C7 false-claim event for routing rollback.

Reviewer findings follow the same rule: state the exact actionable claim, source location, consequence, and cheapest replay/check. Missing evidence is a gap, not an automatic pass or finding.

## 9. Concurrency and writer safety

A **sealed reader** has no mutation tools, no project-local output path, and only non-mutating commands. A role name, no-edit sentence, or read-only acceptance role does not seal a child.

Default to **two concurrent sealed readers total across active flat-fee runs**. Raise only when provider tier/headroom is known, work is independent, outputs are bounded, and the parent can synthesize promptly; normal sessions cap at four. Drop to one after rate limiting, queueing, long-context work, or synthesis backlog.

| overlap | policy | required proof |
|---|---|---|
| sealed reader × sealed reader | parallel by default | immutable checkpoint or disjoint declared reads; unique/no outputs |
| review-shaped child × any task | not safe by role alone | remove mutation tools and constrain shell/output, or isolate/serialize |
| writer × independent sealed reader in same tree | conditional | disjoint read/write and external-resource sets; no diff/tests/generated outputs |
| writer × reviewer/validator of its result | serial | stable writer handoff first; this is a producer→consumer edge |
| writer × writer in one tree | never overlap | one logical write lease from launch through terminal handoff |
| independent writers | opt-in only | clean base, isolated worktrees, disjoint seams/resources, serial patch integration, combined validation |
| overlapping interfaces, migrations, schemas, generated files, or dependent work | serial even with worktrees | upstream slice accepted before downstream launch |
| producer × consumer of a live artifact | serial/chain edge | consumer starts only from a stable named artifact |
| async writer × any active-tree writer | serial | async frees chat, never the write lease |
| shared scratch/map state | one logical writer | children return runtime artifacts; parent owns fan-in writes |

Disjointness includes ports, databases, credentials, deployment targets, caches, lock files, and dependencies. If the set cannot be named, serialize. Worktree isolation prevents checkout clobber, not semantic conflicts or shared-service effects; integration always remains serial.

Parallelize already-required independent observation and review axes; do not add a review call merely to manufacture parallelism. At fan-in, apply C1–C7 to every result before synthesis.

## 10. Async control, budgets, and interruption

Every non-trivial delegation is async with progress enabled so status, transcript, turns, tools, tokens, current path/tool, and supervisor requests remain inspectable. Async does not authorize concurrent writes. Wait only when the current request must finish in the current turn and independent parent work is exhausted; never poll or sleep.

### Launch budgets

Hard turn/tool budgets apply only to sealed readers:

| class | turn budget | tool budget | first inspection notice |
|---|---|---|---|
| exact probe | max 4, grace 1 | soft 4, hard 6, block `*` | 2 turns, 10k tokens, or 60s |
| sealed scout/research/context | max 18, grace 2 | soft 24, hard 30, block `*` | 6 turns, 100k tokens, or 240s |
| sealed reviewer/validator | max 20, grace 2 | soft 28, hard 35, block `*` | 6 turns, 40k tokens on scarce-premium; 100k otherwise; or 240s |
| mutation-capable child | no hard turn/tool cap | no hard turn/tool cap | 10 turns, 100k tokens, or 240s; idle 60s; 3 mutation failures |

A mutation-capable worker/reviewer uses a narrow milestone, one writer lease, a task-specific outer deadline with margin, and a safe-boundary checkpoint after current tool work returns. A process timeout is not a mutation-safe checkpoint.

### Signal to action

- **Let finish** when progress is useful or one known long tool is active. Age or a notice alone never convicts a run.
- On the first long/turn/token/idle notice, inspect status and transcript once; do not poll.
- **Reply** to a pending supervisor decision instead of steering around it.
- **Steer** when the success contract is unchanged and completed work remains useful. Name the observed evidence, corrected assumption/coordinate, work to stop, and next bounded action. Delivery acknowledgement proves transport, not compliance; verify the next boundary.
- **Interrupt** when the premise is false, exploration/mutation repeats on the wrong path, three mutations fail, unsafe side effects threaten, or another turn predictably worsens work. Inspect disk before resume/replacement.
- If steer is failed/partial or the next boundary ignores a delivered steer, interrupt.
- In parallel work, prefer indexed steer because root interrupt may pause valuable siblings.
- **Stop** only to abandon an unwanted workflow; stopped work is non-resumable.

Record each steer state. Record each interrupt's turn/tool/token checkpoint, disk effects, and whether work resumed, restarted, or stopped. Interrupt saves only future work; completed provider usage and side effects are sunk.

## 11. Scarce-premium budget and degradation

At weekly reset, allocate the usable scarce-premium window:

| category | allocation | protected purpose |
|---|---:|---|
| main-session reasoning | 60% | parent diagnosis, orchestration, test-oracle ownership, acceptance, synthesis |
| production review | 20% | first workflow-required independent semantic verdict |
| arbitration | 15% | consequential dispute unresolved by primary/machine evidence and normal review |
| emergency | 5% | active security incident, production outage, or imminent irreversible loss |

When scarce, protect in reverse priority: **emergency → arbitration → main → production review**. Review borrows nothing; main may borrow unused review; arbitration may borrow unused main/review; emergency may borrow any balance. Overrides name the reserve being spent and are recorded.

Every scarce-premium work unit declares one quota category before launch. Accounting `purpose` remains orthogonal: ordinary review is production; only dispute settlement is arbitration. Use high thinking at most. Normal scarce-premium children are fresh. A silent fallback is degraded work, never a scarce-premium verdict.

A fresh machine-readable quota snapshot must gate launches. It records weekly/short-window remaining and resets, fetched-at/age, category balances, provisional debit, band, and gate reason. Refresh at session start, before and after each scarce-premium unit, after model changes/rate limits, and periodically while active. Stale, missing, auth-error, exhausted weekly, or critically low short-window data fails closed for new non-emergency work. Until automation exists, perform and record the equivalent manual preflight.

### T4: important reasoning never goes to flat-fee

Important reasoning includes making or revising any unresolved:

1. product intent, scope, negative scope, acceptance, adoption, rollback, or promotion decision;
2. architecture, public API, schema/data model, dependency, compatibility, security/privacy, migration, release/production, destructive, or difficult-to-reverse choice;
3. root-cause selection, fix selection, or interpretation of conflicting, negative, or exhaustive evidence;
4. test-oracle design, evidence-sufficiency judgment, no-test-bar verdict, C7 disposition, final acceptance, arbitration, or emergency response.

Unknown or mixed classification fails closed as important. Important work may use metered-mid when policy permits, but never flat-fee. Flat-fee is eligible only when all decisions are frozen, work is bounded/reversible, and an exact parent-known command or observation determines success. It may execute an already-authorized conditional branch; it may not interpret evidence or choose the branch design.

### Explicit degradation ladder

Never depend on automatic provider fallback:

1. use scarce-premium while the declared category has fresh authorized balance;
2. use the validated **metered-mid primary reasoning** route for ordinary main/review evidence work;
3. use a separately validated **metered-mid planning-only** route for decomposition or evidence organization; its semantic verdict is provisional;
4. defer to reset or the owner when ambiguity affects product/scope, security, irreversible action, required premium pilot evidence, arbitration, or emergency authorization.

Finish an already-running response safely, but disclose exhaustion/degradation before starting a new model request. Machine checks precede every model review. No degraded result is relabelled as scarce-premium evidence.

## 12. Routing success bar and rollback T1–T5

Evaluate routing changes lexicographically, never with a weighted score:

```text
GATE      quality floor holds
WIN       production scarce-premium calls per ticket strictly decrease
TIEBREAK  wall-clock per ticket decreases
WINDOW    10 worker delegations: at least 6 test-bar and at least 2 no-test-bar
ARBITER   machine → fresh scarce-premium reviewer → owner
ROLLBACK  per-role revert to a dated routing snapshot on T1–T5
```

Report separate, never-summed columns for production scarce-premium calls, arbitration scarce-premium calls, metered spend, and flat-fee output tokens. Zero price on flat-fee renders `unpriced`; absent usage renders `unknown`.

Quality has two independent floors:

- honest rework requires a fix pass on no more than one third of delegations and must not raise production scarce-premium calls per ticket;
- the second C4/C7 false claim in the evidence window triggers rollback; the first tightens the brief and moves that role's action-changing claims to full verification for the rest of the window.

The window uses real work, not standing paired replay. Record the pre-change baseline and a dated route snapshot before adoption. Compare matched quota/routing bands; missing attribution, usage, quota category, fallback state, or thinking state makes the window incomplete.

Rollback only the implicated role:

| trigger | action |
|---|---|
| **T1** — second C4/C7 false claim within the window | revert that role |
| **T2** — honest rework exceeds one third for that role | revert that role |
| **T3** — production scarce-premium calls per ticket rise versus baseline | revert that role |
| **T4** — flat-fee carries important reasoning | revert immediately |
| **T5** — silent thinking downgrade on a scarce-premium role | fix configuration immediately; exclude from model-quality window |

Arbitration stops at the cheapest decisive rung. Machine evidence settles C1–C6 and falsifiable bars; a fresh scarce-premium reviewer handles unresolved no-test-bar or suspected C7 disputes; the owner breaks ties and records reusable precedent. Arbitration accounting never enters the production numerator.

## 13. Fan-in completion record

The parent completion/batch record includes:

```markdown
Attribution: <source>#<ticket>; purpose <production|arbitration>
Routing: <tier>; quota category/band or not-applicable; degradation/fallback state
Fidelity: C1–C7 verdicts; infrastructure faults
Claims checked: <claim ids, classes, verdicts, parent-observed evidence>
Acceptance: execution / acceptance / review / effects considered separately
Validation: <parent-run command or observation>
Control: <steers/interrupts and terminal state, if any>
Unverified: none | <unused gap or blocker>
Residual risk: none | <risk>
```

Completion is unavailable while an action-driving claim is `UNVERIFIABLE` or `NOT-CHECKED`, required acceptance is hostile, parent validation is missing, or routing evidence is incomplete. Claims that remain unverified may be reported only as unused context under `Unverified`.
