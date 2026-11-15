# Plan F5 — Balances

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Spec: [F5-balances.md](../specs/features/F5-balances.md) · Spec version: 2026-11-15_

## Summary
This plan builds balances on a trip: a pure calculation that gives each person's paid amount minus their shares, in whole cents, with a check that the total is exactly zero; a read-only service and `GET /api/trips/:id/balances` endpoint using the F1 ownership check; and the Balances section on the trip page, which replaces the balance placeholder left by F4. Nothing new is stored, so there is no migration. It has 6 tasks. Two are marked **Needs person review**: T3 (API ownership check on the new endpoint) and T6 (changes an assertion in an F4 test, which the F5 spec requires).

F5 builds on F1, F2, F3 and F4. Nothing under `app/` exists yet, so F5 can start only after the F1–F4 tasks are committed (see Risks).

## Stack and conventions
From `CLAUDE.md` and the F1–F4 plans:
- **Back end:** Node.js (LTS) + TypeScript (`strict`) + Express 5, in `app/api/`. Tests in `app/api/src/**/*.test.ts`. Unit test command: `npm test` (`vitest run`). Type check: `npm run typecheck`.
- **Front end:** React + Vite + TypeScript, in `app/web/`. Tests in `app/web/src/**/*.test.tsx` with jsdom and React Testing Library. Same two commands.
- **Database:** SQLite via `better-sqlite3`. F5 adds no tables and no migration.
- **Logs:** the project logger (`pino`). No `console.*`.
- **Libraries:** none new.

## Choices the spec left to the plan
| Spec ref | Choice | Why / source |
|---|---|---|
| F5.R1 | Balance = sum of the payer's `amountCents` over expenses they paid, minus the sum of their `shareCents` across expenses. Rows come from the people list, so a person with no expenses still gets a row at 0. | Spec R1 and product.md R4 (without payments). Matches F4's data, where the payer may have no share (F4.R6). |
| F5.R1 | The calculation is one pure function, `calculateBalances(people, expenses)`, with no payments input yet. F6 adds a payments input to it. | Spec "Used by F6". Keeps F5 unit-testable with plain data (CLAUDE.md "Conventions"). |
| F5.R3 | Integer arithmetic only, using the cents that F4 stores. | Spec R3; CLAUDE.md "Money". |
| F5.R4 | `checkTotalIsZero(balances)` in the same module. If the sum is not zero, the service throws `BalanceTotalError` (a plain `Error` subclass). It reaches F1's Express error handler, so the response is `500` with no balance data. The logger records the trip ID and the total in cents, never names. | Spec R4 and "no swallowed errors" (CLAUDE.md). A wrong balance is never shown. |
| F5.R5 | Rows are ordered with F3's `sortPeopleInOrder` (created time, then ID). | Spec R5; same order as F3, F4. |
| F5.R6 | Route uses F1's `apiGuard` and `ownsTrip`, as F4.T4 does. | Spec R6; reuses the shared check. |
| F5.R7 | No table, no cache. Each request calculates from the expenses. | Spec R7. |
| F5.R8 | The trip page keeps a counter. `ExpensesSection` calls `onChanged` after a successful add or delete, and the page passes the counter to `BalancesSection` as a `refreshKey`, so the section refetches. | Spec R8. The counter avoids a shared store. Needs a small F4 change, which T6 makes. |
| F5.R10 | Empty states use the spec copy. "No expenses" is decided from the expenses list, not from the balances. | Spec R10. |
| F5.R11 | `balanceView` returns `{ person: { id, name }, balanceCents }` and the total as `totalCents`. | Spec R11, same rule as F3.R11 and F4.R14. |
| Spec copy | Copy from the spec's "States & errors", as approved. | Spec (the user delegated wording, Decisions log). |
| Money format | Two-decimal display via the `formatCents` helper that F4 uses for expense amounts. T5 checks whether F4 created it (see Risks). | Spec "States & errors"; avoids a second money formatter. |

## Approach
**Back end (`app/api/src/`):**
- `balances/calculate.ts`: `calculateBalances(orderedPeople, expenses)` (pure) → one `{ personId, balanceCents }` per person, in the order given. `checkTotalIsZero(balances)` (pure) → `true` or `false`.
- `balances/service.ts`: `getBalances({ ownerId, tripId }, deps)` with `deps = { tripStore, peopleStore, expenseStore }`. Ownership first; then the people (sorted), then the trip's expenses; then `calculateBalances`; then the total check (throws `BalanceTotalError` when false). Returns plain results, not HTTP.
- `balances/views.ts`: `balanceView` (pure), F5.R11 shape.
- `http/routes/balances.ts`: one handler and `balancesRouter(deps)`. `apiGuard` runs first.
- `http/app.ts`: mount the balances router next to the expenses router. `index.ts` passes the real stores.

**Front end (`app/web/src/`):**
- `api/balances.ts`: `getBalances(tripId)` on F1's `api/client.ts`. Maps `404` to `not-found`.
- `balances/formatBalance.ts`: `formatBalance(balanceCents)` (pure) → `{ kind: 'owed' | 'owes' | 'settled', amount }`, using the absolute value for the amount.
- `components/BalancesSection.tsx`: heading "Balances", the rows in the order returned, the total line, the empty note, the no-people state, loading and load-failed states, and `refreshKey` to refetch.
- `pages/TripPage.tsx`: renders `BalancesSection` in place of the balance placeholder, and passes the refresh counter.
- `components/ExpensesSection.tsx`: gains an `onChanged` prop, called after a successful add or delete.
- `copy.ts`: the F5 strings.

Reused from F1–F4: `db/open.ts`, `logger.ts`, `auth/guards.ts` (`apiGuard`, `ownsTrip`), error handler from F1, `trips/store.ts`, `people/store.ts` and `people/views.ts` (`sortPeopleInOrder`), `expenses/store.ts` (`listExpensesByTrip`, which returns payer and shares), `api/client.ts`, `api/people.ts` (`listPeople`, for the no-people check), `components/RequireSession.tsx`, `copy.ts`, and the money formatter F4 uses.

## Data and API changes
**Tables:** None. Balances are calculated from the `expenses` and `expense_participants` tables that F4 creates (spec "Data & contract"). No migration, no `data-model.md` change.

**Endpoint (new, documented in `docs/specs/api.md` by T3):** the spec's table, unchanged.
- `GET /api/trips/:id/balances` → `200 { balances: [{ person: { id, name }, balanceCents }], totalCents }`, rows in the order people were added, `totalCents` always `0`.
- `401` when logged out; `404` when the trip is missing or belongs to another user; `500` when the total check fails (not a documented success case; logged, no balance data).
- No PUT, PATCH or POST route (F5 has no writes).

**Page changes (web):** the trip page's balance placeholder is replaced by the Balances section (T6). The F4 placeholder sentence "Balances will appear here." is removed.

## Tasks
### F5.T1 — Balance calculation and total check
- **Builds:** F5.R1, F5.R3, F5.R4 (check), F5.R5 (input order)
- **Proves:** F5.AC1, F5.AC2, F5.AC3, F5.AC4 (sum rule), F5.AC5
- **Depends on:** none
- **Files:** `app/api/src/balances/calculate.ts`, `app/api/src/balances/calculate.test.ts`
- **Steps:**
  1. `calculateBalances(orderedPeople, expenses)`: start every person at 0. For each expense, add `amountCents` to its payer's balance. For each share, subtract `shareCents` from that person's balance. A share for an unknown person is ignored (the expense service already rejects it, F4.T3); the function does not guess.
  2. Return one `{ personId, balanceCents }` per person, in the input order.
  3. `checkTotalIsZero(balances)`: the integer sum of `balanceCents` is exactly 0.
- **Tests:** `F5.AC1`: the Example 1 expenses (90.00 paid by Sam, 30.00 paid by Alex, each shared by all three) give +5000, −1000, −4000 in the order Sam, Alex, Jo, and the sum is 0. `F5.AC2`: a person whose paid equals their shares gets 0. `F5.AC3`: a payer with no share keeps the full amount paid. `F5.AC4`: a table of expense sets (1 to 5 people, random-looking but fixed amounts and splits built with F4's `splitEqually`) always sums to 0; `checkTotalIsZero` returns `false` for a list that sums to 1. `F5.AC5`: 1000 cents paid by Sam and shared by Sam, Alex and Jo, with shares 334, 333, 333, give +666, −333, −333. Fakes: none (pure data). `splitEqually` is imported from F4.T1, so no fake is needed.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`.
- **Needs person review:** no
- **Commit:** `F5.T1: Add balance calculation and total check`

### F5.T2 — Balance service and views
- **Builds:** F5.R5 (service order), F5.R6 (service part), F5.R7, F5.R4 (throw), F5.R11 (views)
- **Proves:** F5.AC4 (error when the total is not zero), F5.AC6, F5.AC7, F5.AC8 (service), F5.AC10 (service part), F5.AC11
- **Depends on:** F5.T1, F4.T3 (expense store interface and `listExpensesByTrip`), F3.T3 (people store and `sortPeopleInOrder`), F2.T3 (trip store), F1.T9 (`ownsTrip`)
- **Files:** `app/api/src/balances/service.ts`, `app/api/src/balances/service.test.ts`, `app/api/src/balances/views.ts`, `app/api/src/balances/views.test.ts`
- **Steps:**
  1. `BalanceTotalError` in `balances/service.ts`.
  2. `getBalances({ ownerId, tripId }, deps)`: find the trip, and `ownsTrip` → `'not-found'` when missing or not owned. Load the people with `listPeopleByTrip` and sort with `sortPeopleInOrder`. Load the trip's expenses with `listExpensesByTrip`. Call `calculateBalances`. If `checkTotalIsZero` is false, throw `BalanceTotalError` after a log line with the trip ID and total only. Return `{ ok: true, balances, totalCents: 0 }`.
  3. `views.ts`: `balanceView(row, person)` returns the F5.R11 shape with integers only.
- **Tests:** `F5.AC6`: fake people store returns three people in shuffled order with fixed creation times; the result rows are in the added order. `F5.AC7`: a fake expense store adds one expense; the second call returns the changed balances and the total is still 0. `F5.AC4`: a fake expense store whose data produces a non-zero sum makes `getBalances` throw `BalanceTotalError`, and the result is not returned. `F5.AC8`: a trip with people and no expenses returns 0 for every person. `F5.AC10`: user B asking for user A's trip returns `'not-found'`, and the fake stores are not read beyond the trip lookup. `F5.AC11`: `balanceView` output has no `owner_id`, and `balanceCents` and `totalCents` are integers. Fakes: in-memory trip store, people store and expense store (each returns fixed data); a log spy to check that the log line has no names; no real clock is used.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`.
- **Needs person review:** no
- **Commit:** `F5.T2: Add balance service and views`

### F5.T3 — Balance API route and mount
- **Builds:** F5.R6 (API, 401 and 404), F5.R11 (API bodies)
- **Proves:** F5.AC10 (HTTP 401 and 404), F5.AC11 (no `owner_id` in the body)
- **Depends on:** F5.T2, F1.T9, F1.T10 (app and error handler), F4.T4 (router pattern)
- **Files:** `app/api/src/http/routes/balances.ts`, `app/api/src/http/routes/balances.test.ts`, `app/api/src/http/app.ts`, `app/api/src/index.ts`, `docs/specs/api.md`
- **Steps:**
  1. `getBalancesHandler`: runs `apiGuard` first (`401` with no data when logged out), then the service. A `'not-found'` result gives `404` with the same body for a missing or another user's trip. `BalanceTotalError` is passed to `next(err)` (the F1 error handler gives `500`).
  2. Success returns `200` with `{ balances, totalCents }` built with `balanceView`.
  3. Mount `balancesRouter(deps)` in `app.ts` next to the expenses router. `index.ts` passes the real stores.
  4. Add the endpoint and its responses to `docs/specs/api.md`.
- **Tests:** `F5.AC10`: no cookie gives `401` and no balance data; another user's trip gives `404` with the same body as a missing trip. `F5.AC11`: the success body has no `owner_id`. A fake service that throws `BalanceTotalError` gives `500` with no balance data. Code review: no write route is registered. Fakes: fake balances service, fake session store, fake response.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; `api.md` lists the endpoint.
- **Needs person review:** yes (API ownership check on the new endpoint, reviewed like F4.T4).
- **Commit:** `F5.T3: Add balances API route`

### F5.T4 — Balances API client (web)
- **Builds:** F5.R6 (client part)
- **Proves:** supports F5.AC10 (client maps the responses)
- **Depends on:** F1.T11 (`api/client.ts`), F5.T3 (contract)
- **Files:** `app/web/src/api/balances.ts`, `app/web/src/api/balances.test.ts`
- **Steps:**
  1. `getBalances(tripId)` on F1's client.
  2. `404` is returned as `not-found`; `401` is passed up; other errors are passed up as errors.
- **Tests:** `F5.AC10`: a `404` gives `not-found`; a `401` gives status 401 to the caller. Fakes: mocked `fetch`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`.
- **Needs person review:** no
- **Commit:** `F5.T4: Add balances API client`

### F5.T5 — Balances section: rows, total and empty states
- **Builds:** F5.R2 (display), F5.R4 (total line), F5.R5 (screen order), F5.R10 (empty states)
- **Proves:** F5.AC1 (UI), F5.AC2 (UI), F5.AC8 (UI), F5.AC9
- **Depends on:** F5.T4, F3.T5 (people client, for the no-people check), F4.T6 (money formatter, see Risks)
- **Files:** `app/web/src/balances/formatBalance.ts`, `app/web/src/balances/formatBalance.test.ts`, `app/web/src/components/BalancesSection.tsx`, `app/web/src/components/BalancesSection.test.tsx`, `app/web/src/copy.ts`, and `app/web/src/money/formatCents.ts` only if F4 did not create it
- **Steps:**
  1. `formatBalance(balanceCents)`: positive → `owed` with the amount; negative → `owes` with the absolute amount; zero → `settled` with `0.00`. Amounts use two decimals.
  2. `BalancesSection`: heading "Balances"; a `<ul>` of rows, each showing the name, then "is owed {amount}", "owes {amount}", or "Settled up" with 0.00; then a "Total" line with 0.00. Loading, load-failed ("Couldn't load balances." with "Try again") and the no-people state ("Add people to this trip before you can see balances." with a "Go to People" link, and no rows or total).
  3. The empty-expenses note: when the response has rows and no expenses (T5 reads the expense count from the response the service returns, so the API also returns `expenseCount`; see Risks), show "No expenses yet. Add an expense to see who owes what."
  4. Add the strings to `copy.ts`.
- **Tests:** `formatBalance.test.ts`: `F5.AC1`: 5000 gives owed 50.00; −1000 gives owes 10.00. `F5.AC2`: 0 gives settled 0.00. `BalancesSection.test.tsx`: `F5.AC1`: the Example 1 response shows "is owed 50.00", "owes 10.00", "owes 40.00" and "Total" with 0.00, in the order given. `F5.AC2`: a zero row reads "Settled up". `F5.AC8`: rows with no expenses show the note. `F5.AC9`: no people shows the message and the link with no rows and no total. Load failure shows the message and "Try again". Fakes: mocked `api/balances.ts` and `api/people.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; the section shows the balances in `npm run dev`.
- **Needs person review:** no
- **Commit:** `F5.T5: Add Balances section`

### F5.T6 — Trip page: Balances section replaces the placeholder, refreshes on expense change
- **Builds:** F5.R8, F5.R9
- **Proves:** F5.AC7 (UI refresh), F5.AC12
- **Depends on:** F5.T5, F4.T8 (trip page with the Expenses section)
- **Files:** `app/web/src/pages/TripPage.tsx`, `app/web/src/pages/TripPage.test.tsx`, `app/web/src/components/ExpensesSection.tsx`, `app/web/src/components/ExpensesSection.test.tsx`
- **Steps:**
  1. `ExpensesSection` gets an optional `onChanged` prop, called after a successful add or delete. No other change to its behavior.
  2. `TripPage` keeps a counter in state. `onChanged` increments it. `BalancesSection` gets it as `refreshKey` and refetches when it changes.
  3. Remove the balance part of the placeholder. The text "Balances will appear here." (set by F4.T8) is removed; no placeholder sentence remains on the trip page. Keep the People, Expenses, "Delete trip" and "Back to trips" parts and the F2 not-found state unchanged.
- **Tests:** `F5.AC12`: a found trip shows the Balances section and the text "Balances will appear here." does not appear. The F4.T8 assertion on that text is replaced, not removed (see Review checklist). `F5.AC7`: after an expense is added on the page, the balances request is made again and the new values show. `ExpensesSection.test.tsx`: `onChanged` is called once after a successful add and after a successful delete, and not on failure. Fakes: mocked `api/trips.ts`, `api/people.ts`, `api/expenses.ts` and `api/balances.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; adding an expense in `npm run dev` updates the balances.
- **Needs person review:** yes (changes an existing F4 test assertion, the placeholder text, because the F5 spec removes that copy; also changes an F4 component prop).
- **Commit:** `F5.T6: Show Balances section on the trip page`

## Coverage
| Spec ID | Task(s) | Proven by |
|---|---|---|
| F5.R1 | T1, T2 | Unit (T1, T2) |
| F5.R2 | T5 | Unit (formatBalance); component (T5) |
| F5.R3 | T1, T2 | Unit (T1, T2) |
| F5.R4 | T1, T2, T5 | Unit (T1, T2); component (T5) |
| F5.R5 | T2, T5 | Unit (T2); component (T5) |
| F5.R6 | T2, T3, T4 | Unit (T2, T3); client (T4); code review (owner filter, T2) |
| F5.R7 | T2 | Unit (T2); code review (no table, no write route, T3) |
| F5.R8 | T6 | Component (T6) |
| F5.R9 | T6 | Component (T6) |
| F5.R10 | T5 | Component (T5) |
| F5.R11 | T2, T3 | Unit (T2, T3) |
| F5.AC1 | T1, T5 | Unit (T1); component (T5) |
| F5.AC2 | T1, T5 | Unit (T1); component (T5) |
| F5.AC3 | T1 | Unit (T1) |
| F5.AC4 | T1, T2 | Unit (T1, T2) |
| F5.AC5 | T1 | Unit (T1) |
| F5.AC6 | T2 | Unit (T2) |
| F5.AC7 | T2, T6 | Unit (T2); component (T6) |
| F5.AC8 | T2, T5 | Unit (T2); component (T5) |
| F5.AC9 | T5 | Component (T5) |
| F5.AC10 | T2, T3, T4 | Unit (T2, T3); client (T4); code review (owner filter, T2) |
| F5.AC11 | T2, T3 | Unit (T2, T3) |
| F5.AC12 | T6 | Component (T6) |

## Review checklist
A person checks these in code review, because unit tests can't prove them:
- [ ] `getBalances` reads only the trip's expenses and people (filtered by `trip_id`), and the owner check runs before any read (F5.T2, F5.T3).
- [ ] `apiGuard` runs before the service in the balances handler (F5.T3).
- [ ] No route writes balances, and no table or column is added for them (F5.T3, F5.R7).
- [ ] The `BalanceTotalError` log line has the trip ID and total only, with no names or other personal data (F5.T2).
- [ ] The F4 page test's assertion on "Balances will appear here." is replaced, not removed, and the new text matches the F5 spec. A person approves this change to an existing test (F5.T6).
- [ ] `ExpensesSection`'s new `onChanged` prop does not change its existing behavior, and its F4 tests still pass (F5.T6).

## Risks
- **F1 to F4 must be built first.** F5 uses F1's guards and error handler, F2's trip store, F3's people store and `sortPeopleInOrder`, and F4's expense store and `splitEqually`. None of this is committed yet, so F5 starts only after the F1–F4 tasks are committed (on `week-1` or the feature branches).
- **Money formatter location.** F4.T6 does not list a two-decimal formatter in its files. T5 must first look for one from F4; if none exists, it adds `app/web/src/money/formatCents.ts` and its test. Check before writing a second formatter.
- **Empty-expenses note needs a count.** T5 shows the note only when there are no expenses. The service returns the balances only, so T2 and T3 also return `expenseCount` (a number) in the response, and the web client passes it through. T2's test covers the count. This adds one field to the spec's response shape; the spec does not forbid it, and it adds no data about other users.
- **The total check should never fire.** It guards against a bug in F4's split or in this calculation. If it fires, the page shows the load-failed message, which is the intended behavior, and the logged error points to the cause.
- **F6 extends this calculation.** F6 adds payments as a second input to `calculateBalances`. Keep the function pure, and keep F5's tests so F6 can add its own cases without changing these.
- **Budget ($15, Haiku only):** six tasks, each one session. Stop and ask if a task runs long.
- **Owner checks cannot be fully unit tested.** The query filter and the trip join are checked in code review only, as the spec's test plan says.

## Open questions
None. The spec has no open questions. The copy and the failed total check's message were settled by the user's delegation (see the spec's Decisions log).

## Decisions log
- 2026-11-15: Plan created as Draft from the Approved F5 spec (spec version 2026-11-15).
- 2026-11-15: Plan approved by the user, as written (6 tasks; T3 and T6 need person review). The `expenseCount` field in the balances response (T2, T3) was included in this approval.
