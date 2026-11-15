# F6 — Settle up

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Source: product.md §1 (Goals), §3 (F6), Key terms "Suggested payment" and "Payment", Business rules R4, R6, R7, R8, §4 (Assumptions: money moves outside the app, no editing); F3 spec (F3.R7); F4 spec (F4.R10, F4.R12); F5 spec (F5.R4, F5.R7)_

## Summary
A user can see the fewest-steps plan for settling up a trip: a list of suggested payments that brings every balance to zero. The user marks a suggested payment as paid once the money has moved outside the app. A marked payment is recorded, and it changes the balances (product.md R4), so the suggestions update. A user can delete a recorded payment by mistake. When every suggested payment is marked paid, every balance reads zero. Payments cannot be edited; a mistake is fixed by deleting and marking again (product.md §4).

## User stories
- As a user, I want to see who should pay whom and how much, so that the trip is settled with as few payments as the rules allow.
- As a user, I want to mark a suggested payment as paid, so that the balances reflect money that has moved.
- As a user, I want to see the payments I have recorded, so that I can check what was marked paid.
- As a user, I want to delete a payment I marked by mistake, so that the balances go back to what they were.
- As a user, I want to see when everyone is settled, so that I know the trip is finished.

## Scope
**In:**
- Compute suggested payments from the balances, using rule R6 as written (F6.R1, F6.R2).
- Order and tie-break rule for suggestions (F6.R3).
- Mark a suggested payment as paid, which records a payment for its full amount (F6.R4, F6.R5).
- Refuse a mark when the suggestion no longer matches the current balances (F6.R6).
- Include payments in the balance calculation (F6.R7).
- List the trip's recorded payments, newest first (F6.R8).
- Delete a recorded payment after the user confirms (F6.R9).
- Extend the F3 and F4 in-use check so a person in a payment cannot be removed (F6.R10).
- Ownership and person checks on every payment endpoint (F6.R11).
- Settle up section on the trip page, with the "all settled" state (F6.R12).
- Payments are deleted with their trip (F6.R13).

**Out:**
- Partial payments, or payments of an amount other than the suggested one: product.md "mark a suggested payment as paid" allows only the full suggested amount.
- Editing a payment: not in the MVP (product.md §4 "No editing").
- Payments between a person and themselves, or payments involving people from another trip: refused (F6.R5, F6.R11).
- Recording money in a currency or converting it: out of scope (product.md §4).
- Confirming that money really moved: the app only records that a payment was made (product.md §4).
- Email or notifications to people about payments: not in the MVP (people have no accounts).

## User flow & screens
There are no mock screens yet (`docs/design` does not exist). Screen names below are working names.

1. **Trip** page (from F2), **Settle up** section. It replaces the settle-up part of the placeholder. It shows the suggested payments, then the recorded payments.
2. **Suggested payments** list: each row reads "{payer} pays {receiver} {amount}" with a "Mark as paid" button labelled for that payment (for example "Mark Jo pays Sam 40.00 as paid").
3. **Mark as paid**: the button records a payment for the full suggested amount. On success, the payment appears in the Recorded payments list, the suggestions refresh (the balances now include the payment), and a notice names it.
4. **Recorded payments** list: each row reads "{payer} paid {receiver} {amount}" with a "Delete" button labelled for that payment.
5. **Delete payment**: "Delete" opens a confirmation dialog.
   - "Cancel" or Escape → dialog closes, nothing changes.
   - "Delete payment" → the payment is deleted → the balances and suggestions refresh and a notice names it.
6. **All settled**: when there are no suggested payments, the section shows "Everyone is settled up." and no suggested payment rows. Recorded payments still show.
7. **No people on the trip**: the section shows the message in "States & errors" with a link to People, and no rows.
8. **Missing trip** (deleted, never existed, or owned by someone else): the Trip page shows the F2 not-found state (F2.R12). Nothing from the trip is shown.

## Requirements
- **F6.R1** Suggested payments are calculated from the trip's balances (F5.R1), which include recorded payments (F6.R7). They are not stored (F5.R7 pattern).
- **F6.R2** Suggested payments follow product.md R6 exactly: the person who owes the most pays the person who is owed the most, for the smaller of the two amounts. This repeats until all balances are zero. The payment amount is in whole cents. The rule is greedy and is not required to give the fewest possible payments (Decisions log).
- **F6.R3** The order of suggested payments is fixed by the order people were added to the trip (F3.R4) when amounts are equal. Where two people owe the same amount, or two are owed the same amount, the earlier-added person is chosen first. This makes the list stable (F5.R5).
- **F6.R4** "Mark as paid" records a payment with the suggested payer, receiver and full amount. Partial payments are not possible (Scope).
- **F6.R5** A payment has a payer and a receiver who are different people on the same trip, and an amount greater than zero (product.md R2 pattern, Key terms "Payment"). A payment to oneself is refused with `400`.
- **F6.R6** A mark is saved only if that exact suggestion (same payer, receiver and amount) is still in the current suggested payments. If it is not, nothing is saved, the response is `409`, and the user sees the message in "States & errors" and the list refreshes (Decisions log).
- **F6.R7** Recorded payments count in the balances (product.md R4): the payer's balance goes up by the amount and the receiver's goes down by it. The total stays exactly zero, because each payment moves money between two people (product.md R5). F5.R4's total check still applies.
- **F6.R8** Recorded payments are listed newest first, by the time they were recorded. Payments recorded at the same instant are ordered by ID, the same rule as F4.R9. No paging.
- **F6.R9** A payment is deleted only after the user confirms in a dialog. Deleting removes the payment in one transaction. The dialog names the payment and says the balances will change. Deleting is the only way to change a payment (no editing).
- **F6.R10** F6 extends the in-use check (F3.R7, F4.R12): a person is in use while they are the payer or receiver of any recorded payment. Removing such a person is refused with `409` (product.md R7). Deleting the payment is the way to free the person. The check uses the same shared function as F3 and F4.
- **F6.R11** Every payment endpoint uses the F1 shared check on the trip (F1.R10, F1.R11): a logged-out request gets `401`; a trip owned by another user, or a trip that does not exist, gets `404`. A payment ID that does not exist on that trip gets `404`. The payer and receiver must be people on that same trip; an ID from another trip, or one that does not exist, gets `400`.
- **F6.R12** The Settle up section replaces the settle-up part of the trip page placeholder. When there are no suggested payments, it shows "Everyone is settled up." (Open questions: copy).
- **F6.R13** Payments belong to one trip. Deleting a trip deletes them in the same transaction (F2.R9, product.md R8). Their table references `trips.id` and cascades from it.
- **F6.R14** Payment responses contain only the payment's ID, payer (ID and name), receiver (ID and name), amount in cents, and recorded time. They contain no `owner_id` and no data about other users (same rule as F4.R14).

## Data & contract
**Schema (new):**
- `payments`: `id`, `trip_id` (references `trips.id`, required, deleted with the trip), `payer_id` (references `people.id`, required), `receiver_id` (references `people.id`, required), `amount_cents` (integer, greater than zero), `created_at` (UTC; project-rules.md). Index on `trip_id`. A check constraint or service check refuses `payer_id = receiver_id` (F6.R5; the database check is code review).
- Foreign keys are on. `payer_id` and `receiver_id` use the default no-cascade rule, so deleting a person still needs F6.R10's in-use check first.

The table has no `owner_id`: ownership is checked through the trip, as in F2–F4.

**Cascade:** `payments.trip_id` cascades from `trips.id` (F6.R13). Payments are not linked to expenses, so deleting an expense does not change payments.

**API (proposed; the plan may adjust paths and names, but not the behavior below):**

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/:id/settle-up` | none | `200` `{ suggested: [{ payer: { id, name }, receiver: { id, name }, amountCents }], payments: [{ id, payer: { id, name }, receiver: { id, name }, amountCents, createdAt }] }`; suggested in the order of F6.R3, payments newest first | `401` logged out; `404` trip missing or another user's |
| `POST /api/trips/:id/payments` | `{ payerId, receiverId, amountCents }` for the suggestion marked as paid | `201` `{ payment: { … same shape as the list item … } }` | `400` payer or receiver not on this trip, or the same person (F6.R5, F6.R11); `401` logged out; `404` trip missing or another user's; `409` the suggestion no longer matches (F6.R6) |
| `DELETE /api/trips/:id/payments/:paymentId` | none | `204` payment deleted | `401` logged out; `404` trip or payment missing, or another user's trip |

Amounts are whole cents throughout (F4.R3 applies to typed amounts only; the mark request sends cents from the suggestion the server returned). No response includes `owner_id` or anything about other users (F6.R14). The F3 and F4 remove-person endpoint gains the payment in-use answer, so it can return `409` for a payment participant (F6.R10).

**Browser storage:** none.

## States & errors
Copy below is proposed and needs the user's confirmation (see Open questions).

- **Settle up, loading:** "Loading settle-up…"
- **Settle up, suggested row:** "{payer} pays {receiver} {amount}", for example "Jo pays Sam 40.00".
- **Settle up, recorded row:** "{payer} paid {receiver} {amount}", for example "Jo paid Sam 40.00".
- **Settle up, all settled:** "Everyone is settled up." Recorded payments still show.
- **Settle up, no payments yet and balances not zero:** no recorded-payments list; a note "No payments recorded yet."
- **Settle up, no people:** "Add people to this trip before you can settle up." with a "Go to People" link.
- **Settle up, load failed:** "Couldn't load settle-up." with a "Try again" button.
- **Mark as paid, saving:** that row's "Mark as paid" button is disabled and shows a busy state, so a double-click cannot record two payments.
- **Mark as paid, suggestion changed (F6.R6, 409):** "The suggestions changed. Check the list and try again." The list refreshes.
- **Mark as paid, payer or receiver no longer on the trip (400):** "One of these people is no longer on this trip. Check the list and try again."
- **Mark as paid, server or network error:** "Something went wrong. Please try again." The suggestion stays.
- **Mark as paid, success:** notice "{payer} paid {receiver} {amount}."
- **Delete dialog:** title "Delete this payment?", text "This removes the payment and changes everyone’s balance. This can’t be undone.", buttons "Cancel" and "Delete payment".
- **Delete, deleting:** both dialog buttons are disabled while the request runs.
- **Delete, server or network error:** in the dialog. "Couldn't delete the payment. Please try again." The payment stays.
- **Delete, payment already gone** (deleted in another tab, or the trip was deleted): the dialog closes, the list refreshes, and the notice says "That payment is no longer on this trip." If the whole trip is gone, the Trip page shows the F2 not-found state instead.
- **Remove person, in use by a payment:** handled by F3's dialog. The text for a payment is the F3 wording: "{name} is in an expense or payment, so they can't be removed."

## Accessibility
- The suggested and recorded lists are lists (`<ul>`/`<li>`). Each "Mark as paid" and "Delete" button has an accessible name that includes the payer and receiver names and the amount.
- The row text includes the words "pays" or "paid", the names and the amount, so direction is not shown by position or color alone.
- The delete dialog is a modal (`role="dialog"`, `aria-modal="true"`, labelled by its title). Focus moves to "Cancel" when it opens, stays inside it while open, and Escape closes it as Cancel. When it closes without deleting, focus returns to that payment's "Delete" button.
- "Delete payment" is styled as a destructive action, and the text says what happens.
- The notices and the error messages are announced (`role="status"` and `role="alert"`).
- The "Everyone is settled up." message is text, not only a visual state. Text meets WCAG AA contrast (4.5:1). No animation is required; any transition respects `prefers-reduced-motion`.

## Edge cases
- product.md Example 1: balances Sam +50.00, Alex −10.00, Jo −40.00 → suggested: Jo pays Sam 40.00; Alex pays Sam 10.00 (F6.R2). Marking Jo's payment leaves only Alex pays Sam 10.00 (product.md Example 3, F6.R7).
- After all suggestions are marked paid, every balance is 0 and the suggestion list is empty → "Everyone is settled up." (F6.R12).
- Two people owe the same amount → earlier-added person pays first (F6.R3).
- A suggestion where the smaller amount is the debtor's full debt, or the creditor's full credit → the next suggestion uses the remaining amount (F6.R2).
- Balances all zero from the start → no suggestions; the section shows "Everyone is settled up." (F6.R12).
- Trip has no people → no suggestions and no mark actions; the message shows (F6.R12).
- Same suggestion marked twice (two tabs or a double-click): the second request finds the suggestion gone and gets `409` (F6.R6); the first payment stands.
- Payment deleted → balances and suggestions return to what they were before that payment (F6.R7, F6.R9).
- Person who is a receiver of a recorded payment tries to be removed → refused with `409` (F6.R10). Once the payment is deleted, the person can be removed.
- Payment deleted in one tab while open in another → the second delete gets `404` and shows "That payment is no longer on this trip."
- User B calls any payment endpoint on user A's trip → `404`; A's trip is unchanged (F6.R11).
- Trip deleted while it has payments → the payments are deleted with it (F6.R13).
- Many payments and people → all counted; suggestions are computed from the full balances; no paging (Decisions log).
- Very large amounts → integer sums stay exact (F5.R3).

## Acceptance criteria
- **F6.AC1** Given the balances from product.md Example 1 (Sam +50.00, Alex −10.00, Jo −40.00), when the suggested payments are calculated, then they are "Jo pays Sam 40.00" and "Alex pays Sam 10.00", in that order.
- **F6.AC2** Given the suggestion "Jo pays Sam 40.00", when the user marks it as paid, then a payment of 4000 cents from Jo to Sam is recorded, the balances are updated (Sam +10.00, Alex −10.00, Jo 0.00), and the only suggestion left is "Alex pays Sam 10.00" (product.md Example 3).
- **F6.AC3** Given every suggested payment has been marked as paid, when the Settle up section is shown, then every balance is 0.00, there are no suggested payments, and "Everyone is settled up." shows.
- **F6.AC4** Given two people who owe the same amount, when suggestions are calculated, then the person added first to the trip pays first (F6.R3).
- **F6.AC5** Given a suggestion that no longer matches the current balances (for example after an expense was added in another tab), when the user marks it as paid, then nothing is recorded, the response is `409`, and the message "The suggestions changed. Check the list and try again." shows.
- **F6.AC6** Given a payment with the same payer and receiver, or an amount of zero or less, when it is recorded, then the request is refused with `400` and nothing is saved.
- **F6.AC7** Given a recorded payment, when the user presses "Delete" and then "Delete payment" in the dialog, then the payment is deleted, the balances and suggestions return to their earlier values, and the notice shows; when they press "Cancel" or Escape, the payment stays.
- **F6.AC8** Given a person who is the payer or receiver of a recorded payment, when the user tries to remove them, then the request is refused with `409` and the person stays on the trip; once the payment is deleted, the person can be removed (product.md R7, F3.R6, F4.R12).
- **F6.AC9** Given a payer or receiver ID that is not a person on that trip, when a payment is recorded, then the request is refused with `400` and nothing is saved.
- **F6.AC10** Given user A's trip T with payments and user B, when B lists, marks or deletes payments on T, then the response is `404`, and T is unchanged.
- **F6.AC11** Given a logged-out request to any F6 endpoint, then the response is `401` with no payment or balance data.
- **F6.AC12** Given a trip that is deleted, then its payments are deleted with it in the same transaction, and none remain.
- **F6.AC13** Given any F6 response, then it contains no `owner_id` and no data from another user, and amounts are whole cents.
- **F6.AC14** Given recorded payments, when the list is shown, then they are newest first, each showing payer, receiver and amount.
- **F6.AC15** Given the trip page, when the Settle up section is shown, then it replaces the settle-up part of the placeholder, and no placeholder text remains (F5.AC12 pattern).

## Dependencies
- **Needs F1:** login gate, session and the shared ownership check (F1.R9–R11).
- **Needs F2:** trips, the trip page shell, and the trip delete that must cascade to payments (F2.R7, F2.R9).
- **Needs F3:** people, their order (F3.R4), and the in-use check that F6 extends (F3.R7).
- **Needs F4:** expenses, which are the only source of the balances payments adjust (F4.R7, F4.R12). The in-use check F6 extends (F4.R12).
- **Needs F5:** balances (F5.R1), and the total check (F5.R4). F6 changes the calculation by adding payments (F5 spec "Used by F6"). F6 is build-order step 6.
- **External services:** none.

## Test plan
Unit tests only (project-rules.md). Each test names its AC ID in the test name. Owner filtering in database queries, the foreign keys, the cascades and the transaction can't be proven by unit tests, so a person checks them in code review (project-rules.md "Testing").

The suggestion rule, the payment-with-balances calculation, and the stale-suggestion check are plain functions (CLAUDE.md "Conventions"): they take balances, people order and payments, and return results in cents. Tests call them with fakes.

| AC | How it is proven |
|---|---|
| F6.AC1 | Unit: suggestion function on the Example 1 balances returns Jo→Sam 4000, then Alex→Sam 1000, in that order. |
| F6.AC2 | Unit: balance function with one recorded payment of 4000 cents from Jo to Sam returns Sam +1000, Alex −1000, Jo 0; the suggestion function returns only Alex→Sam 1000. |
| F6.AC3 | Unit: suggestion function with all balances zero returns an empty list; the Settle up component shows "Everyone is settled up." (headless browser component test). |
| F6.AC4 | Unit: suggestion function with two equal debtors returns the earlier-added person's payment first. |
| F6.AC5 | Unit: mark service with a fake store and the current suggestions: a mark that is not in the list returns `409` and the fake store is unchanged. |
| F6.AC6 | Unit: payment validation refuses equal payer and receiver with `400`, and amounts of zero or less; the fake store is unchanged. |
| F6.AC7 | Unit: delete service with a fake store removes the payment and balances return to the earlier values; Cancel and Escape make no delete call (headless browser component test). |
| F6.AC8 | Unit: remove-person service with the extended in-use check returns `409` for a payer and for a receiver; after the payment is deleted, the check returns false. |
| F6.AC9 | Unit: mark service with a fake people lookup refuses a payer or receiver not on the trip with `400`, and the fake store is unchanged. |
| F6.AC10 | Unit: each payment handler with the ownership check returns `404` for user B on A's trip, and the fake store is unchanged. Code review: the real queries join to `trips` and filter by `owner_id`. |
| F6.AC11 | Unit: each F6 handler with no session returns `401` (uses the F1 guard). |
| F6.AC12 | Code review: `payments.trip_id` cascades from `trips.id`, and the trip delete runs in one transaction in the real store. |
| F6.AC13 | Unit: response builders omit `owner_id`; amounts are integers in the response. |
| F6.AC14 | Unit: list service with a fake store returns payments newest first, ties by ID. |
| F6.AC15 | Unit (headless browser component test): trip page shows the Settle up section and no settle-up placeholder text. |

## Open questions
- [ ] Confirm the proposed copy in "States & errors" and F6.R12: "Settle up", "Loading settle-up…", "pays" / "paid" row wording, "Everyone is settled up.", "No payments recorded yet.", "Add people to this trip before you can settle up.", "Go to People", "Couldn't load settle-up.", "Try again", "The suggestions changed. Check the list and try again.", "Delete this payment?", "Delete payment", and "That payment is no longer on this trip." Not answered yet; this spec does not assume approval.

## Decisions log
- 2026-11-15: Tie order for suggestions → Order added to the trip (F3.R4), same as balances and the People list (user's answer: recommended option).
- 2026-11-15: Suggestion rule → Keep product.md R6 as written (greedy). It always settles to zero but is not guaranteed to use the fewest payments; product.md Goals says "as few as possible" (user's answer: recommended option). Flag: this differs from the Goals wording; a future spec can change it if the user wants a true minimum.
- 2026-11-15: Stale suggestion on mark → Refuse with `409` and refresh; nothing recorded (user's answer: recommended option).
- 2026-11-15: Delete payment confirmation → Dialog like expense delete (user's answer: recommended option).
- 2026-11-15: Partial payments → Not allowed; "mark a suggested payment as paid" is read as the full suggested amount (derived from product.md §3 F6 wording; not separately asked).
- 2026-11-15: Spec approved by the user (14 requirements, 15 acceptance criteria). The copy question in Open questions remains unanswered and is not settled by this approval.
