# Plan F6 — Settle up

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Spec: [F6-settle-up.md](../specs/features/F6-settle-up.md) · Spec version: 2026-11-15_

## Summary
This plan builds settle-up on a trip: a pure function that suggests payments from the balances using product.md R6 (greedy, ties by the order people were added), a `payments` table with cascades from `trips`, and a payment that counts in the balance calculation. It also builds the service and endpoints to list suggestions and recorded payments, mark a suggestion as paid (refused with `409` if it no longer matches), and delete a payment, all with the F1 ownership check. The payment is also added to the F3/F4 in-use check, and a Settle up section is added to the trip page. It has 8 tasks. Two are marked **Needs person review**: T2 (database migration) and T4 (API ownership checks on the new endpoints).

F6 builds on F1–F5. Nothing under `app/` is committed yet, so F6 can start only after the F1–F5 tasks are committed (see Risks).

## Stack and conventions
From `CLAUDE.md` and the F1–F5 plans:
- **Back end:** Node.js (LTS) + TypeScript (`strict`) + Express 5, in `app/api/`. Tests in `app/api/src/**/*.test.ts`. Unit test command: `npm test` (`vitest run`). Type check: `npm run typecheck`.
- **Front end:** React + Vite + TypeScript, in `app/web/`. Tests in `app/web/src/**/*.test.tsx` with jsdom and React Testing Library. Same two commands.
- **Database:** SQLite via `better-sqlite3`, `PRAGMA foreign_keys = ON`. Migrations are numbered SQL files run by F1.T4's `migrate.ts`. F2 uses `002-trips.sql`, F3 `003-people.sql`, F4 `004-expenses.sql`; F6 adds `005-payments.sql`.
- **Logs:** the project logger (`pino`). No `console.*`.
- **Libraries:** none new.

## Choices the spec left to the plan
| Spec ref | Choice | Why / source |
|---|---|---|
| F6.R2 | `suggestPayments(orderedPeople, balances)` is pure and greedy: repeatedly take the debtor with the largest debt (ties: earliest in trip order) and the creditor with the largest credit (ties: earliest), pay `min(debt, credit)` in cents, reduce both, and repeat until no debt remains. | Spec R2 and product.md R6, kept as written (Decisions log). Integer arithmetic only (CLAUDE.md "Money"). |
| F6.R3 | Ties are broken by the stored people order (`sortPeopleInOrder`, F3.T3). | Spec R3 (user's answer); same order as F3–F5. |
| F6.R1 | Suggestions are computed on each read and on each mark. Nothing is stored. | Spec R1; same approach as F5.R7. |
| F6.R7 | `calculateBalances` (F5.T1) gains a third input, `payments` (default `[]`). A payment adds `amountCents` to the payer's balance and subtracts it from the receiver's. | Spec R7 and F5 plan "F6 extends this calculation". A default keeps F5's tests unchanged. |
| F6.R6 | The mark service runs in one `store.transaction`: load people, expenses and payments, compute suggestions, check that the posted payer, receiver and amount match one of them, then insert. No match → `409`. | Spec R6. One transaction stops two tabs from both recording the same suggestion (project rule: writes in one transaction). |
| F6.R5 | Validation in plain function `validatePaymentInput(raw)`: payer and receiver are different non-empty strings; `amountCents` is an integer greater than zero and at most `Number.MAX_SAFE_INTEGER`. Migration adds `CHECK (payer_id <> receiver_id)` and `CHECK (amount_cents > 0)` as a second guard. | Spec R5. Same pattern as F4.R3 validation. |
| F6.R5 / F6.R11 | Payer and receiver are checked with F3's `findPersonOnTrip` inside the transaction; a person not on the trip gives `400`. | Same as F4.R13. |
| F6.R10 | F6 appends `paymentUsesPerson(db, personId)` to the `usageChecks` array in `db/repositories/people.ts`: `SELECT 1 FROM payments WHERE payer_id = ? UNION SELECT 1 FROM payments WHERE receiver_id = ? LIMIT 1`. | The extension point F3.R7 defines, as F4.R12 did. |
| F6.R8 | Order is `created_at DESC, id DESC`. | Spec R8; same as F4.R9. |
| F6.R9 | Delete is by payment ID on the trip (`findPaymentOnTrip` then `deletePaymentById`). Single-row write, so no transaction is needed. | Project rule applies only to writes that change more than one row. |
| F6.R13 | `payments.trip_id` references `trips.id` with `ON DELETE CASCADE`. `payer_id` and `receiver_id` have no cascade, as with `expenses.payer_id`. | Spec R13 and F4.R11 / F3.R9 pattern. |
| F6.R14 | `paymentView` returns `{ id, payer: {id, name}, receiver: {id, name}, amountCents, createdAt }` only. | Spec R14; same rule as F4.R14. |
| Spec copy | The approved copy in the spec's "States & errors" and F6.R12. | User approved the wording on 2026-11-15. |
| Module location | Back end `app/api/src/settle-up/`; web `app/web/src/settle-up/` and `components/SettleUpSection.tsx`. | Matches the earlier feature folders. |
| Money format | The `formatCents` helper from F4 (checked in F5.T5). | Avoids a second money formatter. |

## Approach
**Back end (`app/api/src/`):**
- `settle-up/suggest.ts`: `suggestPayments(orderedPeople, balances)` (pure) → `[{ payerId, receiverId, amountCents }]` in the order the rule produces. `validatePaymentInput(raw)` (pure).
- `settle-up/service.ts`: plain functions over injected stores (`tripStore`, `peopleStore`, `expenseStore`, `paymentStore`, `transaction`):
  - `getSettleUp({ ownerId, tripId }, deps)` → `{ ok: true, suggested, payments }` or `'not-found'`.
  - `markPaid({ ownerId, tripId, payerId, receiverId, amountCents }, deps)` → `{ ok: true, payment }`, `'not-found'`, `'invalid'` (with field), `'person-not-on-trip'`, or `'suggestion-changed'` (409).
  - `deletePayment({ ownerId, tripId, paymentId }, deps)` → `{ ok: true }` or `'not-found'`.
- `settle-up/views.ts`: `paymentView(row)` and `suggestionView(row)` (pure), F6.R14 shape, integers only.
- `balances/calculate.ts` (F5.T1): `calculateBalances(orderedPeople, expenses, payments = [])`.
- `balances/service.ts` (F5.T2): also loads the trip's payments through `paymentStore` and passes them to `calculateBalances`, so the Balances endpoint reflects payments (F6.R7).
- `http/routes/settle-up.ts`: `GET /api/trips/:id/settle-up`, `POST /api/trips/:id/payments`, `DELETE /api/trips/:id/payments/:paymentId`. Each runs `apiGuard` first, then the service. `settleUpRouter(deps)`.
- `http/app.ts`: mount the router. `index.ts` passes the real stores and `db.transaction`.

**Db (`app/api/src/db/`):**
- `repositories/payments.ts` with the `Db` interface, `?` placeholders only: `insertPayment`, `listPaymentsByTrip` (`ORDER BY created_at DESC, id DESC`), `findPaymentOnTrip`, `deletePaymentById`, `listPaymentsByTrip` also used by the balance service.
- `repositories/people.ts`: `paymentUsesPerson` appended to `usageChecks`.

**Front end (`app/web/src/`):**
- `api/settleUp.ts`: `getSettleUp(tripId)`, `markPaid(tripId, body)`, `deletePayment(tripId, paymentId)` on F1's `api/client.ts`. `404` → `not-found`; `409` → `suggestion-changed`; `400` → field error passed up; `401` passed up.
- `settle-up/formatSuggestion.ts`: pure text builder for "{payer} pays {receiver} {amount}" and "{payer} paid {receiver} {amount}".
- `components/SettleUpSection.tsx`: heading "Settle up", suggested rows with "Mark as paid", recorded rows with "Delete", the all-settled state, no-people state, loading and load-failed states, `refreshKey` to refetch, and `onChanged` after a successful mark or delete.
- `components/DeletePaymentDialog.tsx`: the modal from the spec (Cancel focused, Escape closes as Cancel, focus returns to the row's Delete button).
- `pages/TripPage.tsx`: renders `SettleUpSection` below the Balances section and shares the refresh counter, so Balances and Expenses refresh after a payment change.
- `copy.ts`: the F6 strings.

Reused from F1–F5: `db/open.ts`, `logger.ts`, `auth/guards.ts` (`apiGuard`, `ownsTrip`), error handler, `trips/store.ts`, `people/store.ts` (`findPersonOnTrip`, `sortPeopleInOrder`), `expenses/store.ts` (`listExpensesByTrip`), `balances/calculate.ts`, `balances/service.ts` (pattern), `api/client.ts`, `api/people.ts`, `components/RequireSession.tsx`, `copy.ts`, the money formatter.

## Data and API changes
**Tables (new, migration `005-payments.sql`):** `payments` as in the spec's Data & contract section:
- Columns: `id`, `trip_id` (references `trips.id`, `ON DELETE CASCADE`), `payer_id` (references `people.id`), `receiver_id` (references `people.id`), `amount_cents` (integer), `created_at` (UTC text).
- `CHECK (payer_id <> receiver_id)` and `CHECK (amount_cents > 0)`.
- Index on `trip_id`.
- `docs/specs/data-model.md` is updated by T2.

**Endpoints (new, documented in `docs/specs/api.md` by T4):** the spec's table, unchanged:
- `GET /api/trips/:id/settle-up` → `200 { suggested: [{ payer, receiver, amountCents }], payments: [{ id, payer, receiver, amountCents, createdAt }] }`.
- `POST /api/trips/:id/payments` with `{ payerId, receiverId, amountCents }` → `201 { payment }`; `400` invalid or person not on trip; `409` suggestion changed.
- `DELETE /api/trips/:id/payments/:paymentId` → `204`; `404` missing or another user's.
- All three: `401` logged out; `404` trip missing or another user's.

The F3 remove-person endpoint gains the payment in-use answer through `usageChecks`, so it can return `409` for a payment participant (F6.R10).

**Balances endpoint (F5):** the response is unchanged in shape, but the balances now include payments (F6.R7).

**Page changes (web):** a Settle up section is added to the trip page (T8). F5 already removed all placeholder text from the page, so no placeholder test is replaced.

## Tasks
### F6.T1 — Suggested payments, payment validation and payments in the balance
- **Builds:** F6.R1 (computed), F6.R2, F6.R3, F6.R5 (validation), F6.R7 (calculation)
- **Proves:** F6.AC1, F6.AC2 (balance part), F6.AC3 (empty list), F6.AC4, F6.AC6 (validation part)
- **Depends on:** F5.T1 (`calculateBalances`), F3.T3 (`sortPeopleInOrder`)
- **Files:** `app/api/src/settle-up/suggest.ts`, `app/api/src/settle-up/suggest.test.ts`, `app/api/src/settle-up/validation.ts`, `app/api/src/settle-up/validation.test.ts`, `app/api/src/balances/calculate.ts` (add `payments` argument, default `[]`), `app/api/src/balances/calculate.test.ts` (add cases)
- **Steps:**
  1. `calculateBalances(orderedPeople, expenses, payments = [])`: after the expense step, for each payment add `amountCents` to the payer and subtract it from the receiver. Unknown people are ignored, as F5.T1 does.
  2. `suggestPayments(orderedPeople, balances)`: greedy rule in the Choices table. Integer math only.
  3. `validatePaymentInput(raw)`: returns `{ ok: true, value }` or `{ ok: false, field, message }` with the spec copy for the 400 cases.
- **Tests:** `F6.AC1`: the Example 1 balances give "Jo pays Sam 4000", then "Alex pays Sam 1000", in that order. `F6.AC2`: one payment of 4000 from Jo to Sam gives Sam +1000, Alex −1000, Jo 0 (balances), and suggestions are only "Alex pays Sam 1000". `F6.AC3`: all balances zero give an empty suggestion list. `F6.AC4`: two equal debtors give the earlier-added person's payment first. `F6.AC6`: the same payer and receiver is rejected; amounts of zero, negative or non-integer are rejected. Fakes: none (pure data).
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; the existing F5 balance tests still pass unchanged.
- **Needs person review:** no
- **Commit:** `F6.T1: Add suggested payments and payments in the balance`

### F6.T2 — Payments schema, repository and in-use check
- **Builds:** F6.R8 (stored order), F6.R10 (in-use check), F6.R13 (cascade)
- **Proves:** F6.AC8 (in-use check), F6.AC14 (order in SQL), F6.AC10 (query filter, with code review); supports F6.AC12 (code review)
- **Depends on:** F3.T2 (`usageChecks`), F4.T2 (`expenses` table for the pattern), F2.T2 (`trips` table)
- **Files:** `app/api/src/db/migrations/005-payments.sql`, `app/api/src/db/repositories/payments.ts`, `app/api/src/db/repositories/payments.test.ts`, `app/api/src/db/repositories/people.ts` (one entry in `usageChecks`), `app/api/src/db/repositories/people.test.ts` (one test added), `docs/specs/data-model.md`
- **Steps:**
  1. `005-payments.sql`: create `payments` with the columns and checks in Data and API changes; index on `trip_id`.
  2. `repositories/payments.ts`: `insertPayment(db, {...})` returns the ID; `listPaymentsByTrip(db, tripId)` with `WHERE trip_id = ? ORDER BY created_at DESC, id DESC` and a join for payer and receiver names; `findPaymentOnTrip(db, paymentId, tripId)` with `WHERE id = ? AND trip_id = ?`; `deletePaymentById(db, paymentId)`.
  3. `people.ts`: append `paymentUsesPerson(db, personId)` to `usageChecks`, sending the person ID as two parameters.
  4. Update `docs/specs/data-model.md` with the table and the cascade rule.
- **Tests:** With a fake `Db` that records SQL and parameters: each function uses `?` placeholders and passes values as parameters (no string joining); `listPaymentsByTrip` sends the trip ID and has `ORDER BY created_at DESC, id DESC` (`F6.AC14`); `findPaymentOnTrip` sends both the payment ID and trip ID (`F6.AC10`); `paymentUsesPerson` returns `true` when the fake `Db` returns a row for the payer query, `true` for the receiver query, and `false` when neither does (`F6.AC8`). Existing F3 and F4 tests still pass with the extra entry. Fakes: fake `Db`. No SQLite file in unit tests.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; `data-model.md` matches the migration.
- **Needs person review:** yes (database migration; the cascade, the checks and the usage query are checked in review).
- **Commit:** `F6.T2: Add payments schema, repository and usage check`

### F6.T3 — Settle-up service, mark and delete, and balances with payments
- **Builds:** F6.R4, F6.R5 (service part), F6.R6, F6.R7 (balances service), F6.R8 (service order), F6.R9, F6.R11 (service part), F6.R14
- **Proves:** F6.AC2 (service), F6.AC5, F6.AC6 (service), F6.AC7, F6.AC9, F6.AC10 (service part), F6.AC13, F6.AC14 (service); supports F6.AC3 and F6.AC4 through `getSettleUp`
- **Depends on:** F6.T1, F6.T2, F5.T2 (balances service), F4.T3 (expense store), F3.T3 (people store), F2.T3 (trip store), F1.T9 (`ownsTrip`)
- **Files:** `app/api/src/settle-up/service.ts`, `app/api/src/settle-up/service.test.ts`, `app/api/src/settle-up/views.ts`, `app/api/src/settle-up/views.test.ts`, `app/api/src/balances/service.ts` (also load payments), `app/api/src/balances/service.test.ts` (add an empty payment fake; no assertion changed)
- **Steps:**
  1. `getSettleUp`: ownership first (`ownsTrip`, `'not-found'`); load people (sorted), expenses, payments; `calculateBalances` with payments; `suggestPayments`; return suggestions and payments (newest first).
  2. `markPaid`: ownership; validate input (T1); inside `transaction`: load people, expenses and payments, compute suggestions, check that the posted triple equals one of them (`'suggestion-changed'` otherwise), check payer and receiver are on the trip (`findPersonOnTrip`, `'person-not-on-trip'`), then `insertPayment` with `created_at` from the injected clock.
  3. `deletePayment`: ownership; `findPaymentOnTrip` → `'not-found'` when missing; `deletePaymentById`.
  4. `balances/service.ts`: load payments through `paymentStore` and pass them to `calculateBalances`.
  5. `views.ts`: `paymentView` and `suggestionView`, integers only.
- **Tests:** `F6.AC2`: a fake store with the Example 1 expenses; mark "Jo pays Sam 4000"; the fake payment store gains one row; the next read shows Alex's suggestion only, and the balances are as F6.T1 states. `F6.AC5`: posting a triple that is not in the current suggestions returns `'suggestion-changed'` and the fake payment store is unchanged. `F6.AC6`: equal payer and receiver, and amount zero, return `'invalid'` and no insert. `F6.AC7`: delete removes the row; the balances read afterward return to the earlier values. `F6.AC9`: a payer ID not on the trip returns `'person-not-on-trip'` and no insert. `F6.AC10`: user B on user A's trip returns `'not-found'` for all three calls, and the fake stores are not written. `F6.AC13`: `paymentView` has no `owner_id` and integers only. `F6.AC14`: payments come back newest first, ties by ID. `F6.AC3`: all zero gives an empty suggestion list. Fakes: in-memory trip, people, expense and payment stores; a `transaction` helper that runs the callback directly; fixed clock. Log spies check no names are logged.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; F5 balance tests still pass.
- **Needs person review:** no
- **Commit:** `F6.T3: Add settle-up service and balances with payments`

### F6.T4 — Settle-up API routes and mount
- **Builds:** F6.R11 (API part), F6.R10 (409 response through F3's remove route), F6.R5 (400 responses)
- **Proves:** F6.AC10 (HTTP `404`), F6.AC11 (HTTP `401`), F6.AC13 (no `owner_id` in bodies), F6.AC5 (HTTP `409`), F6.AC9 (HTTP `400`)
- **Depends on:** F6.T3, F1.T9, F1.T10 (app and error handler), F5.T3 (router pattern)
- **Files:** `app/api/src/http/routes/settle-up.ts`, `app/api/src/http/routes/settle-up.test.ts`, `app/api/src/http/app.ts`, `app/api/src/index.ts`, `docs/specs/api.md`
- **Steps:**
  1. Handlers for GET, POST and DELETE: `apiGuard` first (`401`, no data), then the service. Map `'not-found'` → `404` (same body for missing and another user's trip), `'invalid'` → `400` with field, `'person-not-on-trip'` → `400`, `'suggestion-changed'` → `409` with the spec's message. Success bodies use the views.
  2. `settleUpRouter(deps)` mounted in `app.ts`; `index.ts` passes real stores and `db.transaction`.
  3. Document the three endpoints and their responses in `docs/specs/api.md`.
- **Tests:** `F6.AC11`: no cookie gives `401` with no data for all three. `F6.AC10`: another user's trip gives `404` with the same body as a missing trip. `F6.AC13`: success bodies have no `owner_id`. `F6.AC5`: a fake service returning `'suggestion-changed'` gives `409`. `F6.AC9`: `'person-not-on-trip'` gives `400`. Code review: no route besides these three is added. Fakes: fake settle-up service, fake session store, fake response.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; `api.md` lists the endpoints.
- **Needs person review:** yes (API ownership checks on new endpoints, reviewed like F4.T4 and F5.T3).
- **Commit:** `F6.T4: Add settle-up API routes`

### F6.T5 — Settle-up API client (web)
- **Builds:** F6.R11 (client part), F6.R6 (`409` mapping)
- **Proves:** supports F6.AC5 and F6.AC11 (client maps the responses)
- **Depends on:** F1.T11 (`api/client.ts`), F6.T4 (contract)
- **Files:** `app/web/src/api/settleUp.ts`, `app/web/src/api/settleUp.test.ts`
- **Steps:**
  1. `getSettleUp`, `markPaid`, `deletePayment` on F1's client.
  2. `404` → `not-found`; `409` → `suggestion-changed`; `400` → field error; `401` passed up; other errors passed up.
- **Tests:** `F6.AC5`: a `409` gives `suggestion-changed`. `F6.AC11`: a `401` gives status 401 to the caller. `F6.AC10`: a `404` gives `not-found`. Fakes: mocked `fetch`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`.
- **Needs person review:** no
- **Commit:** `F6.T5: Add settle-up API client`

### F6.T6 — Settle up section: suggestions, mark as paid, empty and error states
- **Builds:** F6.R4 (UI), F6.R6 (message), F6.R12
- **Proves:** F6.AC3 (UI), F6.AC5 (UI message)
- **Depends on:** F6.T5, F3.T5 (people client, for the no-people check), the money formatter (F4)
- **Files:** `app/web/src/settle-up/formatSuggestion.ts`, `app/web/src/settle-up/formatSuggestion.test.ts`, `app/web/src/components/SettleUpSection.tsx`, `app/web/src/components/SettleUpSection.test.tsx`, `app/web/src/copy.ts`
- **Steps:**
  1. `formatSuggestion(row)`: "{payer} pays {receiver} {amount}" with two decimals.
  2. `SettleUpSection`: heading "Settle up"; a `<ul>` of suggested rows, each with a "Mark as paid" button labelled for that payment; "Everyone is settled up." when empty; no-people state with the link to People; loading and load-failed states with "Try again"; busy state on the clicked button; the stale-suggestion and server-error messages from the spec; `onChanged` after success.
  3. Add the strings to `copy.ts`.
- **Tests:** `F6.AC3`: a response with no suggestions shows "Everyone is settled up." and no rows. `F6.AC5`: a `suggestion-changed` response shows "The suggestions changed. Check the list and try again." and refetches. Row text includes the names and amount. A double-click sends one request while the button is busy. Fakes: mocked `api/settleUp.ts` and `api/people.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; suggestions show in `npm run dev`.
- **Needs person review:** no
- **Commit:** `F6.T6: Add Settle up section with mark as paid`

### F6.T7 — Recorded payments list and delete dialog
- **Builds:** F6.R8 (UI order), F6.R9
- **Proves:** F6.AC7 (UI), F6.AC14 (UI order)
- **Depends on:** F6.T6
- **Files:** `app/web/src/components/SettleUpSection.tsx` (recorded list), `app/web/src/components/SettleUpSection.test.tsx`, `app/web/src/components/DeletePaymentDialog.tsx`, `app/web/src/components/DeletePaymentDialog.test.tsx`, `app/web/src/copy.ts`
- **Steps:**
  1. Recorded list: `<ul>` of rows "{payer} paid {receiver} {amount}" with a "Delete" button labelled for that payment, in the order returned.
  2. Dialog: title "Delete this payment?", the spec text, "Cancel" (focused on open) and "Delete payment". Escape closes as Cancel. Both buttons are disabled while the request runs. Focus returns to that row's "Delete" button on close without delete.
  3. Success shows "{payer} paid {receiver} {amount}" removed notice; "already gone" shows "That payment is no longer on this trip." and refreshes the list.
- **Tests:** `F6.AC7`: Delete then "Delete payment" calls `deletePayment` once and fires `onChanged`; Cancel and Escape make no call. `F6.AC14`: rows are shown in the order given. "Already gone" (`404`) closes the dialog and refreshes. Fakes: mocked `api/settleUp.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`.
- **Needs person review:** no
- **Commit:** `F6.T7: Add recorded payments and delete payment dialog`

### F6.T8 — Trip page: Settle up section, refresh Balances on payment change
- **Builds:** F6.R12 (page placement)
- **Proves:** F6.AC15, and the UI part of F6.AC2 (balances refresh after a mark)
- **Depends on:** F6.T7, F5.T6 (trip page refresh counter)
- **Files:** `app/web/src/pages/TripPage.tsx`, `app/web/src/pages/TripPage.test.tsx`
- **Steps:**
  1. Render `SettleUpSection` below the Balances section.
  2. `SettleUpSection`'s `onChanged` increments the same refresh counter used by Balances and Expenses (F5.T6), so the balances refetch after a mark or delete.
  3. No placeholder text is added or removed.
- **Tests:** `F6.AC15`: a found trip shows the Settle up section, and no placeholder text remains on the page. A mark on the page refetches the balances request. Fakes: mocked `api/trips.ts`, `api/people.ts`, `api/expenses.ts`, `api/balances.ts` and `api/settleUp.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; marking a payment in `npm run dev` updates Balances and the suggestions.
- **Needs person review:** no
- **Commit:** `F6.T8: Show Settle up section on the trip page`

## Coverage
| Spec ID | Task(s) | Proven by |
|---|---|---|
| F6.R1 | T1, T3 | Unit (T1, T3) |
| F6.R2 | T1 | Unit (T1) |
| F6.R3 | T1 | Unit (T1) |
| F6.R4 | T3, T6 | Unit (T3); component (T6) |
| F6.R5 | T1, T3, T4 | Unit (T1, T3); HTTP (T4) |
| F6.R6 | T3, T5, T6 | Unit (T3); client (T5); component (T6) |
| F6.R7 | T1, T3 | Unit (T1, T3) |
| F6.R8 | T2, T3, T7 | Unit (T2, T3); component (T7) |
| F6.R9 | T3, T7 | Unit (T3); component (T7) |
| F6.R10 | T2, T4 | Unit (T2); code review (T4 route) |
| F6.R11 | T2, T3, T4, T5 | Unit (T2, T3, T4); client (T5); code review (owner filter, T2, T4) |
| F6.R12 | T6, T8 | Component (T6, T8) |
| F6.R13 | T2 | Code review (cascade) |
| F6.R14 | T3 | Unit (T3) |
| F6.AC1 | T1 | Unit |
| F6.AC2 | T1, T3, T8 | Unit (T1, T3); component (T8) |
| F6.AC3 | T1, T3, T6 | Unit (T1, T3); component (T6) |
| F6.AC4 | T1 | Unit |
| F6.AC5 | T3, T4, T5, T6 | Unit (T3); HTTP (T4); client (T5); component (T6) |
| F6.AC6 | T1, T3 | Unit (T1, T3) |
| F6.AC7 | T3, T7 | Unit (T3); component (T7) |
| F6.AC8 | T2 | Unit (T2); code review (remove route, T4) |
| F6.AC9 | T3, T4 | Unit (T3); HTTP (T4) |
| F6.AC10 | T2, T3, T4, T5 | Unit (T2, T3, T4); client (T5); code review (owner filter, T2) |
| F6.AC11 | T4, T5 | HTTP (T4); client (T5) |
| F6.AC12 | T2 | Code review (cascade, transaction) |
| F6.AC13 | T3, T4 | Unit (T3, T4) |
| F6.AC14 | T2, T3, T7 | Unit (T2, T3); component (T7) |
| F6.AC15 | T8 | Component (T8) |

## Review checklist
A person checks these in code review, because unit tests can't prove them:
- [ ] `payments` cascades from `trips` and the trip delete runs in one transaction (F6.T2).
- [ ] `payer_id` and `receiver_id` have no cascade, and the in-use check runs before any person delete (F6.T2, F6.T4).
- [ ] Every payment query filters by `trip_id`, and `getSettleUp`, `markPaid`, `deletePayment` run the owner check before any read (F6.T2, F6.T3).
- [ ] `apiGuard` runs before the service in each settle-up handler (F6.T4).
- [ ] The mark check and insert run in one `transaction` (F6.T3).
- [ ] No route besides the three listed is added, and no table or column stores suggestions (F6.T4, F6.R1).

## Risks
- **F1 to F5 must be built first.** F6 uses F1's guards, F2's trip store, F3's people store and `usageChecks`, F4's expense store, and F5's balance calculation and service. None of this is committed yet, so F6 starts only after the F1–F5 tasks are committed.
- **Greedy rule vs. "fewest payments".** product.md's Goals say "as few payments as possible", but R6 is greedy and can use one more payment than the true minimum. The user chose R6 as written (spec Decisions log). If the user later wants a true minimum, the spec must change first; `suggestPayments` is the only place to change.
- **F5 change.** T3 adds a payment fake to F5's balance service tests. No F5 assertion changes. The F5 plan's T2 and T1 tests keep passing because `calculateBalances` defaults `payments` to `[]`.
- **Race on mark.** Two tabs can both try to mark the same suggestion. The transaction plus the `409` check makes the second one fail cleanly (AC5). Code review confirms the transaction boundary.
- **Budget ($15, Haiku only):** eight tasks, each one session. Stop and ask if a task runs long.
- **Owner checks cannot be fully unit tested.** The query filters and the cascade are checked in code review only, as the spec's test plan says.

## Open questions
None. The spec has no open questions, and the copy was approved on 2026-11-15.

## Decisions log
- 2026-11-15: Plan created as Draft from the Approved F6 spec (spec version 2026-11-15).
- 2026-11-15: Plan approved by the user, as written (8 tasks; T2 and T4 need person review).
