# Plan F2 — Trips

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Spec: [F2-trips.md](../specs/features/F2-trips.md) · Spec version: 2026-11-15_

## Summary
This plan builds the trips feature: the `trips` table, create, list, get and delete, with every trip endpoint behind the F1 login guard and ownership check. It also builds the Trips list, the New trip form, the trip page shell and the delete dialog in the web app, and the cross-user tests that F1 deferred. It has 9 tasks. Two are marked **Needs person review**: T2 (database migration) and T4 (API ownership and removal of the F1 placeholder route and its test).

F2 builds on F1. Nothing under `app/` exists yet, so F2 can start only after F1's tasks are committed (see Risks).

## Stack and conventions
From `CLAUDE.md` and the F1 plan:
- **Back end:** Node.js (LTS) + TypeScript (`strict`) + Express 5, in `app/api/`. Tests in `app/api/src/**/*.test.ts`. Unit test command: `npm test` (`vitest run`). Type check: `npm run typecheck`.
- **Front end:** React + Vite + TypeScript, in `app/web/`. Tests in `app/web/src/**/*.test.tsx` with jsdom and React Testing Library. Same two commands.
- **Database:** SQLite via `better-sqlite3`, `PRAGMA foreign_keys = ON` (set by F1.T4). Migrations are numbered SQL files run by F1.T4's `migrate.ts`.
- **Logs:** the project logger (`pino`). No `console.*`.
- **Libraries:** none new. F2 uses only what F1 added.

## Choices the spec left to the plan
| Spec ref | Choice | Why / source |
|---|---|---|
| F2.R1, F2.R4 (and "Dialog or inline form" in the flow) | New trip form is inline on the Trips page, opened by the "New trip" button. It is not a dialog. | The spec allows either. Inline needs no second modal, and the spec already requires focus to move to the name field. Delete is the only modal. |
| F2.R5, F2.AC5 | Trip IDs are `INTEGER PRIMARY KEY AUTOINCREMENT`, the same type as `users.id` in F1. Ties at the same `created_at` are ordered by `id`, which follows creation order. | Stack consistency with F1. A stable tie-break needs no extra column. |
| F2.R9 | Created time comes from the injected clock, not a SQL `DEFAULT CURRENT_TIMESTAMP`. | Tests must not use the real clock (CLAUDE.md, project-rules.md). Same approach as F1 sessions. |
| F2.R2 | Trim uses JavaScript `String.prototype.trim()`, then the length is counted with `countCharacters` (code points) from F1.T2. | The spec says "characters" and "same counting as F1.R3". Reusing F1's counter keeps one definition. |
| F2.R11, F2.R12 | The service loads the trip, then calls F1's `ownsTrip(trip, userId)` (F1.T9). A missing trip and another user's trip both give `'not-found'`. The list query also filters by `owner_id`. | Uses the shared check F1 defined for F2–F6, so F2 does not invent a second one. The unit test covers the decision. The query filter is checked in code review. |
| F2.R9 | Delete runs in one transaction: reload the trip, check `ownsTrip`, `DELETE FROM trips WHERE id = ?`. Child rows are removed by `ON DELETE CASCADE` foreign keys, which later features add. | One transaction covers the check and the delete together, so a concurrent change cannot slip between them. Cascades are how F3–F6 stay in step with F2.R9. |
| F2.R2 | Name rules live in one pure function, `validateTripName`, used by the service. The web form repeats the same two checks for instant feedback. The server stays the authority. | Project rules: rules in plain functions. The front end cannot import back-end code, so it has its own small copy. |
| F2 flow, date | The date is formatted with `Intl.DateTimeFormat` (`en-GB`, `day` `month: short` `year`) in the viewer's time zone, with the time zone as a parameter so tests are fixed. | Spec: "Created 15 Nov 2026" in the viewer's local time zone. The parameter keeps the test independent of the machine's zone. |

## Approach
**Back end (`app/api/src/`):**
- `trips/validation.ts`: `validateTripName(raw)` (pure). Returns `{ ok: true, name }` or `{ ok: false, field: 'name', message }`.
- `trips/store.ts`: the store interface the service uses (`insertTrip`, `listTripsByOwner`, `findTrip`, `deleteTrip`, `transaction`). No code here, just the type. The real version is in `db/repositories/trips.ts` (T2).
- `trips/service.ts`: `createTrip`, `listTrips`, `getTrip`, `deleteTrip`. Each takes `{ store, clock }` and the owner ID. Pure functions over the injected store. Returns plain results, not HTTP.
- `trips/views.ts`: `tripView(trip)` returns `{ id, name, createdAt }` only (F2.AC13).
- `http/routes/trips.ts`: four handlers as plain functions over the service, plus `tripsRouter(deps)`. Each handler runs F1's `apiGuard` (F1.T9) first, then the service.
- `http/app.ts` and `index.ts`: mount the trips router in place of the F1 placeholder.

**Front end (`app/web/src/`):**
- `api/trips.ts`: `listTrips`, `createTrip`, `getTrip`, `deleteTrip`, built on F1's `api/client.ts`. Maps `404` to a `not-found` result and `400` to the field error.
- `format/date.ts`: `formatCreatedDate(iso, timeZone?)`. Pure.
- `trips/tripName.ts`: `checkTripName(raw)` for instant form feedback. Pure.
- `pages/Trips.tsx` (replaces the F1 placeholder), `components/TripList.tsx`, `components/NewTripForm.tsx`.
- `pages/TripPage.tsx` (replaces the F1 shell), `components/DeleteTripDialog.tsx`.
- `copy.ts`: the F2 strings from the spec's States & errors section, added next to F1's strings.
- Trips and trip pages are wrapped in F1's `RequireSession` (F1.T12). F2 does not add a second gate.

Reused from F1: `db/open.ts`, `db/migrate.ts`, `logger.ts`, `auth/guards.ts` (`apiGuard`, `ownsTrip`), `auth/validation.ts` (`countCharacters`), `api/client.ts`, `components/RequireSession.tsx`, `copy.ts`.

## Data and API changes
**Table (new, migration `002-trips.sql`)** — the spec's Data & contract section defines `trips`. This plan adds:
- `id INTEGER PRIMARY KEY AUTOINCREMENT`, `owner_id INTEGER NOT NULL REFERENCES users(id)`, `name TEXT NOT NULL`, `created_at TEXT NOT NULL` (UTC ISO 8601).
- Index `trips_owner_id_idx` on `trips(owner_id)`.
- No `UNIQUE` on `(owner_id, name)`, so duplicate names are allowed (F2.R3, F2.AC4).
- No `DEFAULT` for `created_at`; the service always sets it.
- `docs/specs/data-model.md` gets the `trips` table (created by F1.T4; updated in T2).

**Endpoints (new, documented in `docs/specs/api.md` by T4):** the spec's table, unchanged. Paths: `GET /api/trips`, `POST /api/trips`, `GET /api/trips/:id`, `DELETE /api/trips/:id`. Every one returns `401` when logged out (apiGuard). Errors: `400` with `{ field: 'name', message }` for a bad name; `404` for a missing or another user's trip, with the same body either way.

**Page routes (web):** `/trips` (list, replaces placeholder), `/trips/:id` (trip page, replaces shell).

## Tasks
### F2.T1 — Trip name rules
- **Builds:** F2.R2, F2.R1 (name input)
- **Proves:** F2.AC2, F2.AC3
- **Depends on:** F1.T2 (for `countCharacters`; export it from `auth/validation.ts` if it is not already exported)
- **Files:** `app/api/src/trips/validation.ts`, `app/api/src/trips/validation.test.ts`
- **Steps:**
  1. `validateTripName(raw)`: `trim()`, then count code points. Reject 0 with "Enter a trip name."; reject over 100 with "Trip name must be 100 characters or fewer."
  2. Return `{ ok: true, name }` with the trimmed name, or `{ ok: false, field: 'name', message }`.
- **Tests:** `F2.AC2` `"  Lisbon  "` saves as `Lisbon`; `"   "` is rejected with the empty message. `F2.AC3` 100 characters accepted, 101 rejected with the length message; 100 emoji accepted and 101 rejected (one per code point). Fakes: none needed (pure).
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`.
- **Needs person review:** no
- **Commit:** `F2.T1: Add trip name rules`

### F2.T2 — Trips migration and repository
- **Builds:** F2.R3, F2.R9 (cascade base), F2.R11 (owner filter in queries)
- **Proves:** none directly. Supports F2.AC4, F2.AC5, F2.AC7, F2.AC8 and F2.AC11 (code review of the real queries and cascade).
- **Depends on:** F1.T4
- **Files:** `app/api/src/db/migrations/002-trips.sql`, `app/api/src/db/repositories/trips.ts`, `app/api/src/db/repositories/trips.test.ts`, `docs/specs/data-model.md`
- **Steps:**
  1. `002-trips.sql`: create `trips` with the columns above, and the `owner_id` index. No unique constraint on name.
  2. `repositories/trips.ts` with a `Db` interface, `?` placeholders only: `insertTrip(db, { ownerId, name, createdAt })` returns the new ID; `listTripsByOwner(db, ownerId)` with `WHERE owner_id = ? ORDER BY created_at DESC, id DESC`; `findTripForOwner(db, id, ownerId)` with `WHERE id = ? AND owner_id = ?`; `deleteTripById(db, id)`.
  3. Update `docs/specs/data-model.md` with the `trips` table and the rule that every child table added later cascades on `trips.id`.
- **Tests:** With a fake `Db` that records SQL and parameters: each function uses `?` placeholders and passes values as parameters (no string joining); `listTripsByOwner` sends the owner as a parameter and has the `ORDER BY created_at DESC, id DESC` clause; `findTripForOwner` sends both ID and owner. Names: `F2.AC7` and `F2.AC8` for the owner parameter checks. `F2.AC4`: the insert has no uniqueness check, which is checked by code review. Fakes: fake `Db`. No SQLite file in unit tests.
- **Done when:** `npm test` and `npm run typecheck` pass; `data-model.md` matches the migration.
- **Needs person review:** yes (database migration; the owner filter, cascade and missing unique constraint are checked in review).
- **Commit:** `F2.T2: Add trips schema and repository`

### F2.T3 — Trip service and views
- **Builds:** F2.R1, F2.R3, F2.R4, F2.R5, F2.R9, F2.R11 (service part), F2.R12 (service part)
- **Proves:** F2.AC1, F2.AC4, F2.AC5, F2.AC7, F2.AC8, F2.AC11, F2.AC12, F2.AC13
- **Depends on:** F2.T1, F2.T2, F1.T9
- **Files:** `app/api/src/trips/store.ts`, `app/api/src/trips/service.ts`, `app/api/src/trips/service.test.ts`, `app/api/src/trips/views.ts`, `app/api/src/trips/views.test.ts`
- **Steps:**
  1. `store.ts`: the interface the service uses (`insertTrip`, `listTripsByOwner`, `findTrip`, `deleteTrip`, `transaction`), matching the T2 repository.
  2. `createTrip({ ownerId, rawName }, { store, clock })`: validate (T1). On success, insert with `createdAt = clock.now()` in UTC ISO. Return `{ ok: true, trip }` (the trip page target is the trip ID).
  3. `listTrips({ ownerId }, { store })`: the store's owner-only list, then a pure `sortTripsNewestFirst` that orders by `createdAt` descending and `id` descending. Sorting in the service makes the order testable with a fake store.
  4. `getTrip({ ownerId, tripId }, { store })` and `deleteTrip({ ownerId, tripId }, { store })`: find the trip; `ownsTrip(trip, ownerId)` (F1.T9); `'not-found'` when missing or not owned. Delete wraps its reload, check and delete in `store.transaction`.
  5. `views.ts`: `tripView(trip)` returns `{ id, name, createdAt }` and nothing else.
- **Tests:** `F2.AC1` with fake store and fixed clock: trip saved with the owner, the trimmed name and the UTC created time; the result points at the trip. `F2.AC4`: a fake store accepts a second `Ski weekend` for the same owner. `F2.AC5`: three trips at different times are returned newest first; two with the same time are ordered by ID. `F2.AC7`: the fake store holds trips for users A and B; listing as B returns only B's. `F2.AC8`: getting or deleting A's trip as B returns `not-found`, and the fake store is unchanged. `F2.AC11`: delete calls the store's `transaction` once and the delete inside it. `F2.AC12`: unknown ID returns `not-found`; a deleted trip is `not-found` on the second call. `F2.AC13`: `tripView` output has no `owner_id`. Fakes: in-memory trip store with a `transaction` that records calls, fixed clock, fixed IDs.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; no test calls the real clock.
- **Needs person review:** no
- **Commit:** `F2.T3: Add trip service and views`

### F2.T4 — Trip API routes, wiring, and removal of the F1 placeholder
- **Builds:** F2.R1, F2.R5, F2.R8 (API part), F2.R11, F2.R12 (404 body)
- **Proves:** F2.AC9 (API), F2.AC8 (HTTP 404), F2.AC12 (HTTP 404), F2.AC13 (response bodies), F2.AC1 (201 response), F1.AC10 (moved from the placeholder test)
- **Depends on:** F2.T3, F1.T9, F1.T10
- **Files:** `app/api/src/http/routes/trips.ts`, `app/api/src/http/routes/trips.test.ts`, `app/api/src/http/app.ts`, `app/api/src/index.ts`, `app/api/src/http/routes/trips-placeholder.ts` (deleted), `app/api/src/http/routes/trips-placeholder.test.ts` (deleted), `docs/specs/api.md`
- **Steps:**
  1. Handlers `listTripsHandler`, `createTripHandler`, `getTripHandler`, `deleteTripHandler`. Each runs `apiGuard` first and returns `401` with no data when logged out.
  2. `POST` returns `201` with `{ trip }` on success, `400` with `{ field: 'name', message }` for a bad name. `GET /:id` returns `200` `{ trip }`. `DELETE /:id` returns `204`. Missing or other-user trips return `404` with the same body for both.
  3. Mount the router in `app.ts` (in place of the placeholder). `index.ts` passes the real store and clock.
  4. Delete `trips-placeholder.ts` and its test. The F1.AC10 assertion (no cookie → `401`, no data) moves unchanged into `trips.test.ts`, under the same AC ID.
  5. Update `docs/specs/api.md` with the four endpoints and their responses.
- **Tests:** `F2.AC9`: each of the four endpoints with no cookie returns `401` and no trip data (also `F1.AC10`). `F2.AC1`: `POST` with a valid name returns `201` and a `Set-Cookie`-free body with `trip`. `F2.AC2`/`F2.AC3`: bad names return `400` with the field name and no trip created (fake service). `F2.AC8`: `GET` and `DELETE` of another user's trip return `404`, the same body as an unknown ID. `F2.AC12`: unknown ID on `GET` and `DELETE` returns `404`. `F2.AC13`: no response body contains `owner_id`. Fakes: fake trip service, fake session store, fixed clock, fake response.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; `api.md` lists the four endpoints; no file named `trips-placeholder*` remains.
- **Needs person review:** yes (API ownership checks; deletes the F1 placeholder test file, and its F1.AC10 assertion moves to `trips.test.ts`).
- **Commit:** `F2.T4: Add trip API routes and remove placeholder`

### F2.T5 — Trip API client (web)
- **Builds:** F2.R5 (client), F2.R11 (client handles `401` through F1's client)
- **Proves:** supports F2.AC9 and F2.AC12 (client maps the responses)
- **Depends on:** F1.T11 (`api/client.ts`), F2.T4 (contract)
- **Files:** `app/web/src/api/trips.ts`, `app/web/src/api/trips.test.ts`
- **Steps:**
  1. `listTrips()`, `createTrip(name)`, `getTrip(id)`, `deleteTrip(id)` on F1's client. Each returns the parsed body or throws `ApiError` with status.
  2. `getTrip` and `deleteTrip` map `404` to a result the screens can show as "Trip not found"; `createTrip` maps `400` to the `field` and `message` from the body.
- **Tests:** `F2.AC12`: `404` from `getTrip` and `deleteTrip` is returned as `not-found`. `F2.AC2`/`F2.AC3`: `400` from `createTrip` gives the field message. `F2.AC9`: `401` is passed up as an error with status 401 (the gate handles the redirect). Fakes: mocked `fetch`.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`.
- **Needs person review:** no
- **Commit:** `F2.T5: Add trip API client`

### F2.T6 — Trips list screen
- **Builds:** F2.R5 (screen), F2.R6, F2.R5 date display
- **Proves:** F2.AC5 (screen order), F2.AC6, F2.AC9 (page is behind the gate)
- **Depends on:** F2.T5, F1.T12
- **Files:** `app/web/src/format/date.ts`, `app/web/src/format/date.test.ts`, `app/web/src/pages/Trips.tsx`, `app/web/src/pages/Trips.test.tsx`, `app/web/src/components/TripList.tsx`, `app/web/src/copy.ts`, `app/web/src/App.tsx`
- **Steps:**
  1. `formatCreatedDate(iso, timeZone?)`: `Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone })`. Omitting `timeZone` uses the viewer's zone.
  2. `Trips.tsx` (replaces the F1 placeholder): heading, "Loading trips…", the empty state with its text and a "New trip" button (the button is wired in T7), the list, and "Couldn't load your trips." with "Try again" on failure. Wrap the page in `RequireSession`.
  3. `TripList.tsx`: a `<ul>` with one `<li>` per trip. Each row is one link to `/trips/:id`, with an accessible name that includes the trip name and created date. Rows are shown in the order the service returned.
  4. Add the F2 strings to `copy.ts`.
- **Tests:** `date.test.ts` (F2.R5): `2026-11-15T23:30:00Z` formats as `15 Nov 2026` in `UTC` and as `16 Nov 2026` in `Asia/Tokyo`, so the zone parameter is honoured. `Trips.test.tsx`: `F2.AC5` three trips render in the given order, each with name and date; `F2.AC6` an empty list shows the empty text and "New trip"; load failure shows the alert with "Try again"; `F2.AC9` a `401` from the list redirects to Log in (`RequireSession`). Fakes: mocked `api/trips.ts`, mocked router.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; the Trips screen renders in `npm run dev`.
- **Needs person review:** no
- **Commit:** `F2.T6: Add Trips list screen`

### F2.T7 — New trip form
- **Builds:** F2.R1 (UI), F2.R2 (field messages), F2.R3 (no duplicate check in UI), F2.R4 (navigation)
- **Proves:** F2.AC1 (UI lands on trip page), F2.AC2 and F2.AC3 (messages), F2.AC4 (duplicates allowed in UI)
- **Depends on:** F2.T5, F2.T6
- **Files:** `app/web/src/trips/tripName.ts`, `app/web/src/trips/tripName.test.ts`, `app/web/src/components/NewTripForm.tsx`, `app/web/src/components/NewTripForm.test.tsx`, `app/web/src/pages/Trips.tsx`
- **Steps:**
  1. `checkTripName(raw)`: the same two rules as the server, for instant feedback. The server stays authoritative.
  2. `NewTripForm`: one labelled field "Trip name", "Create trip" and "Cancel". Opened by "New trip"; focus moves to the field. Enter submits. Errors appear under the field, linked with `aria-describedby`; focus stays on the field.
  3. While creating, "Create trip" is disabled and shows a busy state. On success, navigate to `/trips/:id`. On a server or network error, show "Something went wrong. Please try again." and keep the typed name.
- **Tests:** `tripName.test.ts`: `F2.AC2` spaces only rejected, `"  Lisbon  "` accepted; `F2.AC3` 100 accepted, 101 rejected. `NewTripForm.test.tsx`: `F2.AC1` valid submit calls `createTrip` and navigates to the new trip's page; `F2.AC2` blank shows "Enter a trip name." and calls nothing; `F2.AC3` 101 characters shows the length message; `F2.AC4` two submits of `Ski weekend` both reach the API (no duplicate block); double-click sends one request; network error keeps the typed name. Fakes: mocked `api/trips.ts`, mocked router.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; creating a trip in `npm run dev` lands on its page.
- **Needs person review:** no
- **Commit:** `F2.T7: Add New trip form`

### F2.T8 — Trip page shell and not-found state
- **Builds:** F2.R7, F2.R12 (UI)
- **Proves:** F2.AC12 (UI not-found), F2.AC9 (page is behind the gate)
- **Depends on:** F2.T5, F1.T12
- **Files:** `app/web/src/pages/TripPage.tsx`, `app/web/src/pages/TripPage.test.tsx`
- **Steps:**
  1. Replace the F1 shell. Load the trip with `getTrip`. While loading, show "Loading trip…".
  2. Show the trip name as the `<h1>`, the created date (`formatCreatedDate`), the placeholder "People, expenses and balances will appear here.", a "Delete trip" button (wired in T9), and a "Back to trips" link.
  3. On `not-found`, show "Trip not found", "It may have been deleted, or the link is wrong.", and a "Back to trips" link. Nothing else is shown.
  4. Wrap the page in `RequireSession`.
- **Tests:** `F2.AC12`: a `not-found` response shows the not-found heading, text and link, and no trip data. `F2.R7`: a found trip shows name as `h1`, date, placeholder text, "Delete trip" and "Back to trips". `F2.AC9`: a `401` redirects to Log in. Fakes: mocked `api/trips.ts`, mocked router.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; a missing trip ID shows the not-found state in `npm run dev`.
- **Needs person review:** no
- **Commit:** `F2.T8: Add trip page shell and not-found state`

### F2.T9 — Delete trip dialog and notice
- **Builds:** F2.R8, F2.R10, F2.R12 (delete of a missing trip)
- **Proves:** F2.AC10, F2.AC11 (UI), F2.AC12 (delete of a missing trip)
- **Depends on:** F2.T5, F2.T6, F2.T8
- **Files:** `app/web/src/components/DeleteTripDialog.tsx`, `app/web/src/components/DeleteTripDialog.test.tsx`, `app/web/src/pages/TripPage.tsx`, `app/web/src/pages/Trips.tsx`, `app/web/src/pages/Trips.test.tsx`
- **Steps:**
  1. "Delete trip" opens a `role="dialog"` with `aria-modal="true"`, labelled by its title "Delete “{trip name}”?". Text: "This deletes the trip and all its people, expenses and payments. This can't be undone." Buttons: "Cancel" and "Delete trip".
  2. Focus moves to "Cancel" on open. Tab stays between the two buttons. Escape acts as Cancel. On close without deleting, focus returns to "Delete trip".
  3. "Delete trip" calls `deleteTrip`. While the request runs, both buttons are disabled. On success, navigate to `/trips` with state holding the deleted name; `Trips.tsx` shows the notice "Trip “{trip name}” deleted." in a `role="status"` element. On `not-found`, show the not-found state (T8). On another error, show "Couldn't delete the trip. Please try again." in the dialog and leave the trip unchanged.
- **Tests:** `F2.AC10`: the dialog names the trip and warns; Cancel and Escape close it and make no delete call. `F2.AC11`: confirming calls `deleteTrip` once, navigates to Trips and the notice shows the trip name; both buttons are disabled during the call. `F2.AC12`: deleting a missing trip shows the not-found state, and no error page. Error message shows in the dialog and no navigation happens. Fakes: mocked `api/trips.ts`, mocked router, fake timers are not needed (the mock resolves on demand).
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; delete and cancel behave as the spec's flow in `npm run dev`.
- **Needs person review:** no
- **Commit:** `F2.T9: Add delete trip dialog and notice`

## Coverage
| Spec ID | Task(s) | Proven by |
|---|---|---|
| F2.R1 | T3, T4, T7 | Unit (T3, T4); component (T7) |
| F2.R2 | T1, T4, T7 | Unit (T1); API (T4); component (T7) |
| F2.R3 | T2, T3, T7 | Unit (T3); code review (no unique constraint, T2) |
| F2.R4 | T7 | Component test |
| F2.R5 | T2, T3, T5, T6 | Unit (T3, T6); code review (ORDER BY, T2) |
| F2.R6 | T6 | Component test |
| F2.R7 | T8 | Component test |
| F2.R8 | T9 | Component test; API (T4) |
| F2.R9 | T2, T3 | Unit (transaction, T3); code review (cascade, T2) |
| F2.R10 | T9 | Component test |
| F2.R11 | T2, T3, T4 | Unit (T3, T4); code review (owner filter, T2) |
| F2.R12 | T3, T4, T5, T8, T9 | Unit (T3, T4); component (T8, T9) |
| F2.AC1 | T3, T4, T7 | Unit (T3, T4); component (T7) |
| F2.AC2 | T1, T4, T5, T7 | Unit (T1); API (T4); component (T7) |
| F2.AC3 | T1, T4, T7 | Unit (T1); API (T4); component (T7) |
| F2.AC4 | T2, T3, T7 | Unit (T3, T7); code review (no unique constraint, T2) |
| F2.AC5 | T3, T6 | Unit (T3); component (T6) |
| F2.AC6 | T6 | Component test |
| F2.AC7 | T2, T3 | Unit (T2, T3); code review (owner filter, T2) |
| F2.AC8 | T2, T3, T4 | Unit (T2, T3, T4); code review (owner filter, T2) |
| F2.AC9 | T4, T6, T8 | Unit (T4); component (T6, T8) |
| F2.AC10 | T9 | Component test |
| F2.AC11 | T3, T9 | Unit (T3); component (T9); code review (cascade, T2) |
| F2.AC12 | T3, T4, T5, T8, T9 | Unit (T3, T4); component (T8, T9) |
| F2.AC13 | T3, T4 | Unit (T3, T4) |

Also covered: F1.AC10 (no cookie → `401`) is moved from the placeholder test into `trips.test.ts` in T4 (see Review checklist).

## Review checklist
A person checks these in code review, because unit tests can't prove them:
- [ ] `trips` has no unique constraint on `(owner_id, name)`, and `002-trips.sql` runs in one migration transaction (F2.T2).
- [ ] Every trip query in `repositories/trips.ts` has `owner_id = ?` (for list and find) and uses `?` parameters only (F2.T2).
- [ ] The list query orders by `created_at DESC, id DESC` (F2.T2).
- [ ] Every child table added by F3–F6 has a foreign key to `trips.id` with `ON DELETE CASCADE` (F2.T2, F2.T3).
- [ ] `deleteTrip` runs its reload, owner check and delete inside one transaction (F2.T3).
- [ ] `apiGuard` runs before the service in all four handlers (F2.T4).
- [ ] The F1.AC10 assertion moved from `trips-placeholder.test.ts` (deleted) into `trips.test.ts` unchanged (F2.T4). This is a test removal, so a person approves it.
- [ ] No response contains `owner_id` or another user's data (F2.T3, F2.T4).

## Risks
- **F1 must be built first.** F2 uses F1's migration runner, guards, client and `RequireSession`. Nothing under `app/` exists yet, so F2 starts only after F1.T1–T12 are committed on `week-1` or the feature branch `F2-trips`.
- **Test removal in T4:** deleting `trips-placeholder.test.ts` removes a test file. The plan keeps its assertion unchanged, but project-rules.md still requires a person to approve the removal. If the person says no, T4 keeps the file and points it at the real router instead.
- **Owner checks cannot be fully unit tested.** The query filter and the cascade are checked in code review only. The spec's test plan says the same.
- **Budget ($15, Haiku only):** nine tasks, each one session. Stop and ask if a task runs long.
- **Name rules in two places:** the server (`validateTripName`) and the web form (`checkTripName`) can drift. The web check only gives early feedback; the server result is what the user sees after a save. A later change should update both.
- **Date display:** the `en-GB` format and the zone depend on the runtime's `Intl` data. The test uses explicit zones to avoid depending on the machine.

## Open questions
None. The spec has no open questions, and every choice above is a clear best choice that follows the spec.

## Decisions log
- 2026-11-15: Plan created as Draft from the Approved F2 spec (spec version 2026-11-15).
- 2026-11-15: Plan approved by the user. This includes the T4 removal of `trips-placeholder.test.ts`, with its F1.AC10 assertion moved unchanged into `trips.test.ts`; the user approved the plan as written.
