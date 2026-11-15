# F5 — Balances

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Source: product.md §3 (F5), §1 (Goals), Key terms "Balance", Business rules R4, R5; F3 spec (F3.R4); F4 spec (F4.R7, F4.R10, F4.R13, F4.R15, F4.AC18)_

## Summary
A user can see, for each person on a trip, what that person is owed or owes, and a total line that always reads 0.00. The balance is what the person paid for the trip's expenses minus their share of them. The Balances section replaces the last part of the trip page placeholder, so the trip page is complete except for settle-up (F6). Balances change as expenses are added or deleted, and they are always exact to the cent. Payments, which adjust balances, are added in F6.

## User stories
- As a user, I want to see what each person is owed or owes, so that I know who should pay whom.
- As a user, I want a total that reads zero, so that I can see that the balances add up.
- As a user, I want the balances to update when I add or delete an expense, so that the numbers are never stale.
- As a user, I want to see who is settled up, so that I don't chase payments that aren't needed.

## Scope
**In:**
- Compute each person's balance from the expenses on the trip (F5.R1, F5.R7).
- Show "is owed" or "owes" with the amount, or "Settled up" for zero (F5.R2).
- Show a total line that is always 0.00 (F5.R4).
- Order the rows by the order people were added to the trip (F5.R5).
- Show the trip's balances as an endpoint and a section on the trip page, replacing the balance placeholder (F5.R6, F5.R8, F5.R9).
- The empty states for a trip with no expenses and a trip with no people (F5.R10).

**Out:**
- Payments, and how they change balances: F6 (product.md R4 "payments made / received" is added in F6).
- Suggested payments and "fewest payments" to settle up: F6.
- Showing a balance as a percentage, or any currency: out of scope (product.md §4).
- Paging, sorting by amount, or search on the balance list: not in the MVP.
- Editing balances by hand: not in the MVP (product.md §4 "No editing").

## User flow & screens
There are no mock screens yet (`docs/design` does not exist). Screen names below are working names.

1. **Trip** page (from F2), **Balances** section. It replaces the balance part of the placeholder. It lists one row per person, in the order they were added to the trip (F3.R4), followed by the total line.
   - Each row: the person's name, then "is owed {amount}", "owes {amount}", or "Settled up" with 0.00.
   - The total line: "Total" with 0.00.
2. **No expenses yet:** each person is shown as "Settled up" with 0.00, and the note under the heading says no expenses are recorded yet. The total line still shows.
3. **No people on the trip:** the Balances section shows the message in "States & errors" with a link to the People section, and no rows or total line.
4. **After an expense is added or deleted** (F4): the Expenses section updates, and the Balances section refreshes so its numbers match the new expenses.
5. **Missing trip** (deleted, never existed, or owned by someone else): the Trip page shows the F2 not-found state (F2.R12). Nothing from the trip, balances included, is shown.

## Requirements
- **F5.R1** A person's balance is what they paid for expenses on the trip minus the sum of their shares in those expenses (product.md R4, without payments; F6 adds payments). A payer who is not a participant has no shares, so their balance is what they paid (F4.R6).
- **F5.R2** The balance is shown as: a positive balance as "is owed {amount}", a negative balance as "owes {amount}" with the amount as a positive number, and a zero balance as "Settled up" with 0.00. Amounts show two decimal places (product.md Key terms "Balance"; Decisions log).
- **F5.R3** Balances are whole cents, stored and calculated as integers (product.md §4). Because each expense's shares add up to its amount exactly (F4.R7), no rounding is needed in a balance.
- **F5.R4** The total line is the sum of all balances on the trip. It always reads 0.00, because all balances add up to exactly zero (product.md R5). The balance function checks this sum; if it is not zero, the request fails with a server error that is logged without personal data, and no balances are shown. A wrong balance is never shown as correct.
- **F5.R5** Rows are in the order the people were added to the trip (F3.R4), the same order as the People list and the expense split. This order is stable.
- **F5.R6** The balance endpoint uses the F1 shared check on the trip (F1.R10, F1.R11): a logged-out request gets `401`; a trip owned by another user, or a trip that does not exist, gets `404`.
- **F5.R7** Balances are not stored. They are calculated from the trip's expenses and their shares each time they are read, so they are always correct after an expense is added or deleted (F4.R10 "changes everyone's balance").
- **F5.R8** The Balances section refreshes after an expense is added or deleted in the same tab (F4.R10, F5.R7).
- **F5.R9** The Balances section replaces the balance part of the trip page placeholder (F4.R15, F4.AC18). After F5, the trip page shows no placeholder text except what F6 still needs.
- **F5.R10** A trip with no expenses shows each person as "Settled up" with 0.00 and a note that no expenses are recorded yet. A trip with no people shows no rows and no total line; it shows the message that asks the user to add people first, with a link to People.
- **F5.R11** Balance responses contain only each person's ID, name and balance in cents, and the total in cents. They contain no `owner_id` and no data about other users (same rule as F3.R11, F4.R14).

## Data & contract
**Schema:** None. Balances are calculated from `expenses` (F4) and `expense_participants` (F4). No new tables, and nothing is stored (F5.R7).

**Cascade:** None new. Balances end when the trip is deleted, because the trip's expenses are deleted with it (F4.R11).

**API (proposed; the plan may adjust paths and names, but not the behavior below):**

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/trips/:id/balances` | none | `200` `{ balances: [{ person: { id, name }, balanceCents }], totalCents }`, rows in the order people were added (F5.R5); `totalCents` is always `0` (F5.R4) | `401` logged out; `404` trip missing or another user's (F5.R6) |

Amounts are whole cents. `balanceCents` is negative when the person owes (the UI shows the absolute value as "owes"). No response includes `owner_id` or anything about other users (F5.R11).

**Browser storage:** none.

## States & errors
Copy below is proposed and needs the user's confirmation (see Open questions). The "is owed" / "owes" wording and "Settled up" follow product.md and the user's answer.

- **Balances, loading:** "Loading balances…"
- **Balances, row (owed):** "{name}" then "is owed {amount}", for example "is owed 50.00".
- **Balances, row (owes):** "{name}" then "owes {amount}", for example "owes 10.00".
- **Balances, row (zero):** "{name}" then "Settled up" with 0.00.
- **Balances, total line:** "Total" with "0.00".
- **Balances, no expenses yet:** note under the heading: "No expenses yet. Add an expense to see who owes what."
- **Balances, no people:** "Add people to this trip before you can see balances." with a "Go to People" link.
- **Balances, load failed:** "Couldn't load balances." with a "Try again" button.
- **Balances, server error on the total check (F5.R4):** "Couldn't load balances." with a "Try again" button (the same message as load failed; nothing wrong is shown).
- **Balances, after expense change:** no notice; the rows update in place. The expense notices from F4 still show.

## Accessibility
- The Balances rows are a list (`<ul>`/`<li>`). Each row's text includes the person's name, the words "is owed", "owes" or "Settled up", and the amount, so the state is not shown by color or position alone.
- The total line is text, not only a number in a layout.
- The section has a heading (`<h2>`) "Balances". The "Try again" button and the load-failed message are announced (`role="alert"`).
- Text meets WCAG AA contrast (4.5:1). No animation is required; any transition respects `prefers-reduced-motion`.

## Edge cases
- Example 1 (product.md): Sam paid 90.00 and Alex paid 30.00, both shared by Sam, Alex and Jo → Sam is owed 50.00, Alex owes 10.00, Jo owes 40.00; total 0.00 (F5.R1, F5.R4).
- Example 2 (product.md): 10.00 paid by Sam, shared by Sam, Alex and Jo, shares 3.34, 3.33, 3.33 → Sam is owed 6.66, Alex owes 3.33, Jo owes 3.33; total 0.00 (F5.R3).
- A payer who is not a participant (F4.R6): balance is the amount paid, with no shares subtracted.
- A person with no expenses at all: "Settled up" 0.00 (F5.R2).
- Balance exactly zero after equal payments and shares: "Settled up" (F5.R2).
- An expense is deleted → every balance is recalculated; the total stays 0.00 (F5.R7).
- A person removed from the trip after their last expense is deleted → they are no longer a row (F3, F4.R12).
- The trip has no people → no rows and no total line (F5.R10).
- User B calls the balance endpoint on user A's trip → `404`; nothing is shown (F5.R6).
- Trip deleted while balances are open in another tab → the next request gets `404` and shows the F2 not-found state (F2.R12).
- Many people and expenses (for example 200 expenses) → all counted; no paging (Decisions log).
- Very large amounts → integer sums stay exact (F5.R3).

## Acceptance criteria
- **F5.AC1** Given the trip from product.md Example 1 (Sam pays 90.00, Alex pays 30.00, all shared by Sam, Alex and Jo), when the balances are shown, then Sam is owed 50.00, Alex owes 10.00, Jo owes 40.00, and the total reads 0.00.
- **F5.AC2** Given a person whose paid amount equals their shares, when the balances are shown, then their row reads "Settled up" with 0.00.
- **F5.AC3** Given a payer who is not a participant, when the balances are shown, then the payer's balance is the amount they paid, and no share is subtracted (product.md R4, F4.AC8).
- **F5.AC4** Given any set of expenses on a trip, when the balances are calculated, then the balances add up to exactly zero and the total line reads 0.00 (product.md R5). If the sum is not zero, the balances are not shown and the request fails with a server error.
- **F5.AC5** Given the example of 10.00 shared by three people, when the balances are shown, then the rows match the shares in product.md Example 2 (Sam owed 6.66, Alex and Jo each owe 3.33).
- **F5.AC6** Given a trip with people, when the rows are listed, then they are in the order people were added to the trip.
- **F5.AC7** Given an expense is added or deleted on a trip, when the balances are read again, then they reflect the change and the total is still 0.00 (F5.R7, F5.R8).
- **F5.AC8** Given a trip with people but no expenses, when the Balances section is shown, then each person reads "Settled up" with 0.00 and the note "No expenses yet…" shows.
- **F5.AC9** Given a trip with no people, when the Balances section is shown, then the message "Add people to this trip before you can see balances." shows with a link to People, and no rows or total show.
- **F5.AC10** Given a logged-out request to the balance endpoint, then the response is `401` with no balance data; given user B's request for user A's trip, the response is `404` and nothing about A's trip is shown (F5.R6).
- **F5.AC11** Given any balance response, then it contains no `owner_id`, no data from another user, and amounts are whole cents (F5.R3, F5.R11).
- **F5.AC12** Given the trip page, when the Balances section is shown, then it replaces the balance part of the placeholder, and no balance placeholder text remains (F4.AC18, F5.R9).

## Dependencies
- **Needs F1:** login gate, session and the shared ownership check (F1.R9–R11).
- **Needs F2:** trips and the trip page shell that the Balances section goes into (F2.R7).
- **Needs F3:** people and their order (F3.R4).
- **Needs F4:** expenses, payers and shares, which are the only inputs to a balance (F4.R7, F4.R13). F5 is build-order step 5.
- **Used by F6:** F6 adds payments, which change each balance by product.md R4 ("payments made" and "payments received"). F6 extends the balance calculation with payments; F5 does not store balances, so F6 changes only the calculation (F5.R7). F6 also uses the total check in F5.R4.
- **External services:** none.

## Test plan
Unit tests only (project-rules.md). Each test names its AC ID in the test name. Owner filtering in database queries and the cascade from trips can't be proven by unit tests, so a person checks them in code review (project-rules.md "Testing").

The balance calculation and the total check are plain functions (CLAUDE.md "Conventions"): they take expenses, their shares and the people in order, and return balances in cents. Tests call them with fakes.

| AC | How it is proven |
|---|---|
| F5.AC1 | Unit: balance function on the Example 1 expenses returns +5000, −1000, −4000 cents in order, and the total is 0. |
| F5.AC2 | Unit: balance function returns 0 for a person whose paid equals their shares; the row formatter returns "Settled up" and 0.00 (headless browser component test for the row text). |
| F5.AC3 | Unit: balance function with a payer who has no share returns the amount paid for that payer. |
| F5.AC4 | Unit: property-style table of expense sets: the balances sum to 0 for each set; the total check returns an error when given a non-zero sum. |
| F5.AC5 | Unit: balance function on 1000 cents paid by Sam and shared by Sam, Alex and Jo in order (334, 333, 333) returns 666, −333, −333. |
| F5.AC6 | Unit: balance list service with a fake people list returns rows in the fake's order. |
| F5.AC7 | Unit: balance service with a fake store, adding or removing an expense in the fake store changes the returned balances; the total stays 0. |
| F5.AC8 | Unit (headless browser component test): Balances section with people and no expenses shows "Settled up" for each and the note. |
| F5.AC9 | Unit (headless browser component test): Balances section with no people shows the message and the People link, and no total line. |
| F5.AC10 | Unit: balance handler with no session returns `401`; with user B and a fake store that has A's trip, returns `404` and the fake store is unchanged. Code review: the real queries join to `trips` and filter by `owner_id`. |
| F5.AC11 | Unit: response builder omits `owner_id`; `balanceCents` and `totalCents` are integers. |
| F5.AC12 | Unit (headless browser component test): trip page shows the Balances section and no balance placeholder text. |

## Open questions
None. The copy in "States & errors" is final, and a failed total check (F5.R4) shows the same "Couldn't load balances." message as a load failure.

## Decisions log
- 2026-11-15: Balance before payments → F5 calculates paid minus shares only; F6 adds payments to the same calculation (product.md R4, build order). Derived from the build order and product.md R4; the user did not object.
- 2026-11-15: Zero balance wording → "Settled up" with 0.00 (user's answer: recommended option).
- 2026-11-15: Total line → Shows "Total" with 0.00 at the bottom, so the rule that balances add up to zero (product.md R5) is visible (user's answer: recommended option).
- 2026-11-15: Row order → Order added to the trip, the same as the People list and expense split (user's answer: recommended option).
- 2026-11-15: Empty state with no expenses → Each person shown as "Settled up" with 0.00, plus a note that no expenses are recorded yet (user's answer: recommended option).
- 2026-11-15: Balances are calculated, not stored → Derived from F4.R10 ("changes everyone's balance") and product.md Goals ("always correct").
- 2026-11-15: Spec approved by the user (11 requirements, 12 acceptance criteria). The two copy questions were then delegated to Claude: "any wording is fine, pick the most suitable". Claude chose the copy in "States & errors" and the same message for a failed total check as for a load failure. Open questions are now none.
