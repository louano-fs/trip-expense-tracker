# Plan F3 — People

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Spec: [F3-people.md](../specs/features/F3-people.md) · Spec version: 2026-11-15_

## Summary
This plan builds people on a trip: the `people` table with a cascade from `trips`, a case-insensitive unique name per trip, add, list and remove with the F1 ownership check, and the in-use check that blocks removal. It also builds the People section on the trip page, which replaces the people part of the F2 placeholder. It has 8 tasks. Three are marked **Needs person review**: T2 (database migration), T4 (API ownership checks) and T8 (changes the placeholder assertion in an F2 test, which the spec requires).

F3 builds on F1 and F2. Nothing under `app/` exists yet, so F3 can start only after the F1 and F2 tasks are committed (see Risks).

## Stack and conventions
From `CLAUDE.md`, F1 plan and F2 plan:
- **Back end:** Node.js (LTS) + TypeScript (`strict`) + Express 5, in `app/api/`. Tests in `app/api/src/**/*.test.ts`. Unit test command: `npm test` (`vitest run`). Type check: `npm run typecheck`.
- **Front end:** React + Vite + TypeScript, in `app/web/`. Tests in `app/web/src/**/*.test.tsx` with jsdom and React Testing Library. Same two commands.
- **Database:** SQLite via `better-sqlite3`, `PRAGMA foreign_keys = ON` (F1.T4). Migrations are numbered SQL files run by F1.T4's `migrate.ts`. F2 uses `002-trips.sql`; F3 adds `003-people.sql`.
- **Logs:** the project logger (`pino`). No `console.*`.
- **Libraries:** none new. F3 uses only what F1 and F2 added.

## Choices the spec left to the plan
| Spec ref | Choice | Why / source |
|---|---|---|
| F3.R3 | Store `name_key` = trimmed name, NFC-normalized, then `toLowerCase()` (JavaScript, not SQLite). A unique index on `(trip_id, name_key)` enforces the rule. | SQLite's `COLLATE NOCASE` folds only ASCII letters, so it would not match "ignoring letter case" for accented names. Doing it in JavaScript keeps one definition, shared by the service and the database. |
| F3.R3 | A unique-constraint violation is mapped to `DuplicatePersonError` in the repository, the same way F1 maps email to `EmailTakenError`. | One error type for the service to handle; the service never inspects SQL errors. |
| F3.R4 | Order is `created_at ASC, id ASC`. The service also sorts with a pure `sortPeopleInOrder`. | Same approach as F2.R5, so the order is testable with a fake store. Stored order matters for R3 leftover cents in F5. |
| F3.R7 | `usageChecks` is an array in `db/repositories/people.ts`. Each entry is a function `(db, personId) => boolean`. F3 leaves it empty, so `isPersonInUse` returns `false`. F4 and F6 append their check. | Adds no SQL built from strings (project rule). A new feature only adds one entry, and its spec tests it. |
| F3.R6 | Check in-use and delete in one transaction (`store.transaction`). | Same reason as F2.R9: an expense added between the check and the delete cannot slip through. |
| F3.R8 | The people service loads the trip from F2's trip store and calls F1's `ownsTrip(trip, userId)`. A missing trip, a missing person and another user's trip all give `'not-found'`. | Reuses the shared check, so F3 does not invent a second one. |
| F3.R2 | Name rules live in `validatePersonName(raw)`, using `countCharacters` from F1.T2. The web form repeats the same two checks for instant feedback. | Same approach as F2.R2 (rules in plain functions; server is authority). |
| F3.R5 | The remove dialog is a new component, `RemovePersonDialog`, not a change to F2's `DeleteTripDialog`. | Keeps F2's files and tests unchanged. The focus behaviour is copied, not shared, to avoid touching F2 code. |
| Spec API | Duplicate name and in-use person both return `409`, as the spec table says. | Spec table. |
| F3.R10 | The placeholder text becomes "Expenses and balances will appear here." once the People section is shown. | Spec F3.R10 and AC13. |

## Approach
**Back end (`app/api/src/`):**
- `people/validation.ts`: `validatePersonName(raw)` (pure) → `{ ok: true, name }` or `{ ok: false, field: 'name', message }`. `personNameKey(name)` (pure) → NFC, trim is already done, `toLowerCase()`.
- `people/store.ts`: the store interface the service uses (`insertPerson`, `listPeopleByTrip`, `findPersonOnTrip`, `deletePerson`, `isPersonInUse`, `transaction`). Type only.
- `people/service.ts`: `addPerson`, `listPeople`, `removePerson`. Each takes `{ store, tripStore, clock }` and the owner ID. Returns plain results, not HTTP.
- `people/views.ts`: `personView(person)` → `{ id, name }` only (F3.AC12). `sortPeopleInOrder(people)` pure.
- `http/routes/people.ts`: three handlers and `peopleRouter(deps)`. Each handler runs F1's `apiGuard` first, then the service.
- `http/app.ts`: mount the people router next to the trips router (F2.T4).

**Front end (`app/web/src/`):**
- `api/people.ts`: `listPeople(tripId)`, `addPerson(tripId, name)`, `removePerson(tripId, personId)`, built on F1's `api/client.ts`. Maps `404` to `not-found`, `409` on delete to `in-use`, `400`/`409` on add to the field error.
- `people/personName.ts`: `checkPersonName(raw)` for instant feedback. Pure.
- `components/PeopleSection.tsx`: heading, list, add form with "Add person" button, empty state, load-failed state. Uses `api/people.ts`.
- `components/RemovePersonDialog.tsx`: confirmation, in-use message, errors.
- `pages/TripPage.tsx` (F2.T8): renders `PeopleSection` in place of the people part of the placeholder.
- `copy.ts`: the F3 strings from the spec's States & errors section.

Reused from F1 and F2: `db/open.ts`, `db/migrate.ts`, `logger.ts`, `auth/guards.ts` (`apiGuard`, `ownsTrip`), `auth/validation.ts` (`countCharacters`), `db/repositories/trips.ts` (`findTripForOwner`), `trips/store.ts`, `api/client.ts`, `components/RequireSession.tsx`, `copy.ts`.

## Data and API changes
**Table (new, migration `003-people.sql`)** — the spec's Data & contract section defines `people`. This plan adds:
- `id INTEGER PRIMARY KEY AUTOINCREMENT`, `trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `name_key TEXT NOT NULL`, `created_at TEXT NOT NULL` (UTC ISO 8601).
- `UNIQUE (trip_id, name_key)` index named `people_trip_name_key` (F3.R3).
- Index `people_trip_id_idx` on `people(trip_id)` (as the spec's Data section lists).
- No `DEFAULT` for `created_at`; the service always sets it.
- `docs/specs/data-model.md` gets the `people` table (T2).

**Endpoints (new, documented in `docs/specs/api.md` by T4):** the spec's table, unchanged:
- `GET /api/trips/:id/people` → `200 { people: [{ id, name }] }`.
- `POST /api/trips/:id/people` → `201 { person }`; `400` for a bad name; `409` for a duplicate name.
- `DELETE /api/trips/:id/people/:personId` → `204`; `409` when in use; `404` when the trip or person is missing or belongs to another user.
- All three return `401` when logged out (apiGuard).

**Page changes (web):** `/trips/:id` shows the People section (T8).

## Tasks
### F3.T1 — Person name rules
- **Builds:** F3.R2, F3.R3 (name key)
- **Proves:** F3.AC2, F3.AC3, F3.AC4 (the "same name" rule)
- **Depends on:** F1.T2 (for `countCharacters`)
- **Files:** `app/api/src/people/validation.ts`, `app/api/src/people/validation.test.ts`
- **Steps:**
  1. `validatePersonName(raw)`: `trim()`, count code points. Reject 0 with "Enter a name."; reject over 100 with "Name must be 100 characters or fewer."
  2. Return `{ ok: true, name }` with the trimmed name, or `{ ok: false, field: 'name', message }`.
  3. `personNameKey(name)`: NFC normalize, then `toLowerCase()`.
- **Tests:** `F3.AC2`: `"  Sam  "` gives `Sam`; `"   "` is rejected with "Enter a name.". `F3.AC3`: 100 characters accepted, 101 rejected with the length message; 100 emoji accepted and 101 rejected (one per code point). `F3.AC4`: `personNameKey("Sam")` equals `personNameKey("sam")`, and `personNameKey("Ångström")` equals `personNameKey("ångström")`. Fakes: none (pure).
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`.
- **Needs person review:** no
- **Commit:** `F3.T1: Add person name rules`

### F3.T2 — People schema, repository and in-use hook
- **Builds:** F3.R3 (unique index, mapped error), F3.R4 (stored order), F3.R7 (in-use hook), F3.R9 (cascade)
- **Proves:** none directly. Supports F3.AC4, F3.AC5, F3.AC8 and F3.AC11 (code review of the real queries and cascade).
- **Depends on:** F1.T4 (migrations, `Db` interface), F2.T2 (`trips` table for the foreign key)
- **Files:** `app/api/src/db/migrations/003-people.sql`, `app/api/src/db/repositories/people.ts`, `app/api/src/db/repositories/people.test.ts`, `docs/specs/data-model.md`
- **Steps:**
  1. `003-people.sql`: create `people` with the columns above, the `UNIQUE (trip_id, name_key)` index and the `trip_id` index.
  2. `repositories/people.ts` with the `Db` interface, `?` placeholders only:
     - `insertPerson(db, { tripId, name, nameKey, createdAt })` returns the new ID; a unique-violation error becomes `DuplicatePersonError`.
     - `listPeopleByTrip(db, tripId)` with `WHERE trip_id = ? ORDER BY created_at ASC, id ASC`.
     - `findPersonOnTrip(db, personId, tripId)` with `WHERE id = ? AND trip_id = ?`.
     - `deletePersonById(db, personId)`.
     - `usageChecks: Array<(db, personId) => boolean>` = `[]` and `isPersonInUse(db, personId)` = whether any check returns true. Comment-free; a short note in `data-model.md` says F4 and F6 add their checks here.
  3. Update `docs/specs/data-model.md` with the `people` table and the rule that every table that refers to a person or a trip cascades.
- **Tests:** With a fake `Db` that records SQL and parameters: each function uses `?` placeholders and passes values as parameters (no string joining); `listPeopleByTrip` sends the trip ID as a parameter and has the `ORDER BY created_at ASC, id ASC` clause (`F3.AC5`); `findPersonOnTrip` sends both the person ID and trip ID (`F3.AC9`); a fake `Db` that throws a unique-violation error makes `insertPerson` throw `DuplicatePersonError` (`F3.AC4`); `isPersonInUse` returns `false` when `usageChecks` is empty (`F3.AC8` base case). Fakes: fake `Db`. No SQLite file in unit tests.
- **Done when:** `npm test` and `npm run typecheck` pass; `data-model.md` matches the migration.
- **Needs person review:** yes (database migration; the unique index, cascade and missing owner filter are checked in review).
- **Commit:** `F3.T2: Add people schema and repository`

### F3.T3 — People service and views
- **Builds:** F3.R1, F3.R4 (sort), F3.R5 (service part), F3.R6, F3.R7 (use), F3.R8 (service part), F3.R11
- **Proves:** F3.AC1, F3.AC4 (service), F3.AC5, F3.AC7, F3.AC8, F3.AC9, F3.AC12
- **Depends on:** F3.T1, F3.T2, F2.T2 (trip store), F2.T3 (trip store interface), F1.T9 (`ownsTrip`)
- **Files:** `app/api/src/people/store.ts`, `app/api/src/people/service.ts`, `app/api/src/people/service.test.ts`, `app/api/src/people/views.ts`, `app/api/src/people/views.test.ts`
- **Steps:**
  1. `store.ts`: the interface the service uses, matching T2.
  2. `addPerson({ ownerId, tripId, rawName }, { store, tripStore, clock })`: find the trip (F2 store); `ownsTrip` → `'not-found'` when missing or not owned; validate (T1); insert with `nameKey` and `createdAt = clock.now()` in UTC ISO. A `DuplicatePersonError` becomes `{ ok: false, status: 409, field: 'name', message: 'Someone with this name is already on this trip.' }`. Success returns `{ ok: true, person }`.
  3. `listPeople({ ownerId, tripId }, { store, tripStore })`: ownership check, then `sortPeopleInOrder`.
  4. `removePerson({ ownerId, tripId, personId }, { store, tripStore })`: ownership check; find the person on the trip (`'not-found'` if missing); run inside `store.transaction`: if `store.isPersonInUse(personId)` → `{ ok: false, status: 409, message: 'in-use' }` (a stable code, not display text; the web dialog builds the sentence with the person's name, F3 States & errors); else delete. Returns `{ ok: true }`.
  5. `views.ts`: `personView(person)` returns `{ id, name }` only; `sortPeopleInOrder` sorts by `createdAt` then `id`, both ascending.
- **Tests:** `F3.AC1`: fake store and fixed clock: person saved with trip, trimmed name and UTC time; result has the person. `F3.AC4`: fake store throwing `DuplicatePersonError` for `sam` after `Sam` returns 409 with the field name and no person added; the same name on a second trip is accepted. `F3.AC5`: three people at different times, and two with the same time ordered by ID. `F3.AC7`: remove with `isPersonInUse` false removes the person and the fake store shows one delete call inside the transaction. `F3.AC8`: remove with `isPersonInUse` true returns 409 and the fake store has no delete. `F3.AC9`: user B adding, listing or removing on A's trip returns `'not-found'`, and the fake store is unchanged. `F3.AC12`: `personView` output has no `owner_id` and no trip data. Fakes: in-memory people store with `transaction` that records calls, in-memory trip store, fixed clock, fixed IDs, scripted `isPersonInUse`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; no test calls the real clock.
- **Needs person review:** no
- **Commit:** `F3.T3: Add people service and views`

### F3.T4 — People API routes and mount
- **Builds:** F3.R1 (API), F3.R2 (400), F3.R6 (409), F3.R8 (404, 401), F3.R11
- **Proves:** F3.AC2 and F3.AC3 (HTTP 400), F3.AC4 (HTTP 409), F3.AC8 (HTTP 409), F3.AC9 (HTTP 404), F3.AC10 (401), F3.AC12 (bodies)
- **Depends on:** F3.T3, F1.T9, F1.T10 (app and guard), F2.T4 (router mounting)
- **Files:** `app/api/src/http/routes/people.ts`, `app/api/src/http/routes/people.test.ts`, `app/api/src/http/app.ts`, `app/api/src/index.ts`, `docs/specs/api.md`
- **Steps:**
  1. Handlers `listPeopleHandler`, `addPersonHandler`, `removePersonHandler`. Each runs `apiGuard` first and returns `401` with no data when logged out.
  2. `POST` returns `201` with `{ person }`; `400` with `{ field: 'name', message }` for a bad name; `409` with `{ field: 'name', message }` for a duplicate. `DELETE` returns `204`, `409` with the in-use message when in use, and `404` for a missing or another user's trip or person (same body for both).
  3. Mount `peopleRouter(deps)` in `app.ts` next to the trips router. `index.ts` passes the real stores and clock.
  4. Update `docs/specs/api.md` with the three endpoints and their responses.
- **Tests:** `F3.AC10`: each of the three endpoints with no cookie returns `401` and no people data. `F3.AC2`/`F3.AC3`: bad names return `400` with the field name and no person created (fake service). `F3.AC4`: duplicate returns `409` with the field name. `F3.AC8`: remove when in use returns `409` and the message. `F3.AC9`: another user's trip or a missing person returns `404`, the same body either way. `F3.AC12`: no response body contains `owner_id`. Fakes: fake people service, fake session store, fixed clock, fake response.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; `api.md` lists the three endpoints.
- **Needs person review:** yes (API ownership checks on the new endpoints).
- **Commit:** `F3.T4: Add people API routes`

### F3.T5 — People API client (web)
- **Builds:** F3.R1, F3.R5 (client part)
- **Proves:** supports F3.AC4, F3.AC8, F3.AC9 (client maps the responses)
- **Depends on:** F2.T5 (trips client pattern), F1.T11 (`api/client.ts`), F3.T4 (contract)
- **Files:** `app/web/src/api/people.ts`, `app/web/src/api/people.test.ts`
- **Steps:**
  1. `listPeople(tripId)`, `addPerson(tripId, name)`, `removePerson(tripId, personId)` on F1's client.
  2. `removePerson` maps `404` to `not-found` and `409` to `in-use`. `addPerson` maps `400` and `409` to the `field` and `message` from the body.
- **Tests:** `F3.AC9`: `404` from `removePerson` is returned as `not-found`. `F3.AC8`: `409` from `removePerson` is returned as `in-use` with the message. `F3.AC4`: `409` from `addPerson` gives the field message. `F3.AC10`: `401` is passed up with status 401. Fakes: mocked `fetch`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`.
- **Needs person review:** no
- **Commit:** `F3.T5: Add people API client`

### F3.T6 — People section: list and add
- **Builds:** F3.R1 (UI), F3.R2 (field messages), F3.R3 (field message), F3.R4 (order on screen)
- **Proves:** F3.AC1 (UI), F3.AC2, F3.AC3, F3.AC4 (UI), F3.AC5 (screen order), F3.AC6
- **Depends on:** F3.T5, F2.T6 (copy and list patterns)
- **Files:** `app/web/src/people/personName.ts`, `app/web/src/people/personName.test.ts`, `app/web/src/components/PeopleSection.tsx`, `app/web/src/components/PeopleSection.test.tsx`, `app/web/src/copy.ts`
- **Steps:**
  1. `checkPersonName(raw)`: the same two length rules as the server, for instant feedback. The server stays authoritative.
  2. `PeopleSection`: heading "People", the list in the order returned (a `<ul>`, one `<li>` per person, each with the name and a "Remove" button labelled "Remove {name}"), the empty state with the name field focused, "Loading people…", and "Couldn't load people." with "Try again".
  3. Name field with a visible label. "Add person" button. Enter submits. Errors appear under the field, linked with `aria-describedby`; focus stays on the field. While adding, the button is disabled and shows a busy state. On a server or network error, show "Something went wrong. Please try again." and keep the typed name.
  4. Add the F3 strings to `copy.ts`.
- **Tests:** `personName.test.ts`: `F3.AC2` spaces only rejected, `"  Sam  "` accepted; `F3.AC3` 100 accepted, 101 rejected. `PeopleSection.test.tsx`: `F3.AC1` valid submit calls `addPerson` and shows the new name at the end of the list; `F3.AC2` blank shows "Enter a name." and calls nothing; `F3.AC3` 101 characters shows the length message; `F3.AC4` a `409` shows "Someone with this name is already on this trip." under the field; `F3.AC5` three people render in the given order; `F3.AC6` an empty list shows the empty state with the name field; double-click sends one request; network error keeps the typed name. Fakes: mocked `api/people.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; adding a person in `npm run dev` shows it at the end of the list.
- **Needs person review:** no
- **Commit:** `F3.T6: Add People section with add form`

### F3.T7 — Remove person dialog and notice
- **Builds:** F3.R5 (UI), F3.R6 (UI message)
- **Proves:** F3.AC7 (UI), F3.AC8 (UI), F3.AC9 (UI, person gone)
- **Depends on:** F3.T5, F3.T6
- **Files:** `app/web/src/components/RemovePersonDialog.tsx`, `app/web/src/components/RemovePersonDialog.test.tsx`, `app/web/src/components/PeopleSection.tsx`, `app/web/src/components/PeopleSection.test.tsx`
- **Steps:**
  1. "Remove" on a row opens `RemovePersonDialog`: `role="dialog"`, `aria-modal="true"`, labelled by its title "Remove {name}?". Text "{name} will be taken off this trip." Buttons "Cancel" and "Remove". Focus moves to "Cancel" on open. Escape acts as Cancel. On close without removing, focus returns to that person's "Remove" button.
  2. "Remove" calls `removePerson`. While the request runs, both buttons are disabled. On success, the dialog closes, the person leaves the list, and a `role="status"` notice shows "{name} removed from the trip.".
  3. On `in-use`, the dialog text becomes "{name} is in an expense or payment, so they can't be removed." and only "Cancel" shows. On `not-found` for the person, the dialog closes, the list refreshes, and the notice shows "{name} is no longer on this trip.". On another error, show "Couldn't remove {name}. Please try again." in the dialog and keep the person listed.
- **Tests:** `RemovePersonDialog.test.tsx`: `F3.AC7` dialog names the person; Cancel and Escape close it and make no `removePerson` call; "Remove" calls it once and both buttons are disabled during the call. `F3.AC8` in-use response shows the in-use text and only Cancel. `F3.AC9` not-found shows the "no longer on this trip" notice and the list refreshes. `PeopleSection.test.tsx`: `F3.AC7` the notice "Sam removed from the trip." shows after success and the row is gone. Error message appears and the person stays. Fakes: mocked `api/people.ts`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; remove and cancel behave as the spec's flow in `npm run dev`.
- **Needs person review:** no
- **Commit:** `F3.T7: Add remove person dialog and notice`

### F3.T8 — Trip page: People section replaces the placeholder
- **Builds:** F3.R10
- **Proves:** F3.AC13
- **Depends on:** F3.T6, F3.T7, F2.T8 (trip page)
- **Files:** `app/web/src/pages/TripPage.tsx`, `app/web/src/pages/TripPage.test.tsx`
- **Steps:**
  1. Render `PeopleSection` with the trip ID, in place of the people part of the F2 placeholder.
  2. Change the placeholder text from "People, expenses and balances will appear here." to "Expenses and balances will appear here.". This is the wording the F3 spec requires (F3.R10).
  3. Keep the "Delete trip" button, "Back to trips" link and the F2 not-found state unchanged.
- **Tests:** `F3.AC13`: a found trip shows the People section and the text "Expenses and balances will appear here."; the old placeholder sentence does not appear. The existing F2 page tests still pass, except the one assertion on the old placeholder sentence, which this task updates (see Review checklist). Fakes: mocked `api/trips.ts` and `api/people.ts`, mocked router.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; the trip page shows the People section in `npm run dev`.
- **Needs person review:** yes (changes an existing F2 test assertion, the old placeholder text, because the F3 spec changes that copy).
- **Commit:** `F3.T8: Show People section on the trip page`

## Coverage
| Spec ID | Task(s) | Proven by |
|---|---|---|
| F3.R1 | T3, T4, T5, T6 | Unit (T3, T4); component (T6) |
| F3.R2 | T1, T4, T6 | Unit (T1); API (T4); component (T6) |
| F3.R3 | T1, T2, T3, T6 | Unit (T1, T3); code review (unique index, T2); component (T6) |
| F3.R4 | T2, T3, T6 | Unit (T2, T3); code review (ORDER BY, T2); component (T6) |
| F3.R5 | T3, T5, T7 | Unit (T3); component (T7) |
| F3.R6 | T3, T4, T5, T7 | Unit (T3); API (T4); component (T7) |
| F3.R7 | T2 | Unit (T2, empty hook); code review (F4 and F6 add checks, see Risks) |
| F3.R8 | T2, T3, T4 | Unit (T3, T4); code review (owner filter, T2) |
| F3.R9 | T2 | Code review (cascade, T2) |
| F3.R10 | T8 | Component test |
| F3.R11 | T3, T4 | Unit (T3, T4) |
| F3.AC1 | T3, T6 | Unit (T3); component (T6) |
| F3.AC2 | T1, T4, T6 | Unit (T1); API (T4); component (T6) |
| F3.AC3 | T1, T4, T6 | Unit (T1); API (T4); component (T6) |
| F3.AC4 | T1, T2, T3, T4, T5, T6 | Unit (T1, T2, T3); API (T4); component (T6); code review (unique index, T2) |
| F3.AC5 | T2, T3, T6 | Unit (T2, T3); component (T6) |
| F3.AC6 | T6 | Component test |
| F3.AC7 | T3, T7 | Unit (T3); component (T7) |
| F3.AC8 | T2, T3, T4, T5, T7 | Unit (T2, T3); API (T4); component (T7) |
| F3.AC9 | T2, T3, T4, T5, T7 | Unit (T2, T3, T4); component (T7); code review (owner filter, T2) |
| F3.AC10 | T4, T5 | Unit (T4) |
| F3.AC11 | T2 | Code review (cascade and transaction, T2) |
| F3.AC12 | T3, T4 | Unit (T3, T4) |
| F3.AC13 | T8 | Component test |

## Review checklist
A person checks these in code review, because unit tests can't prove them:
- [ ] `people.trip_id` references `trips(id) ON DELETE CASCADE`, and deleting a trip removes its people (F3.T2, and F2.T2 cascade rule).
- [ ] The unique index on `(trip_id, name_key)` exists in `003-people.sql`, and `insertPerson` maps the violation to `DuplicatePersonError` (F3.T2).
- [ ] Every people query in `repositories/people.ts` has `?` parameters only and filters by `trip_id` (and `id` for find). The owner check happens through the trip (F3.T2, F3.T3).
- [ ] `removePerson` runs the in-use check and the delete inside one transaction (F3.T3).
- [ ] `apiGuard` runs before the service in all three handlers (F3.T4).
- [ ] No response contains `owner_id` or another user's data (F3.T3, F3.T4).
- [ ] The F2 page test's assertion on the old placeholder sentence is replaced, not removed, and the new text matches the F3 spec. A person approves this change to an existing test (F3.T8).
- [ ] Each later feature that refers to people (F4, F6) adds its check to `usageChecks` and a test for it (F3.R7; enforced in F4 and F6 plans).

## Risks
- **F1 and F2 must be built first.** F3 uses F1's guards, migration runner and client, and F2's trips table, trip store and trip page. None of this is committed yet, so F3 starts only after F1.T1–T12 and F2.T1–T9 are committed (on `week-1` or the feature branches).
- **The in-use check is empty until F4 and F6.** Until they add their checks, every person can be removed, so the F3 spec's "cannot be removed" rule is only partly active. The F3 tests use a fake check to prove the behaviour. F4 and F6 must add their checks and tests before the MVP is done.
- **Duplicate check across two rules:** the server (`validatePersonName` and the unique index) and the web form (`checkPersonName`) can drift. The web check is only early feedback.
- **Case folding:** JavaScript `toLowerCase()` is not full Unicode case folding (for example German `ß`). This is a small risk for the MVP and is noted for a later change.
- **Budget ($15, Haiku only):** eight tasks, each one session. Stop and ask if a task runs long.
- **Owner checks cannot be fully unit tested.** The query filter and the cascade are checked in code review only, as the spec's test plan says.

## Open questions
None. The spec has no open questions, and every choice above is a clear best choice that follows the spec.

## Decisions log
- 2026-11-15: Plan created as Draft from the Approved F3 spec (spec version 2026-11-15).
- 2026-11-15: Plan approved by the user, as written (including the T8 change to the placeholder assertion in the F2 test, and the empty in-use check until F4 and F6).
