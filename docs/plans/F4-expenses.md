# Plan F4 — Expenses

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Spec: [F4-expenses.md](../specs/features/F4-expenses.md) · Spec version: 2026-11-15_

## Summary
This plan builds expenses on a trip: the `expenses` and `expense_participants` tables with cascades from `trips` and `expenses`, a pure amount parser and equal-split function (to the cent, leftover cents to the first participants in trip order), add, list and delete with the F1 ownership check, the payer and participant check against the trip's people, and the usage check that stops a person in an expense being removed. It also builds the Expenses section on the trip page, which replaces the expense part of the F3 placeholder. It has 8 tasks. Four are marked **Needs person review**: T2 (database migration), T4 (API ownership checks), T8 (changes an F3 test assertion, which the F4 spec requires) and T2 also adds to the in-use check.

F4 builds on F1, F2 and F3. Nothing under `app/` exists yet, so F4 can start only after F1, F2 and F3 tasks are committed (see Risks).

## Stack and conventions
From `CLAUDE.md`, the F1–F3 plans:
- **Back end:** Node.js (LTS) + TypeScript (`strict`) + Express 5, in `app/api/`. Tests in `app/api/src/**/*.test.ts`. Unit test command: `npm test` (`vitest run`). Type check: `npm run typecheck`.
- **Front end:** React + Vite + TypeScript, in `app/web/`. Tests in `app/web/src/**/*.test.tsx` with jsdom and React Testing Library. Same two commands.
- **Database:** SQLite via `better-sqlite3`, `PRAGMA foreign_keys = ON` (F1.T4). Migrations are numbered SQL files run by F1.T4's `migrate.ts`. F2 uses `002-trips.sql`, F3 uses `003-people.sql`; F4 adds `004-expenses.sql`.
- **Logs:** the project logger (`pino`). No `console.*`.
- **Libraries:** none new. F4 uses only what F1–F3 added.

## Choices the spec left to the plan
| Spec ref | Choice | Why / source |
|---|---|---|
| F4.R2 | Description is trimmed and counted with `countCharacters` (F1.T2), 1–100 code points, same as trip and person names. | Spec R2 and Decisions log; reuses F1's counter. |
| F4.R3 | Amount parser `parseAmountToCents(raw)` accepts `^\d+(\.\d{1,2})?$` after trimming. A leading `-` with a value of zero or less gives "Amount must be more than zero."; any other non-matching text, including commas and a trailing dot, gives the format message. Parsing is string-based, never `parseFloat`. | Spec R3 and Decisions log: no floats (CLAUDE.md). |
| F4.R3 | Largest amount is `Number.MAX_SAFE_INTEGER` cents. Above that, reject with "Amount is too large." | JavaScript reads integers above this exactly only up to that value; the user chose this message. Spec says "largest value that can be stored and summed exactly". |
| F4.R5 | Duplicate IDs in `participantIds` are removed before validation (treated as one person). | Spec silent; a duplicate would otherwise double-count a share. Plan choice. |
| F4.R7 | `splitEqually(cents, count)` is pure: each share is `floor(cents / count)`; the first `cents mod count` shares get one extra cent. Participants are ordered by the people's stored order (F3.R4, `sortPeopleInOrder`) before splitting. | Spec R3 and product.md R3; same order as F5 uses for leftover cents. |
| F4.R6 | The payer is not required to be a participant; a payer who is not a participant gets no share row. | Spec R6, product.md R2. |
| F4.R8 | The service rejects an add with no payer or no participant (400, field `payerId` or `participantIds`). The web form shows the "Add people" message instead of the form when the list is empty. | Spec R8; the server is the authority. |
| F4.R9 | Order is `created_at DESC, id DESC` (newest first). | Spec R9, same as F2.R5 with the order reversed. |
| F4.R10 | Delete runs in `store.transaction`: delete the expense; `expense_participants` rows go by cascade. | Spec R10 and project rule (one transaction for writes that change more than one row). |
| F4.R12 | F4 appends one function to the F3 `usageChecks` array in `db/repositories/people.ts`: a person is in use if they are a payer or a row in `expense_participants` for them. Parameters only. | Exactly the extension point F3.R7 defines. |
| F4.R13 | Payer and participant IDs are checked with F3's `findPersonOnTrip` inside the add transaction; a person not on the trip gives `400`. | Keeps the check in one place; the spec's `400` for body references. |
| F4.R13 | Every expense route calls `ownsTrip` (F1) on the trip from F2's trip store, the same as F3. | Reuses the shared check. |
| F4.R14 | `expenseView` returns `{ id, description, amountCents, payer: {id, name}, participants: [{id, name, shareCents}], createdAt }` only. | Spec R14, same rule as F3.R11. |
| Spec copy | Amount too large: "Amount is too large." (user's answer, Decisions log). | Spec gives no copy for this case. |
| F4.R15 | The placeholder text becomes "Balances will appear here." once the Expenses section is shown. | Spec R15: the balance part stays until F5. |

## Approach
**Back end (`app/api/src/`):**
- `expenses/money.ts`: `parseAmountToCents(raw)` (pure) → `{ ok: true, cents }` or `{ ok: false, message }`. `splitEqually(cents, count)` (pure) → integer array summing to `cents`.
- `expenses/validation.ts`: `validateExpenseDescription(raw)` (pure), reusing `countCharacters` (F1.T2). Returns `{ ok: true, description }` or `{ ok: false, field: 'description', message }`.
- `expenses/store.ts`: the store interface the service uses (`insertExpense`, `insertShares`, `listExpensesByTrip`, `findExpenseOnTrip`, `deleteExpense`, `transaction`), type only.
- `expenses/service.ts`: `addExpense`, `listExpenses`, `deleteExpense`. Each takes `{ store, tripStore, peopleStore, clock }` and the owner ID. Returns plain results, not HTTP.
- `expenses/views.ts`: `expenseView(expense, payer, shares)` pure.
- `http/routes/expenses.ts`: three handlers and `expensesRouter(deps)`. Each handler runs F1's `apiGuard` first, then the service.
- `http/app.ts`: mount the expenses router next to the people router (F3.T4).

**Front end (`app/web/src/`):**
- `api/expenses.ts`: `listExpenses(tripId)`, `addExpense(tripId, input)`, `deleteExpense(tripId, expenseId)` on F1's `api/client.ts`. Maps `404` to `not-found`, `400` to the field error.
- `expenses/expenseInput.ts`: `checkDescription`, `checkAmount`, `checkSharers` for instant feedback. Pure. The server stays authoritative.
- `components/ExpensesSection.tsx`: heading "Expenses", the list, the add form with fields in spec order, empty state, no-people state with a "Go to People" link, load-failed state.
- `components/DeleteExpenseDialog.tsx`: confirmation, errors, focus rules (copied from F3's dialog, not shared, as F3 does).
- `pages/TripPage.tsx` (from F2.T8, changed in F3.T8): renders `ExpensesSection` in place of the expense part of the placeholder.
- `copy.ts`: the F4 strings from the spec's States & errors section, and "Amount is too large.".

Reused from F1–F3: `db/open.ts`, `db/migrate.ts`, `logger.ts`, `auth/guards.ts` (`apiGuard`, `ownsTrip`), `auth/validation.ts` (`countCharacters`), `db/repositories/trips.ts`, `trips/store.ts`, `people/store.ts`, `people/views.ts` (`sortPeopleInOrder`), `db/repositories/people.ts` (`findPersonOnTrip`, `listPeopleByTrip`, `usageChecks`), `api/client.ts`, `api/people.ts` (`listPeople`, for the payer and sharer lists), `components/RequireSession.tsx`, `copy.ts`.

## Data and API changes
**Tables (new, migration `004-expenses.sql`)** — the spec's Data & contract section defines both tables. This plan adds:
- `expenses`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE`, `description TEXT NOT NULL`, `amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)`, `payer_id INTEGER NOT NULL REFERENCES people(id)`, `created_at TEXT NOT NULL` (UTC ISO 8601). Index `expenses_trip_id_idx` on `expenses(trip_id)`. No cascade from `people` (the in-use check refuses removal first, F4.R12).
- `expense_participants`: `expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE`, `person_id INTEGER NOT NULL REFERENCES people(id)`, `share_cents INTEGER NOT NULL CHECK (share_cents >= 0)`, primary key `(expense_id, person_id)`. Index `expense_participants_person_id_idx` on `person_id` (used by the in-use check).
- The rule that the shares of one expense sum to `amount_cents` is enforced by the service (F4.R7) and checked in code review, not by a database trigger.
- `docs/specs/data-model.md` gets both tables (T2).

**Endpoints (new, documented in `docs/specs/api.md` by T4):** the spec's table, unchanged.
- `GET /api/trips/:id/expenses` → `200 { expenses: [...] }`, newest first.
- `POST /api/trips/:id/expenses` → `201 { expense }`; `400` with `{ field, message }` for a bad description, amount, payer or participants, or a person not on the trip.
- `DELETE /api/trips/:id/expenses/:expenseId` → `204`; `404` when the trip or expense is missing or belongs to another user.
- All three return `401` when logged out (apiGuard).
- No PUT or PATCH route exists (F4.R16).

**In-use check:** `usageChecks` in `db/repositories/people.ts` gains the expense check (T2). The F3 remove endpoint then returns `409` for an expense participant or payer, with no change to its code.

**Page changes (web):** `/trips/:id` shows the Expenses section (T8); the placeholder reads "Balances will appear here.".

## Tasks
### F4.T1 — Amount, description and split rules
- **Builds:** F4.R2, F4.R3, F4.R7 (split)
- **Proves:** F4.AC2, F4.AC3, F4.AC4, F4.AC5, F4.AC6
- **Depends on:** F1.T2 (for `countCharacters`)
- **Files:** `app/api/src/expenses/money.ts`, `app/api/src/expenses/money.test.ts`, `app/api/src/expenses/validation.ts`, `app/api/src/expenses/validation.test.ts`
- **Steps:**
  1. `validateExpenseDescription(raw)`: trim; reject 0 with "Enter a description."; reject over 100 code points with "Description must be 100 characters or fewer.".
  2. `parseAmountToCents(raw)`: trim; match the format regex; convert with string logic (whole part × 100 + padded fraction), never `parseFloat`; zero or less → "Amount must be more than zero."; commas, extra decimals or other text → "Enter an amount like 12 or 12.50, without commas."; above `Number.MAX_SAFE_INTEGER` cents → "Amount is too large.".
  3. `splitEqually(cents, count)`: base = `Math.floor(cents / count)`; the first `cents % count` entries get `base + 1`; the rest get `base`.
- **Tests:** `F4.AC2`: `"  Dinner  "` gives `Dinner`; `"   "` is rejected with "Enter a description.". `F4.AC3`: 100 characters accepted, 101 rejected; 100 emoji accepted and 101 rejected. `F4.AC4`: `12`, `12.5`, `12.50`, `0.01` give 1200, 1250, 1250, 1; `0`, `-5` give the zero message; `12.345`, `1,250.00` give the format message; a 16-digit amount gives "Amount is too large.". `F4.AC5`: `splitEqually(1000, 3)` gives `[334, 333, 333]`. `F4.AC6`: a table of amounts and counts 1–10: the sum equals the amount and the largest share minus the smallest is at most 1. `F4.AC5` also covers `splitEqually(2, 3)` giving `[1, 1, 0]`. Fakes: none (pure).
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`.
- **Needs person review:** no
- **Commit:** `F4.T1: Add expense amount, description and split rules`

### F4.T2 — Expense schema, repository and usage check
- **Builds:** F4.R9 (stored data for order), F4.R11 (cascade), F4.R12 (usage check), F4.R10 (delete data)
- **Proves:** F4.AC12 (usage check), F4.AC10 (order in SQL), F4.AC13 (parameters); supports F4.AC16 (code review)
- **Depends on:** F3.T2 (people repository and `usageChecks`), F2.T2 (`trips` table)
- **Files:** `app/api/src/db/migrations/004-expenses.sql`, `app/api/src/db/repositories/expenses.ts`, `app/api/src/db/repositories/expenses.test.ts`, `app/api/src/db/repositories/people.ts` (one entry added to `usageChecks`), `app/api/src/db/repositories/people.test.ts` (one test added), `docs/specs/data-model.md`
- **Steps:**
  1. `004-expenses.sql`: create `expenses` and `expense_participants` with the columns, constraints and indexes listed in Data and API changes.
  2. `repositories/expenses.ts` with the `Db` interface, `?` placeholders only:
     - `insertExpense(db, { tripId, description, amountCents, payerId, createdAt })` returns the new ID.
     - `insertShare(db, { expenseId, personId, shareCents })`.
     - `listExpensesByTrip(db, tripId)` with `WHERE trip_id = ? ORDER BY created_at DESC, id DESC`, plus a join to load payer and shares (in one query or two, parameters only).
     - `findExpenseOnTrip(db, expenseId, tripId)` with `WHERE id = ? AND trip_id = ?`.
     - `deleteExpenseById(db, expenseId)`.
  3. `people.ts`: append `expenseUsesPerson(db, personId)` to `usageChecks`: `SELECT 1 FROM expenses WHERE payer_id = ? UNION SELECT 1 FROM expense_participants WHERE person_id = ? LIMIT 1` with the person ID as two parameters.
  4. Update `docs/specs/data-model.md` with both tables and the rule that expenses cascade from trips.
- **Tests:** With a fake `Db` that records SQL and parameters: each function uses `?` placeholders and passes values as parameters (no string joining); `listExpensesByTrip` sends the trip ID as a parameter and has `ORDER BY created_at DESC, id DESC` (`F4.AC10`); `findExpenseOnTrip` sends the expense ID and trip ID (`F4.AC13`); `expenseUsesPerson` returns `true` when the fake `Db` returns a row for the payer query, and `true` when it returns a row for the participant query (`F4.AC12`), and `false` when neither returns a row. Existing F3 tests still pass with the extra entry. Fakes: fake `Db`. No SQLite file in unit tests.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; `data-model.md` matches the migration.
- **Needs person review:** yes (database migration; the cascades, the `CHECK` constraints and the usage check are checked in review).
- **Commit:** `F4.T2: Add expenses schema, repository and usage check`

### F4.T3 — Expense service and views
- **Builds:** F4.R1, F4.R4, F4.R5, F4.R6, F4.R7 (service), F4.R8, F4.R9 (service sort), F4.R10 (service), F4.R13 (service part), F4.R14
- **Proves:** F4.AC1, F4.AC8, F4.AC10 (service), F4.AC11 (service), F4.AC13 (service), F4.AC14, F4.AC17 (integers and no owner)
- **Depends on:** F4.T1, F4.T2, F3.T3 (people store and `sortPeopleInOrder`), F2.T3 (trip store), F1.T9 (`ownsTrip`)
- **Files:** `app/api/src/expenses/store.ts`, `app/api/src/expenses/service.ts`, `app/api/src/expenses/service.test.ts`, `app/api/src/expenses/views.ts`, `app/api/src/expenses/views.test.ts`
- **Steps:**
  1. `store.ts`: the interface the service uses, matching T2.
  2. `addExpense({ ownerId, tripId, description, amount, payerId, participantIds }, deps)`:
     - Trip lookup and `ownsTrip` → `'not-found'` when missing or not owned.
     - Validate description (T1) and parse amount (T1); return the field message on failure.
     - Deduplicate `participantIds`; if the payer is missing or there are no participants → `400` on that field.
     - Inside `store.transaction`: load the trip's people (`listPeopleByTrip`, sorted with `sortPeopleInOrder`); every payer and participant ID must be among them, else `400` on `payerId` or `participantIds` (F4.AC14).
     - Compute shares: `splitEqually(amountCents, participants.length)` assigned to participants in trip order (F4.R7).
     - Insert the expense with `createdAt = clock.now()` in UTC ISO, then one share row per participant.
     - Return `{ ok: true, expense }` built with `expenseView`.
  3. `listExpenses({ ownerId, tripId }, deps)`: ownership check, then the list from the store, newest first.
  4. `deleteExpense({ ownerId, tripId, expenseId }, deps)`: ownership check; find the expense on the trip (`'not-found'` if missing); run `store.transaction` that deletes it.
  5. `views.ts`: `expenseView(expense, payer, shares)` returns the F4.R14 shape only, with `amountCents` and `shareCents` as integers.
- **Tests:** `F4.AC1`: fake stores and a fixed clock; "Dinner" 9000 cents by Sam shared by Sam, Alex and Jo gives three 3000-cent shares; saved with trip, trimmed description, payer and UTC time; result has the expense. `F4.AC8`: payer Sam not in the participant list is saved and has no share row. `F4.AC10`: three expenses at different times (and two with the same time ordered by ID) come back newest first. `F4.AC11`: delete removes the expense and its shares in one `transaction` call; the fake store records one transaction. `F4.AC13`: user B listing, adding or deleting on A's trip returns `'not-found'`, and the fake store is unchanged. `F4.AC14`: a payer or participant not on the trip returns `400` with the field name, and the fake store has no insert. `F4.AC17`: `expenseView` has no `owner_id` and no trip data, and amounts are integers. Fakes: in-memory expense store with a `transaction` that records calls; in-memory people and trip stores; fixed clock; fixed IDs.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; no test calls the real clock.
- **Needs person review:** no
- **Commit:** `F4.T3: Add expense service and views`

### F4.T4 — Expense API routes and mount
- **Builds:** F4.R1 (API), F4.R8 (400), F4.R10 (API), F4.R13 (404, 401), F4.R14, F4.R16 (no edit route)
- **Proves:** F4.AC13 (HTTP 404), F4.AC14 (HTTP 400), F4.AC15 (401), F4.AC17 (bodies); F4.R16 by code review
- **Depends on:** F4.T3, F1.T9, F1.T10 (app and guard), F3.T4 (router pattern)
- **Files:** `app/api/src/http/routes/expenses.ts`, `app/api/src/http/routes/expenses.test.ts`, `app/api/src/http/app.ts`, `app/api/src/index.ts`, `docs/specs/api.md`
- **Steps:**
  1. Handlers `listExpensesHandler`, `addExpenseHandler`, `deleteExpenseHandler`. Each runs `apiGuard` first and returns `401` with no data when logged out.
  2. Parse the body: `description` string, `amount` string, `payerId` integer, `participantIds` array of integers. A wrong type → `400` with `{ field, message }`.
  3. `POST` returns `201` with `{ expense }`; the service's `400` is passed through with its field. `DELETE` returns `204`, and `404` for a missing or another user's trip or expense (same body for both).
  4. Mount `expensesRouter(deps)` in `app.ts` next to the people router. `index.ts` passes the real stores and clock.
  5. Update `docs/specs/api.md` with the three endpoints and their responses.
- **Tests:** `F4.AC15`: each of the three endpoints with no cookie returns `401` and no expense data. `F4.AC14`: a bad field or an unknown person returns `400` with the field name and no expense is created (fake service). `F4.AC13`: another user's trip or a missing expense returns `404` with the same body. `F4.AC17`: no response body contains `owner_id`. Code review: no PUT or PATCH route is registered (F4.R16). Fakes: fake expenses service, fake session store, fixed clock, fake response.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; `api.md` lists the three endpoints.
- **Needs person review:** yes (API ownership checks on the new endpoints).
- **Commit:** `F4.T4: Add expense API routes`

### F4.T5 — Expense API client (web)
- **Builds:** F4.R1 (client), F4.R10 (client)
- **Proves:** supports F4.AC9, F4.AC11, F4.AC13 (client maps the responses)
- **Depends on:** F1.T11 (`api/client.ts`), F4.T4 (contract)
- **Files:** `app/web/src/api/expenses.ts`, `app/web/src/api/expenses.test.ts`
- **Steps:**
  1. `listExpenses(tripId)`, `addExpense(tripId, input)`, `deleteExpense(tripId, expenseId)` on F1's client.
  2. `addExpense` maps `400` to `{ field, message }`. `deleteExpense` maps `404` to `not-found`.
- **Tests:** `F4.AC13`: `404` from `deleteExpense` is returned as `not-found`. `F4.AC14`: `400` from `addExpense` gives the field and message. `F4.AC15`: `401` is passed up with status 401. Fakes: mocked `fetch`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`.
- **Needs person review:** no
- **Commit:** `F4.T5: Add expense API client`

### F4.T6 — Expenses section: list and add form
- **Builds:** F4.R1 (UI), F4.R2–R5 (field messages and sharer defaults), F4.R8 (no-people state), F4.R9 (list order on screen)
- **Proves:** F4.AC1 (UI), F4.AC2, F4.AC3, F4.AC4 (UI messages), F4.AC7, F4.AC9, F4.AC10 (screen)
- **Depends on:** F4.T5, F3.T5 (people client for payer and sharer lists), F3.T6 (people section, for the "Go to People" anchor)
- **Files:** `app/web/src/expenses/expenseInput.ts`, `app/web/src/expenses/expenseInput.test.ts`, `app/web/src/components/ExpensesSection.tsx`, `app/web/src/components/ExpensesSection.test.tsx`, `app/web/src/copy.ts`
- **Steps:**
  1. `expenseInput.ts`: `checkDescription`, `checkAmount` (wraps T1's functions for the form), `checkSharers` (at least one checked). Pure.
  2. `ExpensesSection`: heading "Expenses"; a list (`<ul>`/`<li>`) of rows showing description, amount with two decimals, "Paid by {name}", "Shared by {n} people" (or "Shared by 1 person"), and a "Delete" button labelled "Delete {description}"; the empty state; "Loading expenses…"; "Couldn't load expenses." with "Try again".
  3. "Add expense" opens the form with fields in spec order: Description, Amount, Paid by (a native `<select>` of people in the returned order), Shared by (`<fieldset>` with `<legend>`, one checkbox per person, all checked on open). Buttons "Add expense" and "Cancel". Enter in Description or Amount submits. Errors under each field, linked with `aria-describedby`; focus moves to the first invalid field. "Add expense" is disabled while saving.
  4. With no people on the trip, show "Add people to this trip before recording an expense." with a "Go to People" link to the People section, and no form.
  5. On success: the form closes, the expense appears at the top of the list, and a `role="status"` notice shows "“{description}” added.". On a form-level network error, show "Something went wrong. Please try again." and keep the typed values.
  6. Add the F4 strings to `copy.ts`, including "Amount is too large.".
- **Tests:** `expenseInput.test.ts`: `F4.AC2` spaces only rejected; `F4.AC3` 101 rejected; `F4.AC4` format, zero and too-large messages; `F4.AC7` unchecking all gives the "Choose at least one person to share this." message. `ExpensesSection.test.tsx`: `F4.AC1` a valid submit calls `addExpense` with the expected inputs and shows the new expense at the top; `F4.AC2`/`F4.AC3`/`F4.AC4` the messages show under the right field and no call is made; `F4.AC7` every person is checked when the form opens; `F4.AC9` no people → the message and link, no form; `F4.AC10` three expenses render newest first with payer and sharer count; a double-click sends one request; a network error keeps the typed values. Fakes: mocked `api/expenses.ts` and `api/people.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; adding an expense in `npm run dev` shows it at the top of the list.
- **Needs person review:** no
- **Commit:** `F4.T6: Add Expenses section with add form`

### F4.T7 — Delete expense dialog and notices
- **Builds:** F4.R10 (UI)
- **Proves:** F4.AC11 (UI)
- **Depends on:** F4.T5, F4.T6
- **Files:** `app/web/src/components/DeleteExpenseDialog.tsx`, `app/web/src/components/DeleteExpenseDialog.test.tsx`, `app/web/src/components/ExpensesSection.tsx`, `app/web/src/components/ExpensesSection.test.tsx`
- **Steps:**
  1. "Delete" on a row opens `DeleteExpenseDialog`: `role="dialog"`, `aria-modal="true"`, labelled by its title "Delete “{description}”?". Text "This removes the expense and changes everyone’s balance. This can’t be undone." Buttons "Cancel" (focused on open) and "Delete expense". Escape acts as Cancel; on close without deleting, focus returns to that row's "Delete" button.
  2. "Delete expense" calls `deleteExpense`. Both buttons are disabled while the request runs. On success the dialog closes, the row leaves the list, and the `role="status"` notice shows "“{description}” deleted.".
  3. On `not-found`, the dialog closes, the list refreshes, and the notice shows "“{description}” is no longer on this trip.". On another error, show "Couldn't delete the expense. Please try again." in the dialog and keep the expense listed.
- **Tests:** `DeleteExpenseDialog.test.tsx`: `F4.AC11` the dialog names the expense; Cancel and Escape close it with no `deleteExpense` call; "Delete expense" calls it once with both buttons disabled during the call; an error keeps the dialog open with the message. `F4.AC13` not-found shows the "no longer on this trip" notice and refreshes. `ExpensesSection.test.tsx`: `F4.AC11` after success the notice "“Dinner” deleted." shows and the row is gone. Fakes: mocked `api/expenses.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; delete and cancel behave as the spec's flow in `npm run dev`.
- **Needs person review:** no
- **Commit:** `F4.T7: Add delete expense dialog and notices`

### F4.T8 — Trip page: Expenses section replaces the expense placeholder
- **Builds:** F4.R15
- **Proves:** F4.AC18
- **Depends on:** F4.T6, F4.T7, F3.T8 (trip page with People section)
- **Files:** `app/web/src/pages/TripPage.tsx`, `app/web/src/pages/TripPage.test.tsx`
- **Steps:**
  1. Render `ExpensesSection` with the trip ID, in place of the expense part of the placeholder.
  2. Change the placeholder text from "Expenses and balances will appear here." to "Balances will appear here.". This is the wording F4.R15 requires.
  3. Keep the People section, "Delete trip" button, "Back to trips" link and the F2 not-found state unchanged.
- **Tests:** `F4.AC18`: a found trip shows the Expenses section and the text "Balances will appear here."; the old sentence "Expenses and balances will appear here." does not appear. The F3 page test's assertion on the old sentence is replaced (see Review checklist). Fakes: mocked `api/trips.ts`, `api/people.ts` and `api/expenses.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; the trip page shows the Expenses section in `npm run dev`.
- **Needs person review:** yes (changes an existing F3 test assertion, the old placeholder text, because the F4 spec changes that copy).
- **Commit:** `F4.T8: Show Expenses section on the trip page`

## Coverage
| Spec ID | Task(s) | Proven by |
|---|---|---|
| F4.R1 | T3, T4, T5, T6 | Unit (T3, T4); component (T6) |
| F4.R2 | T1, T3, T6 | Unit (T1, T3); component (T6) |
| F4.R3 | T1, T3, T6 | Unit (T1); component (T6) |
| F4.R4 | T3, T6 | Unit (T3); component (T6) |
| F4.R5 | T3, T6 | Unit (T3); component (T6) |
| F4.R6 | T3 | Unit (T3) |
| F4.R7 | T1, T3 | Unit (T1, T3) |
| F4.R8 | T3, T4, T6 | Unit (T3, T4); component (T6) |
| F4.R9 | T2, T3, T6 | Unit (T2, T3); code review (ORDER BY, T2); component (T6) |
| F4.R10 | T2, T3, T4, T5, T7 | Unit (T2, T3, T4); component (T7); code review (transaction, T3) |
| F4.R11 | T2 | Code review (cascade, T2) |
| F4.R12 | T2, T3 | Unit (T2, T3); the F3 remove endpoint is covered by F3 tests |
| F4.R13 | T3, T4 | Unit (T3, T4); code review (owner filter, T2) |
| F4.R14 | T3, T4 | Unit (T3, T4) |
| F4.R15 | T8 | Component test |
| F4.R16 | T4 | Code review (no edit route) |
| F4.AC1 | T3, T6 | Unit (T3); component (T6) |
| F4.AC2 | T1, T6 | Unit (T1); component (T6) |
| F4.AC3 | T1, T6 | Unit (T1); component (T6) |
| F4.AC4 | T1, T6 | Unit (T1); component (T6) |
| F4.AC5 | T1 | Unit (T1) |
| F4.AC6 | T1 | Unit (T1) |
| F4.AC7 | T6 | Unit (expenseInput); component (T6) |
| F4.AC8 | T3 | Unit (T3) |
| F4.AC9 | T6 | Component test |
| F4.AC10 | T2, T3, T6 | Unit (T2, T3); component (T6) |
| F4.AC11 | T3, T7 | Unit (T3); component (T7) |
| F4.AC12 | T2, T3 | Unit (T2, T3) |
| F4.AC13 | T2, T3, T4, T5, T7 | Unit (T2, T3, T4); component (T7); code review (owner filter, T2) |
| F4.AC14 | T3, T4, T5 | Unit (T3, T4); client (T5) |
| F4.AC15 | T4, T5 | Unit (T4) |
| F4.AC16 | T2 | Code review (cascades and transaction, T2) |
| F4.AC17 | T3, T4 | Unit (T3, T4) |
| F4.AC18 | T8 | Component test |

## Review checklist
A person checks these in code review, because unit tests can't prove them:
- [ ] `expenses.trip_id` references `trips(id) ON DELETE CASCADE`, and `expense_participants.expense_id` references `expenses(id) ON DELETE CASCADE` (F4.T2).
- [ ] `payer_id` and `person_id` have no cascade, so a person in an expense cannot be deleted by the database (F4.T2).
- [ ] The `CHECK` constraints on amounts and shares exist in `004-expenses.sql` (F4.T2).
- [ ] Every expense query in `repositories/expenses.ts` has `?` parameters only and filters by `trip_id` (and `id` for find). The owner check happens through the trip (F4.T2, F4.T3).
- [ ] `addExpense` inserts the expense and all share rows inside one transaction, and `deleteExpense` deletes inside one transaction (F4.T3).
- [ ] The shares of each saved expense add up to its amount (F4.T3, F4.R7).
- [ ] `apiGuard` runs before the service in all three handlers (F4.T4).
- [ ] No route for editing an expense exists (F4.T4, F4.R16).
- [ ] No response contains `owner_id` or another user's data (F4.T3, F4.T4).
- [ ] The F3 page test's assertion on the old placeholder sentence is replaced, not removed, and the new text matches the F4 spec. A person approves this change to an existing test (F4.T8).
- [ ] The expense usage check is in `usageChecks`, and the F3 remove endpoint returns `409` for a payer and for a participant (F4.T2; F4.AC12).

## Risks
- **F1, F2 and F3 must be built first.** F4 uses F1's guards, migration runner and client; F2's trips table and trip store; and F3's people table, people store, `usageChecks` and People section. None of this is committed yet, so F4 starts only after F1, F2 and F3 tasks are committed (on `week-1` or the feature branches).
- **Race between an expense and a person's removal.** A person could be removed in another tab just as an expense is saved. The add runs its people check and inserts inside one transaction, so a removed person gives `400`; the spec's "no longer on this trip" message covers the case in the UI. A person in an expense cannot be removed, because the in-use check runs in the removal transaction (F3.T3).
- **Share sums and money.** All money is integer cents. The parser never uses floats, and `splitEqually` is tested with a table so a rounding bug shows in unit tests, not in balances (F5).
- **Amount ceiling.** The ceiling is `Number.MAX_SAFE_INTEGER` cents, so one expense can't lose precision in JavaScript. F5 sums balances over many expenses; if totals ever grow past that ceiling, F5 must be planned again.
- **Budget ($15, Haiku only):** eight tasks, each one session. Stop and ask if a task runs long.
- **Owner checks cannot be fully unit tested.** The query filter, cascades and `CHECK` constraints are checked in code review only, as the spec's test plan says.

## Open questions
None. The spec has no open questions, and the one gap (the message for an amount over the ceiling) was answered by the user: "Amount is too large."

## Decisions log
- 2026-11-15: Plan created as Draft from the Approved F4 spec (spec version 2026-11-15).
- 2026-11-15: Message for an amount over the largest exact whole-cent value → "Amount is too large." (the spec gave no copy for this case).
- 2026-11-15: Plan approved by the user, as written (8 tasks; T2, T4 and T8 need person review).
