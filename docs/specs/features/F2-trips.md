# F2 — Trips

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Source: product.md §3 (F2), §2 (Ownership rule), Business rules R8; F1 spec (F1.R9–R11)_

## Summary
A logged-in user can create a trip by giving it a name, see a list of their own trips, open a trip, and delete a trip they no longer need. A trip is the container for everything else in the app: people (F3), expenses (F4), balances (F5) and payments (F6). F2 also proves the privacy promise from F1: a user can never see or change another user's trips.

## User stories
- As a user, I want to create a trip with a name, so that I can start recording a trip's shared costs.
- As a user, I want to see all my trips in one list, newest first, so that I can get back to the one I'm working on.
- As a user, I want to delete a trip, with a warning first, so that I can remove a trip I no longer need without losing one by accident.
- As a user, I want my trips to be visible only to me, so that my spending stays private.

## Scope
**In:**
- Create a trip with a name (F2.R1–R4).
- List the user's own trips (F2.R5–R6).
- A trip page shell that later features fill in (F2.R7).
- Delete a trip, with confirmation, deleting everything in it (F2.R8–R10).
- Ownership on every trip endpoint, and the cross-user acceptance test that F1 deferred to F2 (F2.R11–R12).

**Out:**
- Renaming or editing a trip: not in the MVP (product.md §4 "No editing").
- People, expenses, balances, payments on the trip page: F3, F4, F5, F6.
- Sharing a trip with other users: out of scope (product.md "After the core").
- Paging, search or sorting options on the list: not in F2 (Decisions log).
- Trip dates, descriptions or currency: not in the MVP (product.md §4, Key terms "Trip").
- Login, logout and the login gate: F1.

## User flow & screens
There are no mock screens yet (`docs/design` does not exist). Screen names below are working names.

1. **Trips** screen (where F1 sends the user after login): heading, "New trip" button, and the list of the user's trips, newest first. With no trips, the empty state shows instead of the list.
2. **New trip**: the "New trip" button opens a form with one field, Trip name, and "Create trip" / "Cancel". (Dialog or inline form is the plan's choice.)
   - Valid → trip created → user goes to the new trip's **Trip** page.
   - Invalid → stay on the form, error shown under the field.
3. **Trip** page (opened from a list row or after creating): trip name as the heading, created date, a placeholder where F3–F6 content will go, a "Delete trip" button, and a "Back to trips" link.
4. **Delete trip**: "Delete trip" opens a confirmation dialog.
   - "Cancel" → dialog closes, nothing changes.
   - "Delete trip" → trip and everything in it is deleted → user goes to **Trips** with a notice.
5. **Missing trip** (deleted, never existed, or owned by someone else): **Trip** page shows the not-found state.

## Requirements
- **F2.R1** A trip is created with one input: its name. The trip belongs to the logged-in user who creates it (product.md Key terms "Trip": owned by one user).
- **F2.R2** The trip name is trimmed of spaces at both ends, then must be 1 to 100 characters long, each Unicode code point counting as one character (same counting as F1.R3). Spaces inside the name are kept as typed.
- **F2.R3** Trip names do not have to be unique. One user can have several trips with the same name.
- **F2.R4** After a trip is created, the user is taken to that trip's page.
- **F2.R5** The Trips list shows every trip owned by the logged-in user and no others, with no paging. Each row shows the trip name and its created date, and opens the trip page. Trips are ordered by creation time, newest first; trips created at the same instant are ordered by ID so the order is stable.
- **F2.R6** When the user has no trips, the Trips screen shows an empty state with a way to create the first trip.
- **F2.R7** The trip page shows the trip name, its created date, a placeholder for the content that F3–F6 add, a "Delete trip" button, and a link back to the Trips list.
- **F2.R8** A trip can be deleted only from its trip page, and only after the user confirms in a dialog (product.md R8). The dialog names the trip and says that its people, expenses and payments are deleted too.
- **F2.R9** Deleting a trip deletes the trip and everything in it, people, expenses and payments, in a single transaction (product.md R8; project-rules.md "Writes that change more than one record happen in a single transaction"). Nothing from the trip remains afterwards.
- **F2.R10** After a delete, the user goes to the Trips list, which shows a notice naming the deleted trip.
- **F2.R11** Every trip endpoint uses the F1 shared check (F1.R10, F1.R11): a logged-out request gets `401`; a trip owned by another user gets `404`, exactly as a trip that does not exist. The list query returns only trips whose owner is the logged-in user. This applies to reading, listing and deleting.
- **F2.R12** Opening the trip page or deleting a trip that does not exist, has been deleted, or belongs to another user shows the not-found state. Nothing about the other user's trip is revealed.

## Data & contract
**Schema (new):** `trips` table: `id`, `owner_id` (references `users.id`, required), `name` (trimmed, 1–100 characters), `created_at` (UTC; project-rules.md). Index on `owner_id`.

**Cascade:** the tables F3, F4 and F6 add (people, expenses, expense participants, payments) must reference `trips.id` so that deleting a trip deletes them all (F2.R9). F2 deletes in one transaction; each later spec must keep this true for its own tables.

**API (proposed; the plan may adjust paths and names, but not the behavior below):**

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips` | none | `200` `{ trips: [{ id, name, createdAt }] }`, owner's trips only, newest first | `401` logged out |
| `POST /api/trips` | `{ name }` | `201` `{ trip: { id, name, createdAt } }` | `400` name empty or over 100 characters (with field name); `401` logged out |
| `GET /api/trips/:id` | none | `200` `{ trip: { id, name, createdAt } }` | `401` logged out; `404` missing or another user's trip |
| `DELETE /api/trips/:id` | none | `204` trip and its contents deleted | `401` logged out; `404` missing or another user's trip |

`createdAt` is sent in UTC (ISO 8601). The page shows it as a date in the viewer's local time zone. No response includes `owner_id` or anything about other users.

**Browser storage:** none.

## States & errors
Copy below is final (wording delegated by the user; see Decisions log).

- **Trips, loading:** "Loading trips…"
- **Trips, empty:** "No trips yet. Create your first trip to start tracking shared costs." with a "New trip" button.
- **Trips, list row:** trip name, then "Created 15 Nov 2026" (date in the viewer's local time zone, day, short month, year).
- **Trips, load failed:** "Couldn't load your trips." with a "Try again" button.
- **New trip, name empty or only spaces:** field error. "Enter a trip name."
- **New trip, name over 100 characters:** field error. "Trip name must be 100 characters or fewer."
- **New trip, creating:** "Create trip" is disabled and shows a busy state, so a double-click cannot create two trips.
- **New trip, server or network error:** form-level error. "Something went wrong. Please try again." The typed name is kept.
- **Trip page, loading:** "Loading trip…"
- **Trip page, placeholder (until F3):** "People, expenses and balances will appear here."
- **Trip page, not found:** heading "Trip not found", text "It may have been deleted, or the link is wrong.", and a "Back to trips" link.
- **Delete dialog:** title "Delete “{trip name}”?", text "This deletes the trip and all its people, expenses and payments. This can't be undone.", buttons "Cancel" and "Delete trip".
- **Delete, deleting:** both dialog buttons are disabled while the request runs.
- **Delete, server or network error:** in the dialog. "Couldn't delete the trip. Please try again." The trip is unchanged.
- **Trips, after delete:** notice "Trip “{trip name}” deleted."

## Accessibility
- The Trips list is a list (`<ul>`/`<li>`); each row is one link whose accessible name includes the trip name and created date.
- "New trip" moves focus to the Trip name field. Enter in the field submits. On an error, focus stays on the field and the error is linked with `aria-describedby`.
- The trip page has the trip name as its main heading (`<h1>`).
- The delete dialog is a modal (`role="dialog"`, `aria-modal="true"`, labelled by its title). Focus moves to "Cancel" when it opens, stays inside it while open, and Escape closes it as Cancel. When it closes without deleting, focus returns to "Delete trip".
- "Delete trip" is styled as a destructive action, and the warning does not rely on color alone (the text says what happens).
- The after-delete notice and the load-failed message are announced (`role="status"` and `role="alert"`).
- Text meets WCAG AA contrast (4.5:1). No animation is required; any transition respects `prefers-reduced-motion`.

## Edge cases
- Name `"  Lisbon  "` → saved as `Lisbon` (F2.R2).
- Name of only spaces → rejected as empty (F2.R2).
- Name of exactly 100 characters → accepted; 101 → rejected. Emoji or accented letters count one per code point (F2.R2).
- Two trips named `Ski weekend` → both allowed, told apart by created date (F2.R3).
- Two trips created in the same second → shown in a stable order (F2.R5).
- Created just before midnight UTC → the shown date follows the viewer's local time zone (Data & contract).
- Trip deleted in one browser tab while open in another → the other tab's delete or reload gets `404` and shows not-found (F2.R12).
- Delete clicked twice quickly → buttons are disabled during the request; a second request would get `404` and show not-found, never an error page.
- User B opens `/trips/{id of A's trip}` or calls `GET`/`DELETE` on it → `404`; A's trip is unchanged (F2.R11).
- Session expires (F1.R7) while on a trip page → the next request gets `401` and goes to Log in (F1).
- Many trips (for example 200) → all shown, no paging (F2.R5).
- Trip with people, expenses and payments deleted → none of them remain (F2.R9). Until F3–F6 exist, only the trip row is deleted.

## Acceptance criteria
- **F2.AC1** Given a logged-in user, when they create a trip named `Lisbon`, then a trip owned by them is saved with that name and a UTC created time, and they land on its trip page.
- **F2.AC2** Given the name `"  Lisbon  "`, when the trip is created, then its saved name is `Lisbon`; given a name of only spaces, the request is rejected with "Enter a trip name." and no trip is created.
- **F2.AC3** Given a name of 100 characters, the trip is created; given 101 characters, it is rejected with "Trip name must be 100 characters or fewer." and no trip is created.
- **F2.AC4** Given a user who already has a trip named `Ski weekend`, when they create another `Ski weekend`, then both trips exist.
- **F2.AC5** Given a user with three trips created at different times, when they open the Trips list, then all three show, newest first, each with its name and created date.
- **F2.AC6** Given a user with no trips, when they open the Trips list, then the empty state shows with a "New trip" button.
- **F2.AC7** Given user A with trip T and user B with their own trips, when B lists trips, then T is not in B's list. (Cross-user criterion deferred from F1.)
- **F2.AC8** Given user A's trip T, when user B requests `GET` or `DELETE` on T, then the response is `404`, the same as for a trip ID that does not exist, and T is unchanged. (Cross-user criterion deferred from F1.)
- **F2.AC9** Given a logged-out request to any F2 endpoint, then the response is `401` with no trip data; a logged-out visit to the Trips or trip page redirects to Log in (F1.R9–R10).
- **F2.AC10** Given a trip page, when the user presses "Delete trip", then a dialog names the trip and warns that its people, expenses and payments are deleted; when they press "Cancel" or Escape, the trip still exists.
- **F2.AC11** Given the delete dialog, when the user presses "Delete trip", then the trip and everything in it are deleted in one transaction, and the user lands on the Trips list with "Trip “{trip name}” deleted."
- **F2.AC12** Given a trip ID that does not exist or was deleted, when the user opens its trip page or deletes it, then the not-found state shows and nothing else changes.
- **F2.AC13** Given any F2 response, then it contains no `owner_id` and no data from another user.

## Dependencies
- **Needs F1:** login gate, session and the shared ownership check (F1.R9–R11). F2 is build-order step 2.
- **Completes F1:** F2.AC7 and F2.AC8 prove F1's done-when, "a user cannot see another user's trip" (product.md §3).
- **Used by F3–F6:** they add content to the trip page and new tables under `trips`. Each must cascade on trip delete (F2.R9) and use the shared ownership check.
- **External services:** none.

## Test plan
Unit tests only (project-rules.md). Each test names its AC ID in the test name. Owner filtering in database queries and cascading deletes can't be proven by unit tests, so a person checks them in code review (project-rules.md "Testing").

| AC | How it is proven |
|---|---|
| F2.AC1 | Unit: trip service with a fake store and a fake clock; trip saved with owner, name and UTC time; response targets the trip page. |
| F2.AC2 | Unit: name validation trims and rejects blank names. |
| F2.AC3 | Unit: name validation, 100 accepted, 101 rejected, emoji counted by code point. |
| F2.AC4 | Unit: fake store accepts a second trip with the same name for the same owner. |
| F2.AC5 | Unit: list service with a fake store returns the owner's trips newest first, ties by ID. |
| F2.AC6 | Unit (headless browser component test): Trips screen with an empty list shows the empty state and "New trip". |
| F2.AC7 | Unit: list service passes the current user as owner and a fake store with two users' trips returns only B's. Code review: the real list query filters by `owner_id`. |
| F2.AC8 | Unit: get and delete handlers with the ownership check return `404` for A's trip when B asks, and the fake store is unchanged. Code review: the real queries filter by `owner_id`. |
| F2.AC9 | Unit: each F2 handler with no session returns `401` (uses the F1 guard). |
| F2.AC10 | Unit (headless browser component test): dialog text, Cancel and Escape close it without a delete call. |
| F2.AC11 | Unit: delete service calls the store's delete in one transaction, and the screen shows the notice. Code review: cascade on `trips.id` and the transaction in the real store. |
| F2.AC12 | Unit: get and delete with an unknown ID return `404`; the trip page shows not-found. |
| F2.AC13 | Unit: response builders omit `owner_id`. |

## Open questions
None.

## Decisions log
- 2026-11-15: Trip name rules → 1–100 characters after trimming.
- 2026-11-15: Duplicate trip names for one user → Allowed.
- 2026-11-15: Trip list → Name and created date, newest first.
- 2026-11-15: After creating a trip → Open the new trip's page; F2 builds the trip page shell that F3–F6 fill in.
- 2026-11-15: Delete confirmation → Dialog with "Cancel" and "Delete trip", Cancel focused by default.
- 2026-11-15: Where to delete → Trip page only; afterwards back to the Trips list.
- 2026-11-15: Paging → None; all trips shown.
- 2026-11-15: Message wording → Delegated to Claude, as in F1; final copy written in States & errors.
- 2026-11-15: Spec approved by the user (12 requirements, 13 acceptance criteria, no open questions).
