# Plan F<N> — <Feature name>

_Status: Draft · Last updated: <YYYY-MM-DD> · Spec: [F<N>-<slug>.md](../specs/features/F<N>-<slug>.md) · Spec version: <spec's Last updated date>_

## Summary
What this plan builds, in 2–3 sentences, and which tasks a person must review.

## Stack and conventions
The parts of `CLAUDE.md` this plan relies on: language, frameworks, folders, test runner and the unit test command.

## Choices the spec left to the plan
| Spec ref | Choice | Why / source |
|---|---|---|
| F<N>.R<k> | … | Stack (CLAUDE.md), best fit, or the user's answer (Decisions log) |

## Approach
How the pieces fit: modules, where validation and rules live so they can be unit tested with fakes, and what this feature reuses from earlier features.

## Data and API changes
Tables, columns, constraints and migrations; endpoints with request and response shapes. Point to the spec's Data & contract section instead of repeating it, and note only what the plan adds (names, files, indexes). Write "None" if there are none.

## Tasks
### F<N>.T1 — <short imperative title>
- **Builds:** F<N>.R<k>, …
- **Proves:** F<N>.AC<k>, …
- **Depends on:** none | F<N>.T<k>, F<M>.T<k>
- **Files:** paths to create or change
- **Steps:** 2–6 short steps
- **Tests:** test names with their AC IDs, and the fakes used
- **Done when:** the unit test command passes and <observable result>
- **Needs person review:** no | yes (<reason from project-rules.md>)
- **Commit:** `F<N>.T1: <title>`

## Coverage
Every requirement and acceptance criterion in the spec, and where it is handled.

| Spec ID | Task(s) | Proven by |
|---|---|---|
| F<N>.R1 | F<N>.T1 | — |
| F<N>.AC1 | F<N>.T1 | Unit test / Code review |

## Review checklist
What a person checks in code review because unit tests can't prove it (ownership in queries, constraints, cascades, transactions, no sensitive data in logs), with the task it belongs to.

- [ ] … (F<N>.T<k>)

## Risks
Anything likely to go wrong or cost more than planned, and how the plan limits it.

## Open questions
- [ ] … (anything unanswered; never filled in with a guess)

## Decisions log
- <YYYY-MM-DD>: <question> → <user's answer>
