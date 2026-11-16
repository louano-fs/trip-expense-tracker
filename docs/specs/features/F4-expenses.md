# F4 — Expenses

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Source: product.md §1 (Overview), §2 (Roles, ownership rule), §3 (F4), §4 (Assumptions: equal splits, no editing, whole cents), Key terms "Expense", Business rules R1–R3, R7, R8; F1 spec (F1.R10–R11); F2 spec (F2.R9, F2.R11); F3 spec (F3.R4, F3.R6–R9)_

## Summary
A user can record a shared expense on one of their trips: a description, an amount, the person who paid, and the people who share the cost. The app splits the amount equally between the sharers, to the cent, and keeps the split so balances (F5) and settle-up (F6) can use it. A user can see the trip's expenses in a list and delete an expense recorded by mistake. Expenses cannot be edited; a mistake is fixed by deleting and adding again (product.md §4).

## User stories
- As a user, I want to record what was paid, how much, who paid and who shares it, so that the app knows what each person owes.
- As a user, I want everyone on the trip to share an expense by default, so that I only change the list when some people did not share it.
- As a user, I want the split to add up to the exact amount, so that no cent is lost or invented.
- As a user, I want to see the trip's expenses, newest first, so that I can check what has been recorded.
- As a user, I want to delete an expense I recorded by mistake, so that the balances stop counting it.

## Scope
**In:**
- Add an expense with a description, amount, payer and participants (F4.R1–R6).
- The equal split to the cent, with leftover cents rule (F4.R7).
- The expense form needs at least one person on the trip (F4.R8).
- List the trip's expenses, newest first (F4.R9).
- Delete an expense, with confirmation (F4.R10).
- Expenses and their splits are deleted with their trip (F4.R11).
- Extend the F3 in-use check so a person in an expense cannot be removed (F4.R12).
- Ownership on every expense endpoint, and payer and participants must belong to the trip (F4.R13).
- Expense section of the trip page, replacing the expense part of the placeholder (F4.R15).

**Out:**
- Editing an expense: not in the MVP (product.md §4 "No editing").
- Expense date chosen by the user: not in F4. Only the recorded time is kept (Decisions log).
- Uneven splits, custom shares, percentages: after the core (product.md "After the core").
- Currencies: out of scope (product.md §4).
- Balances and the totals they show: F5.
- Payments and suggested payments: F6. F6 adds its own in-use rule for people.
- CSV export or attachments (receipts): not in the MVP.

## User flow & screens
There are no mock screens yet (`docs/design` does not exist). Screen names below are working names.

1. **Trip** page (from F2), **Expenses** section (replaces the expense part of the placeholder). Lists the trip's expenses, newest first. With no expenses, the empty state shows instead of the list. An "Add expense" button opens the expense form.
2. **Add expense** form, fields in this order:
   - **Description**: text, required.
   - **Amount**: number, required, up to 2 decimal places.
   - **Paid by**: one person from the trip's people, required, no default. Shows the people in the order added (F3.R4).
   - **Shared by**: a checkbox per person on the trip. All are checked when the form opens. The user can uncheck any of them. At least one must stay checked.
   - "Add expense" and "Cancel" buttons.
   - Valid → expense saved → the form closes and the new expense appears at the top of the list; the notice names it.
   - Invalid → stay on the form, error shown under the field, typed values kept.
   - No people on the trip → the form is not saved. It shows the message that asks the user to add people first, with a link to the People section (F4.R8).
3. **Expense row**: description, amount, "Paid by {name}", and "Shared by {n} people", with a "Delete" button labelled for that expense.
4. **Delete expense**: "Delete" opens a confirmation dialog.
   - "Cancel" or Escape → dialog closes, nothing changes.
   - "Delete expense" → expense and its split are deleted → the list updates and a notice names the expense.
5. **Missing trip** (deleted, never existed, or owned by someone else): the Trip page shows the F2 not-found state (F2.R12). Nothing from the trip is shown.

## Requirements
- **F4.R1** An expense is added with four inputs: description, amount, payer and participants. Only the owner of the trip can add an expense to it (F1 ownership rule, product.md §2, F4.R13).
- **F4.R2** The description is trimmed of spaces at both ends, then must be 1 to 100 characters long, each Unicode code point counting as one character (same counting as F2.R2). Spaces inside it are kept as typed. Blank descriptions are rejected.
- **F4.R3** The amount is typed as a decimal number with at most 2 decimal places, for example `12`, `12.5` or `12.50`, with no thousands separators (Decisions log). It must be greater than zero (product.md R1). It is stored as a whole number of cents, never a float (product.md §4). An amount with more than 2 decimal places is rejected, not rounded. The largest amount is the largest value that can be stored and summed exactly as whole cents.
- **F4.R4** The payer is exactly one person on the trip. It is required and has no default (Decisions log).
- **F4.R5** Participants are one or more people on the trip (product.md R2). When the form opens, every person on the trip is a participant. The user may uncheck people. Zero participants is rejected.
- **F4.R6** The payer does not have to be a participant (product.md R2). A payer who is not a participant pays and does not share.
- **F4.R7** The split is equal, using the rule in product.md R3. Each participant's share is the amount in cents divided by the number of participants, rounded down to a whole cent. The leftover cents, one each, go to participants in the order they were added to the trip (F3.R4), starting from the first. The shares of one expense always add up to exactly the amount. Each participant's share is stored with the expense.
- **F4.R8** An expense needs at least one person on the trip, because it needs a payer and a participant (product.md R2). When the trip has no people, the add-expense form is not saved and shows the message in "States & errors".
- **F4.R9** The trip's expenses are listed newest first, by the time they were recorded. Expenses recorded at the same instant are ordered by ID so the order is stable (same rule as F2.R5). No paging.
- **F4.R10** An expense is deleted only after the user confirms in a dialog. Deleting removes the expense and its shares in one transaction (project-rules.md). The dialog names the expense and says the balances will change. Deleting an expense is the only way to change what it recorded (no editing, product.md §4).
- **F4.R11** Expenses and their shares belong to one trip. Deleting a trip deletes them in the same transaction (F2.R9, product.md R8). Their tables reference `trips.id` and cascade from it.
- **F4.R12** F4 extends the F3.R7 in-use check: a person is in use while they are the payer or a participant in any expense. Removing such a person is refused with `409` (F3.R6, product.md R7). The check uses the same shared function as F3, so there is one rule. Deleting the expense is the way to free the person.
- **F4.R13** Every expense endpoint uses the F1 shared check on the trip (F1.R10, F1.R11): a logged-out request gets `401`; a trip owned by another user, or a trip that does not exist, gets `404`. An expense ID that does not exist on that trip gets `404`. The payer and each participant must be people on that same trip; an ID from another trip, or one that does not exist, gets `400` (see the API table).
- **F4.R14** The expense responses contain only the expense's ID, description, amount in cents, payer (ID and name), participants (ID, name and share in cents), and recorded time. They contain no `owner_id` and no data about other users (same rule as F3.R11).
- **F4.R15** The trip page's expense section replaces the expense part of the placeholder. The balance part of the placeholder stays until F5.
- **F4.R16** There is no endpoint or screen to edit an expense (product.md §4).

## Data & contract
**Schema (new):**
- `expenses`: `id`, `trip_id` (references `trips.id`, required, deleted with the trip), `description` (trimmed, 1–100 characters), `amount_cents` (integer, greater than zero), `payer_id` (references `people.id`, required), `created_at` (UTC; project-rules.md). Index on `trip_id`.
- `expense_participants`: `expense_id` (references `expenses.id`, deleted with the expense), `person_id` (references `people.id`), `share_cents` (integer, zero or more). The pair `(expense_id, person_id)` is unique. At least one row per expense; the rows of one expense sum to `amount_cents` (enforced in the service, see F4.R7; the database check is code review).
- Foreign keys are on, so cascades work (project rules). `payer_id` and `person_id` use the default no-cascade rule: deleting a person still needs F4.R12's in-use check first.

The table has no `owner_id`: ownership is checked through the trip, as in F2 and F3.

**Cascade:** `expenses.trip_id` cascades from `trips.id` (F4.R11). `expense_participants.expense_id` cascades from `expenses.id`, so deleting an expense deletes its shares. F6's tables must follow the same rule for `trips.id`.

**API (proposed; the plan may adjust paths and names, but not the behavior below):**

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/:id/expenses` | none | `200` `{ expenses: [{ id, description, amountCents, payer: { id, name }, participants: [{ id, name, shareCents }], createdAt }] }`, newest first | `401` logged out; `404` trip missing or another user's |
| `POST /api/trips/:id/expenses` | `{ description, amount, payerId, participantIds }` where `amount` is the typed decimal string | `201` `{ expense: { … same shape as the list item … } }` | `400` description, amount, payer or participants invalid (with field name); `400` payer or a participant not on this trip (F4.R13); `401` logged out; `404` trip missing or another user's |
| `DELETE /api/trips/:id/expenses/:expenseId` | none | `204` expense and its shares deleted | `401` logged out; `404` trip or expense missing, or another user's trip |

Amounts are sent and received in whole cents (`amountCents`, `shareCents`) except the request's typed `amount`, which is parsed once on the server into cents (F4.R3). The F3 remove endpoint gains the new in-use answer, so it can return `409` for an expense participant (F4.R12). No response includes `owner_id` or anything about other users.

## States & errors
Copy below is proposed and needs the user's confirmation (see Open questions).

- **Expenses, loading:** "Loading expenses…"
- **Expenses, empty:** "No expenses yet. Add the first shared cost on this trip." with an "Add expense" button.
- **Expenses, no people:** "Add people to this trip before recording an expense." with a "Go to People" link.
- **Expenses, list row:** description, amount with two decimals (for example `12.50`), "Paid by {name}", "Shared by {n} people" (one person: "Shared by 1 person"), then a "Delete" button labelled for that expense (for example "Delete dinner").
- **Expenses, load failed:** "Couldn't load expenses." with a "Try again" button.
- **Add, description empty or only spaces:** field error. "Enter a description."
- **Add, description over 100 characters:** field error. "Description must be 100 characters or fewer."
- **Add, amount empty:** field error. "Enter an amount."
- **Add, amount not a number, or has more than 2 decimals, or has commas:** field error. "Enter an amount like 12 or 12.50, without commas."
- **Add, amount zero or less:** field error. "Amount must be more than zero."
- **Add, no payer chosen:** field error. "Choose who paid."
- **Add, no one shares:** field error. "Choose at least one person to share this."
- **Add, saving:** "Add expense" is disabled and shows a busy state, so a double-click cannot add two expenses.
- **Add, server or network error:** form-level error. "Something went wrong. Please try again." The typed values are kept.
- **Add, a payer or sharer no longer on the trip** (removed in another tab): form-level error. "One of these people is no longer on this trip. Check the list and try again."
- **Delete dialog:** title "Delete “{description}”?", text "This removes the expense and changes everyone’s balance. This can’t be undone.", buttons "Cancel" and "Delete expense".
- **Delete, deleting:** both dialog buttons are disabled while the request runs.
- **Delete, server or network error:** in the dialog. "Couldn't delete the expense. Please try again." The expense stays.
- **Delete, expense already gone** (deleted in another tab, or the trip was deleted): the dialog closes, the list refreshes, and the notice says "“{description}” is no longer on this trip." If the whole trip is gone, the Trip page shows the F2 not-found state instead.
- **Expenses, after add:** notice "“{description}” added."
- **Expenses, after delete:** notice "“{description}” deleted."
- **Remove person, in use by an expense:** handled by F3's dialog. The text for an expense is the F3 wording: "{name} is in an expense or payment, so they can't be removed."

## Accessibility
- The expense list is a list (`<ul>`/`<li>`). Each "Delete" button has an accessible name that includes the expense description.
- The add-expense form uses visible labels for every field. The "Shared by" checkboxes are grouped in a `<fieldset>` with a `<legend>`. The payer is a native `<select>` or radio group, so it works with the keyboard.
- Enter in the description or amount field submits. On an error, focus stays on the first invalid field and each error is linked with `aria-describedby`.
- The "Add expense" button is reached by keyboard in the normal tab order, after the last field.
- The delete dialog is a modal (`role="dialog"`, `aria-modal="true"`, labelled by its title). Focus moves to "Cancel" when it opens, stays inside it while open, and Escape closes it as Cancel. When it closes without deleting, focus returns to the "Delete" button of that expense.
- "Delete expense" is styled as a destructive action, and the warning does not rely on color alone (the text says what happens).
- The added and deleted notices and the load-failed message are announced (`role="status"` and `role="alert"`).
- Amounts are readable as text, not only through layout. Text meets WCAG AA contrast (4.5:1). No animation is required; any transition respects `prefers-reduced-motion`.

## Edge cases
- Amount `12` → 1200 cents. `12.5` → 1250 cents. `12.50` → 1250 cents. `0.01` → 1 cent, accepted. `0` and `-5` → rejected (F4.R3).
- Amount `12.345` → rejected with the decimal message; never rounded (F4.R3).
- Amount `1,250.00` → rejected with the commas message (Decisions log).
- Description `"  Dinner  "` → saved as `Dinner` (F4.R2).
- Description of only spaces → rejected as empty (F4.R2).
- Amount `10.00` shared by three people, Sam first in the trip's order → shares 3.34, 3.33, 3.33 (product.md Example 2). Sam is the first participant, so he gets the extra cent.
- Amount `0.02` shared by three → shares 0.01, 0.01, 0.00: cents are never invented; the leftover rule gives the extra cent to the first two (F4.R7).
- One participant → that person's share equals the full amount.
- Payer not in the participant list → accepted; the payer pays and has no share (F4.R6).
- The user unchecks everyone → rejected with "Choose at least one person to share this." (F4.R5).
- A person removed in another tab before the expense is saved → the save is refused with the "no longer on this trip" message and nothing is saved.
- The trip has no people → the form is not shown as a usable form; the "Add people" message shows (F4.R8).
- Person in an expense tries to be removed → refused with `409` (F4.R12). Once the expense is deleted, the person can be removed.
- Expense deleted in one tab while the trip is open in another → the other tab's delete gets `404` and shows the "no longer on this trip" notice.
- Delete clicked twice quickly → buttons are disabled during the request; a second request gets `404` and shows the notice, never an error page.
- User B calls any expense endpoint on user A's trip → `404`; A's trip is unchanged (F4.R13).
- Trip deleted while it has expenses → the expenses and their shares are deleted with it (F4.R11).
- Many expenses (for example 200) → all shown, no paging (Decisions log).
- Expense recorded at the same instant as another → shown in a stable order by ID (F4.R9).

## Acceptance criteria
- **F4.AC1** Given the owner of a trip with people Sam, Alex and Jo, when they add an expense "Dinner" of 90.00 paid by Sam and shared by all three, then an expense is saved on that trip with those values, its three shares are 30.00 each, and it appears at the top of the list.
- **F4.AC2** Given the description `"  Dinner  "`, when the expense is saved, then the saved description is `Dinner`; given a description of only spaces, the request is rejected with "Enter a description." and no expense is saved.
- **F4.AC3** Given a description of 100 characters, the expense is saved; given 101 characters, it is rejected with "Description must be 100 characters or fewer." and no expense is saved.
- **F4.AC4** Given the amounts `12`, `12.5` and `12.50`, then each is saved as 1200, 1250 and 1250 cents. Given `0`, `-5`, `12.345` or `1,250.00`, the request is rejected with the matching message and no expense is saved.
- **F4.AC5** Given an expense of 10.00 shared by Sam, Alex and Jo in that order, then the shares are 3.34, 3.33 and 3.33, and they add up to exactly 10.00 (product.md R3, Example 2).
- **F4.AC6** Given any amount and any number of participants from 1 to the number of people on the trip, then the shares add up to exactly the amount, and no share is more than one cent away from another share.
- **F4.AC7** Given the add-expense form opened on a trip, then every person on the trip is checked as a sharer, and unchecking all of them is rejected with "Choose at least one person to share this." (product.md R2).
- **F4.AC8** Given a payer who is not a participant, when the expense is saved, then the payer has no share and the expense is saved (product.md R2).
- **F4.AC9** Given a trip with no people, when the user opens the add-expense form, then the form is not usable and the message "Add people to this trip before recording an expense." shows with a link to People.
- **F4.AC10** Given a trip with three expenses recorded at different times, when the expense list is shown, then they are listed newest first, each with its description, amount, payer and number of sharers.
- **F4.AC11** Given an expense, when the user presses "Delete" and then "Delete expense" in the dialog, then the expense and its shares are deleted and the notice "“Dinner” deleted." shows; when they press "Cancel" or Escape, the expense stays.
- **F4.AC12** Given a person who is the payer or a participant in an expense, when the user tries to remove them, then the request is refused with `409` and the person stays on the trip; once the expense is deleted, the person can be removed (product.md R7, F3.R6).
- **F4.AC13** Given user A's trip T with expenses and user B with their own trips, when B lists, adds or deletes expenses on T, then the response is `404`, the same as for a trip that does not exist, and T is unchanged.
- **F4.AC14** Given an expense payer or participant ID that is not a person on that trip, when the expense is saved, then the request is refused with `400` and nothing is saved.
- **F4.AC15** Given a logged-out request to any F4 endpoint, then the response is `401` with no expense data.
- **F4.AC16** Given a trip that is deleted, then its expenses and their shares are deleted with it in the same transaction, and none remain.
- **F4.AC17** Given any F4 response, then it contains no `owner_id` and no data from another user, and amounts are whole cents.
- **F4.AC18** Given a trip page, when the expense section is shown, then it replaces the expense part of the placeholder, and the balance placeholder text stays.

## Dependencies
- **Needs F1:** login gate, session and the shared ownership check (F1.R9–R11).
- **Needs F2:** trips, the trip page shell, and the trip delete that must cascade to expenses (F2.R7, F2.R9).
- **Needs F3:** people, their order (F3.R4), the in-use check that F4 extends (F3.R7), and the cascade from trips (F3.R9). F4 is build-order step 4.
- **Used by F5:** balances use each expense's payer and shares (product.md R4, R5).
- **Used by F6:** F6 adds payments that also count as in use for people (F3.R7). F6 does not change expenses.
- **External services:** none.

## Test plan
Unit tests only (project-rules.md). Each test names its AC ID in the test name. Owner filtering in database queries, the foreign keys, the cascades and the transaction can't be proven by unit tests, so a person checks them in code review (project-rules.md "Testing").

The split and parsing rules are plain functions (CLAUDE.md "Conventions"): the amount parser, the split function, and the in-use check. Tests call them with fakes.

| AC | How it is proven |
|---|---|
| F4.AC1 | Unit: add-expense service with a fake store and a fake clock; expense saved with trip, description, payer, participants, cents and UTC time; the three 30.00 shares are stored. |
| F4.AC2 | Unit: description validation trims and rejects blank descriptions. |
| F4.AC3 | Unit: description validation, 100 accepted, 101 rejected, emoji counted by code point. |
| F4.AC4 | Unit: amount parser returns cents for `12`, `12.5`, `12.50`, and rejects `0`, `-5`, `12.345`, `1,250.00`. |
| F4.AC5 | Unit: split function on 1000 cents over three participants in order returns 334, 333, 333. |
| F4.AC6 | Unit: split function, property-style table of amounts and participant counts: sum equals amount and shares differ by at most one cent. |
| F4.AC7 | Unit (headless browser component test): add-expense form starts with all people checked; unchecking all shows the message and makes no save call. |
| F4.AC8 | Unit: add-expense service accepts a payer who is not in the participant list and stores no share for the payer. |
| F4.AC9 | Unit (headless browser component test): form with an empty people list shows the "Add people" message and the link. |
| F4.AC10 | Unit: list service with a fake store returns expenses newest first, ties by ID; each row includes the payer and sharer count. |
| F4.AC11 | Unit: delete service with a fake store removes the expense and its shares; the dialog's Cancel and Escape make no delete call (headless browser component test). |
| F4.AC12 | Unit: remove-person service with the extended in-use check returning true for a payer and for a participant returns `409` and the fake store is unchanged. Also: after the expense is deleted, the check returns false. |
| F4.AC13 | Unit: each expense handler with the ownership check returns `404` for user B on A's trip, and the fake store is unchanged. Code review: the real queries join to `trips` and filter by `owner_id`. |
| F4.AC14 | Unit: add-expense service with a fake people lookup refuses a payer or participant not on the trip with `400`, and the fake store is unchanged. |
| F4.AC15 | Unit: each F4 handler with no session returns `401` (uses the F1 guard). |
| F4.AC16 | Code review: `expenses.trip_id` cascades from `trips.id`, `expense_participants.expense_id` cascades from `expenses.id`, and the trip delete runs in one transaction in the real store. |
| F4.AC17 | Unit: response builders omit `owner_id`; amounts are integers in the response. |
| F4.AC18 | Unit (headless browser component test): trip page shows the expense section and keeps the balance placeholder text. |

## Open questions
- [x] Confirm the proposed wording in "States & errors" (answered 2026-11-15: approved with the spec as written).

## Decisions log
- 2026-11-15: Expense date → None. Only the recorded time is kept; no date field (keeps the four inputs in product.md Goals).
- 2026-11-15: Description rules → Required, 1–100 characters after trimming, same as trip and person names.
- 2026-11-15: Largest amount → No limit beyond whole cents that can be stored and summed exactly.
- 2026-11-15: Expense list order → Newest first, like the Trips list.
- 2026-11-15: Amount format → Up to 2 decimal places (for example `12`, `12.5`, `12.50`); more decimals are rejected, not rounded.
- 2026-11-15: Payer → Must be chosen; no default.
- 2026-11-15: Delete expense → Confirmation dialog with "Cancel" and "Delete expense", Cancel focused by default, like trip and person delete.
- 2026-11-15: Trip with no people → The add-expense form is not usable; it links to People.
- 2026-11-15: Thousands separators → Not accepted; digits only.
- 2026-11-15: Paging on the expense list → None, like the other lists.
- 2026-11-15: Wording → Proposed copy in "States & errors" approved with the spec as written.
- 2026-11-15: Spec approved by the user (16 requirements, 18 acceptance criteria, no open questions).
