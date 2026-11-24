---
name: plan-feature
description: Write an implementation plan for one Trip Expense Tracker feature (F<N>) from its Approved spec in docs/specs/features/, split into small, ordered tasks (F<N>.T1, F<N>.T2, …) that each map to the spec's requirement and acceptance-criterion IDs. Use when the user runs /plan-feature F<N> or asks to plan, break down, or prepare a feature for building by its ID.
argument-hint: F<N> (e.g. F2)
model: haiku
---

# Plan a feature

Turn one **Approved** feature spec at `docs/specs/features/F<N>-<slug>.md` into a buildable plan at `docs/plans/F<N>-<slug>.md`.

Target feature: **$ARGUMENTS**

## 1. Resolve the feature and check it may be planned

- Expect an ID like `F2` (accept `f2` or `2`). No argument → list the specs in `docs/specs/features/` with their status, and ask which one.
- No spec file for that ID → say so and list the specs that exist. Suggest `/spec-feature F<N>`. Don't plan from product.md alone.
- The spec's `_Status:` is not `Approved` → **stop**. Say the spec must be approved first. Never approve it yourself.
- The spec has unchecked items under **Open questions** → stop and list them. They must be answered (by `/spec-feature F<N>`) before planning.
- `CLAUDE.md` does not exist or doesn't name the stack and the unit test command → **stop**. A plan names files, libraries and test commands, so the stack must be settled first. Tell the user to add `CLAUDE.md`.
- The slug is the spec's slug. The plan file uses the same name as the spec.
- If the plan file already exists, read it and **revise** it: keep its Decisions log and the task IDs of tasks already done (check `git log` for commits starting `F<N>.T<k>`). Never renumber or reuse the ID of a committed task. If you change the substance of an `Approved` plan, set it back to `Draft` and note that in the Decisions log.
- If the spec's `Last updated` date is newer than the plan's `Spec version`, the spec changed after planning: revise the plan against the new spec.

## 2. Gather context (read, don't skim)

- The whole spec, including its Decisions log.
- `docs/specs/product.md`: business rules R1–R8 and the worked examples (the reference test cases for F4–F6).
- `docs/rules/project-rules.md`: testing, security, logging, transactions and review rules. The plan must obey every one.
- `CLAUDE.md`: stack, layout, conventions and test commands.
- Plans and specs of features this one depends on, and those that depend on it (each spec's **Dependencies** section). Reuse what they build. Don't rebuild it.
- `docs/specs/api.md` and `docs/specs/data-model.md`, if they exist.
- The code in `app/`, if any, so tasks build on what is really there.

## 3. Settle what the spec left to the plan

Specs say "the plan decides" for implementation choices (for example a library, a storage form, where a check lives). List every one, then sort it:

- **Decided by the stack** (`CLAUDE.md`, or code that already exists): use it and say where it comes from.
- **A clear best choice** that follows the spec's constraints: pick it and give the reason in one line.
- **A real trade-off** the user should weigh (cost, a new dependency, something hard to change later): ask with **AskUserQuestion**, up to 4 questions per call, 2–4 options each with trade-offs, recommended option first.

Don't reopen product decisions. Behavior, limits and copy are settled in the spec. If the plan finds that the spec can't be built as written, or that two rules conflict, **stop** and say so. The spec must change first, through `/spec-feature F<N>`.

## 4. Split the work into tasks

Each task is one session's work for a developer on Haiku, ending in one commit whose subject starts with the task ID (`F2.T3: Add trip delete endpoint`). A hook reminds the user to `/clear` after each task commit.

- **Small:** a task touches a few files and can be finished, tested and committed in one sitting. Split anything bigger.
- **Ordered:** list tasks in the order to build them. Each names the tasks it depends on. Prefer back end first (data, then logic, then endpoints), then front end, so every task can be tested on its own.
- **Tested:** every task that changes code includes its unit tests (project-rules.md). Tests run without a real database, network or running app; name the fakes. Each test names the AC ID it checks, such as `F2.AC4`.
- **Traceable:** each task lists the requirement IDs (`F<N>.R<k>`) it builds and the AC IDs (`F<N>.AC<k>`) it proves.
- **Complete:** every requirement and every AC in the spec is covered by at least one task. ACs the spec marks "code review" are listed in the Review checklist instead of a test.
- **Flagged:** mark a task **Needs person review** when it touches authentication, secrets or environment files, database migrations, CI or deployment config, or deletes or disables tests (project-rules.md "Working with AI").
- **Documented:** a task that adds or changes an endpoint or a table also updates `docs/specs/api.md` or `docs/specs/data-model.md`.

Don't write the code in the plan. Name files, functions and shapes; leave the bodies to `/implement-feature`.

## 5. Write the plan

Create `docs/plans/F<N>-<slug>.md` by filling in [plan-template.md](plan-template.md), the template in this skill's folder. Task IDs are `F<N>.T1`, `F<N>.T2`, …. Leave out a section only if it truly doesn't apply, and say why in one line.

Before saving, check:

- Every `F<N>.R<k>` and `F<N>.AC<k>` in the spec appears in the Coverage table.
- No task depends on a later task.
- No task adds an integration or end-to-end test, a feature from "After the core", or anything the spec lists as Out.

## 6. Finish

- Reply with the plan path, the number of tasks, how many need person review, and any open questions.
- If planning showed the spec needs to change, say what and suggest `/spec-feature F<N>`. Don't edit the spec yourself.
- **Approval:** a plan is saved as `Draft`. Ask the user whether to approve it. Set `_Status: Approved` (and today's date) only when the user explicitly says yes, in this run or later. Never approve a plan on your own. `/implement-feature` only runs on Approved plans.
