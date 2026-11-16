# F3 — People

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Source: product.md §2 (Roles, People on a trip are names only), §3 (F3), §4 (No editing), Key terms "Person", Business rules R3 and R7; F2 spec (F2.R9, F2.R11–R12)_

## Summary
A user can add people to one of their trips by name and remove a person who was added by mistake. People are the names that expenses and payments refer to (F4, F6), so they must stay stable: a person who is part of any expense or payment cannot be removed. People have no accounts and are names only. F3 also fills in the people part of the trip page that F2 left as a placeholder.

## User stories
- As a user, I want to add each person on a trip by name, so that I can later record who paid and who shares each cost.
- As a user, I want to remove a person I added by mistake, so that the trip's list of people stays correct.
- As a user, I want to be stopped from removing someone who is already in an expense or payment, so that the balances never lose a person who owes or is owed money.

## Scope
**In:**
- Add a person to a trip by one name (F3.R1–R3).
- List the people on a trip in the order they were added (F3.R4).
- Remove a person, with confirmation, unless they are in use (F3.R5–R7).
- The people section of the trip page, replacing the people part of the F2 placeholder (F3.R10).
- Ownership on every people endpoint, and cascade on trip delete (F3.R8–R9).

**Out:**
- Editing or renaming a person: not in the MVP (product.md §4 "No editing"). A mistake is fixed by removing and adding again.
- Person accounts, invitations, or linking a person to a user: people are names only (product.md §2).
- Expenses and payments that use people: F4 and F6. F3 only defines the "in use" check that they extend (F3.R7).
- Balances: F5.
- A limit on the number of people: none (Decisions log).
- Adding several people at once: not in F3 (Decisions log).

## User flow & screens
There are no mock screens yet (`docs/design` does not exist). Screen names below are working names.

1. **Trip** page (from F2), **People** section. Shows the list of people in the order added. With no people, the empty state shows instead of the list. A name field with an "Add person" button sits above or beside the list (layout is the plan's choice).
   - Valid name → person added → the new person appears at the end of the list; the field clears.
   - Invalid name → stay in the field, error shown under the field, typed text kept.
2. **Remove person**: each person in the list has a "Remove" button. It opens a confirmation dialog.
   - "Cancel" or Escape → dialog closes, nothing changes.
   - "Remove" → person removed → the list updates and a notice names the person.
   - If the person is in an expense or payment → the dialog shows why they cannot be removed, with only "Cancel".
3. **Missing trip** (deleted, never existed, or owned by someone else): the Trip page shows the F2 not-found state, as F2.R12 requires. Nothing from the trip is shown.

## Requirements
- **F3.R1** A person is added to a trip with one input: their name. Only the owner of the trip can add people to it (F1 ownership rule, product.md §2).
- **F3.R2** The name is trimmed of spaces at both ends, then must be 1 to 100 characters long, each Unicode code point counting as one character (same counting as F2.R2). Spaces inside the name are kept as typed.
- **F3.R3** Names are unique within a trip, ignoring letter case: after trimming, `Sam` and `sam` on the same trip are the same name, so the second is rejected. The same name may be used on different trips (product.md Key terms "Person": unique within that trip).
- **F3.R4** People are listed in the order they were added to the trip, earliest first; people added at the same instant are ordered by ID so the order is stable. This order is also the order R3 of product.md uses for leftover cents, so it must be stored, not sorted by name.
- **F3.R5** A person is removed only from the trip page, and only after the user confirms in a dialog. The dialog names the person and says they will be taken off the trip.
- **F3.R6** A person cannot be removed while they are in any expense or payment (product.md R7). If they are, the request is refused and nothing changes.
- **F3.R7** F3 defines one "is this person in use?" check, used before any removal. Until F4 (expenses) and F6 (payments) exist, the check reports that no person is in use. F4 and F6 must extend it to cover their tables, and each of their specs must test that a person in their table cannot be removed.
- **F3.R8** Every people endpoint uses the F1 shared check (F1.R10, F1.R11) on the trip: a logged-out request gets `401`; a trip owned by another user gets `404`, exactly as a trip that does not exist. A person ID that does not exist on that trip, or belongs to another trip, gets `404`. The people list and the add and remove writes only touch people on the trip the user owns.
- **F3.R9** A person belongs to one trip. Deleting a trip deletes its people in the same transaction (F2.R9, product.md R8). Nothing from the trip remains afterwards.
- **F3.R10** The trip page's people section replaces the people part of the F2 placeholder. The expense and balance parts of the placeholder stay until F4 and F5.
- **F3.R11** The people list and the responses contain only the person's ID and name, and the trip's ID where needed. They contain no `owner_id` and no data about other users (same rule as F2.R11, F2.AC13).

## Data & contract
**Schema (new):** `people` table: `id`, `trip_id` (references `trips.id`, required, deleted with the trip), `name` (trimmed, 1–100 characters), `created_at` (UTC; project-rules.md). Uniqueness of `name` within `trip_id` ignoring letter case is enforced by the database (F3.R3). Index on `trip_id`. The table has no `owner_id`: ownership is checked through the trip, as in F2.

**Cascade:** `people.trip_id` cascades from `trips.id`, so trip delete removes people (F3.R9). F3 deletes nothing else. F4 and F6 tables must reference `trips.id` and the person they use with the same cascade rule (F2 "Cascade").

**API (proposed; the plan may adjust paths and names, but not the behavior below):**

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/:id/people` | none | `200` `{ people: [{ id, name }] }`, in the order added | `401` logged out; `404` trip missing or another user's |
| `POST /api/trips/:id/people` | `{ name }` | `201` `{ person: { id, name } }` | `400` name empty or over 100 characters (with field name); `409` name already on this trip (with field name); `401` logged out; `404` trip missing or another user's |
| `DELETE /api/trips/:id/people/:personId` | none | `204` person removed | `401` logged out; `404` trip or person missing, or another user's trip; `409` person is in an expense or payment (F3.R6) |

## States & errors
Copy below is proposed and needs the user's confirmation (see Open questions).

- **People, loading:** "Loading people…"
- **People, empty:** "No people yet. Add the people on this trip to start splitting costs." with the name field focused.
- **People, list row:** the person's name, then a "Remove" button labelled for that person (for example "Remove Sam").
- **People, load failed:** "Couldn't load people." with a "Try again" button.
- **Add, name empty or only spaces:** field error. "Enter a name."
- **Add, name over 100 characters:** field error. "Name must be 100 characters or fewer."
- **Add, name already on this trip:** field error. "Someone with this name is already on this trip."
- **Add, adding:** "Add person" is disabled and shows a busy state, so a double-click cannot add two people.
- **Add, server or network error:** form-level error. "Something went wrong. Please try again." The typed name is kept.
- **Remove dialog:** title "Remove {name}?", text "{name} will be taken off this trip.", buttons "Cancel" and "Remove".
- **Remove, in use:** the dialog text changes to "{name} is in an expense or payment, so they can't be removed." Only "Cancel" is shown.
- **Remove, removing:** both dialog buttons are disabled while the request runs.
- **Remove, server or network error:** in the dialog. "Couldn't remove {name}. Please try again." The person stays on the trip.
- **Remove, person already gone** (removed in another tab, or the trip was deleted): the dialog closes, the list refreshes, and the notice says "{name} is no longer on this trip." If the whole trip is gone, the Trip page shows the F2 not-found state instead.
- **People, after remove:** notice "{name} removed from the trip."

## Accessibility
- The people list is a list (`<ul>`/`<li>`). Each "Remove" button has an accessible name that includes the person's name.
- The name field has a visible label. Enter in the field submits. On an error, focus stays on the field and the error is linked with `aria-describedby`.
- "Add person" is reached by keyboard in the normal tab order, after the field.
- The remove dialog is a modal (`role="dialog"`, `aria-modal="true"`, labelled by its title). Focus moves to "Cancel" when it opens, stays inside it while open, and Escape closes it as Cancel. When it closes without removing, focus returns to the "Remove" button of that person.
- "Remove" is styled as a destructive action, and the warning does not rely on color alone (the text says what happens).
- The added and removed notices and the load-failed message are announced (`role="status"` and `role="alert"`).
- Text meets WCAG AA contrast (4.5:1). No animation is required; any transition respects `prefers-reduced-motion`.

## Edge cases
- Name `"  Sam  "` → saved as `Sam` (F3.R2).
- Name of only spaces → rejected as empty (F3.R2).
- Name of exactly 100 characters → accepted; 101 → rejected. Emoji or accented letters count one per code point (F3.R2).
- `sam` added when `Sam` is on the same trip → rejected (F3.R3). `Sam` added to a second trip → allowed.
- Two people added in the same second → shown in a stable order (F3.R4).
- Person removed in one tab while the trip is open in another → the other tab's remove gets `404` and shows the "no longer on this trip" notice (F3 States).
- Remove clicked twice quickly → buttons are disabled during the request; a second request gets `404` and shows the notice, never an error page.
- User B calls any people endpoint on user A's trip → `404`; A's trip is unchanged (F3.R8).
- Session expires while on the Trip page → the next request gets `401` and goes to Log in (F1).
- Trip deleted while people are on it → all its people are deleted with it (F3.R9).
- Person in an expense or payment → removal refused with `409` (F3.R6). Until F4 and F6 exist, every person is removable.
- Many people (for example 200) → all shown, no paging (no limit set in Decisions log).

## Acceptance criteria
- **F3.AC1** Given the owner of a trip, when they add a person named `Sam`, then a person named `Sam` is saved on that trip and appears at the end of the list.
- **F3.AC2** Given the name `"  Sam  "`, when the person is added, then the saved name is `Sam`; given a name of only spaces, the request is rejected with "Enter a name." and no person is added.
- **F3.AC3** Given a name of 100 characters, the person is added; given 101 characters, it is rejected with "Name must be 100 characters or fewer." and no person is added.
- **F3.AC4** Given a trip with `Sam`, when `sam` is added to the same trip, then it is rejected with "Someone with this name is already on this trip." and no person is added; when `Sam` is added to a different trip, it is accepted.
- **F3.AC5** Given a trip with three people added at different times, when the people list is shown, then they are listed in the order they were added.
- **F3.AC6** Given a trip with no people, when the people section is shown, then the empty state shows with the name field.
- **F3.AC7** Given a person who is in no expense or payment, when the user presses "Remove" and then "Remove" in the dialog, then the person is removed and the notice "Sam removed from the trip." shows; when they press "Cancel" or Escape, the person stays.
- **F3.AC8** Given a person who is in an expense or payment, when the user tries to remove them, then the request is refused with `409`, the dialog says they can't be removed, and nothing changes.
- **F3.AC9** Given user A's trip T with people and user B with their own trips, when B lists, adds or removes people on T, then the response is `404`, the same as for a trip that does not exist, and T is unchanged.
- **F3.AC10** Given a logged-out request to any F3 endpoint, then the response is `401` with no people data.
- **F3.AC11** Given a trip that is deleted, then its people are deleted with it in the same transaction, and none remain.
- **F3.AC12** Given any F3 response, then it contains no `owner_id` and no data from another user.
- **F3.AC13** Given a trip page, when the people section is shown, then it replaces the people part of the F2 placeholder, and the expense and balance placeholder text stays.

## Dependencies
- **Needs F1:** login gate, session and the shared ownership check (F1.R9–R11).
- **Needs F2:** trips, the trip page shell, and the trip delete that must cascade to people (F2.R7, F2.R9). F3 is build-order step 3.
- **Used by F4 and F6:** they reference people, extend the in-use check (F3.R7), and must keep the cascade rule for their own tables.
- **Used by F5:** balances use the people and their order (product.md R3, R4).
- **External services:** none.

## Test plan
Unit tests only (project-rules.md). Each test names its AC ID in the test name. Owner filtering in database queries, the uniqueness constraint in the database, and cascading deletes can't be proven by unit tests, so a person checks them in code review (project-rules.md "Testing").

| AC | How it is proven |
|---|---|
| F3.AC1 | Unit: add-person service with a fake store and a fake clock; person saved with trip, name and UTC time. |
| F3.AC2 | Unit: name validation trims and rejects blank names. |
| F3.AC3 | Unit: name validation, 100 accepted, 101 rejected, emoji counted by code point. |
| F3.AC4 | Unit: fake store rejects a case-insensitive duplicate on the same trip and accepts the same name on another trip. Code review: the database unique rule on `(trip_id, name ignoring case)`. |
| F3.AC5 | Unit: list service with a fake store returns people in added order, ties by ID. |
| F3.AC6 | Unit (headless browser component test): People section with an empty list shows the empty state and the name field. |
| F3.AC7 | Unit: remove service with a fake in-use check returning false removes the person; the dialog's Cancel and Escape make no delete call (headless browser component test). |
| F3.AC8 | Unit: remove service with a fake in-use check returning true returns `409` and the fake store is unchanged; the dialog shows the in-use text. |
| F3.AC9 | Unit: each people handler with the ownership check returns `404` for user B on A's trip, and the fake store is unchanged. Code review: the real queries join to `trips` and filter by `owner_id`. |
| F3.AC10 | Unit: each F3 handler with no session returns `401` (uses the F1 guard). |
| F3.AC11 | Code review: `people.trip_id` cascades from `trips.id`, and the trip delete runs in one transaction in the real store. |
| F3.AC12 | Unit: response builders omit `owner_id`. |
| F3.AC13 | Unit (headless browser component test): trip page shows the people section and keeps the expense and balance placeholder text. |

## Open questions
- [x] Confirm the proposed wording in "States & errors" (answered 2026-11-15: use as proposed).

## Decisions log
- 2026-11-15: Person name length → 1–100 characters after trimming, same as trip names.
- 2026-11-15: Name uniqueness → Case-insensitive within a trip.
- 2026-11-15: Remove confirmation → Dialog with "Cancel" and "Remove", Cancel focused by default.
- 2026-11-15: In-use check before F4 and F6 exist → One shared check in F3, returning "not in use" until F4 and F6 extend it.
- 2026-11-15: People limit per trip → No limit.
- 2026-11-15: Adding people → One name at a time.
- 2026-11-15: Wording → Proposed copy in "States & errors" used as written.
- 2026-11-15: Spec approved by the user (11 requirements, 13 acceptance criteria, no open questions).
