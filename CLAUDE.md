# Trip Expense Tracker

Training app: users register, create trips, add people, record shared expenses, and see balances and the fewest payments to settle up. Requirements are in `docs/specs/product.md`. Rules for everyone (people and AI) are in `docs/rules/project-rules.md`, and they win over anything here.

## Stack
- **Back end:** Node.js (current LTS) + TypeScript + Express, in `app/api/`.
- **Front end:** React + Vite + TypeScript, in `app/web/`.
- **Database:** SQLite (one file, foreign keys on, so cascades work).
- **Unit tests:** Vitest in both apps. Front-end component tests use a simulated browser environment (jsdom) with React Testing Library.
- **Package manager:** npm.
- Libraries not listed here (SQLite driver, logger, password hashing, validation) are chosen in a feature plan, then added to this list.

## Layout
```text
app/api/   back end: src/ (routes, services, db), tests next to the code as *.test.ts
app/web/   front end: src/ (pages, components, api client), tests as *.test.tsx
docs/specs/product.md            product requirements (given)
docs/specs/features/F<N>-*.md    feature specs
docs/plans/F<N>-*.md             feature plans, split into tasks F<N>.T<k>
docs/specs/api.md                endpoints, kept up to date (from Week 2)
docs/specs/data-model.md         tables and fields, kept up to date (from Week 2)
```

## Commands
Run from the folder named. They work once the F1 plan's first task has set up the apps.

| What | Where | Command |
|---|---|---|
| Install | `app/api`, `app/web` | `npm install` |
| Unit tests | `app/api` | `npm test` |
| Unit tests | `app/web` | `npm test` |
| Type check | `app/api`, `app/web` | `npm run typecheck` |
| Run the API | `app/api` | `npm run dev` |
| Run the web app | `app/web` | `npm run dev` |

`npm test` runs Vitest once (`vitest run`), never in watch mode.

## Conventions
- TypeScript `strict` mode. No `any` unless a comment says why.
- Money is whole cents in an `integer` type everywhere, never a float. Format to `0.00` only for display.
- Times are stored in UTC.
- SQL uses parameters only, never string joining. Every query on trip data filters by the owner (F1.R11).
- Writes that change more than one row run in one transaction.
- Use the project logger. No `console.*` left in code. Never log passwords, hashes, session IDs or personal data.
- Keep rules, calculations and validation in plain functions, so unit tests can call them with fakes instead of a real database, network or server.
- Don't swallow errors: handle them or pass them to the Express error handler.

## Tests
- Every code change comes with unit tests. No integration or end-to-end tests.
- Each test names the acceptance criterion it checks by its full ID, for example `it('F2.AC4 allows duplicate trip names', …)`.
- Tests don't use the real clock (inject one), a real database, the network, or each other's state.
- Never delete, skip or loosen a test to make a run pass. Stop and ask.

## Workflow
- Specs: `/spec-feature F<N>`. Plans: `/plan-feature F<N>`. Both need the user's explicit approval before the next step.
- One plan task per session. Commit it with a subject starting with the task ID (`F2.T3: Add trip delete endpoint`), then `/clear`.
- Branches: `week-1`, `week-2`, then one per feature named like its plan (`F3-people`).
- Use Haiku only, and stay within the $15 budget.
- A person must review and approve changes to authentication, secrets or env files, database migrations, CI or deployment config, and any test removal.
- Never commit secrets. `.claude/settings.local.json` holds the OpenRouter key and is git-ignored.
