# F1 — Registration and login

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Source: product.md §3 (F1), §2 (Roles, Ownership rule), §4 (Assumptions), §6 (Rules of logging); NIST SP 800-63B-4; OWASP Password Storage Cheat Sheet_

## Summary
A visitor can create an account with an email and password, then log in and out. Every trip page and trip endpoint requires a logged-in user, and this feature builds the shared check that each later trip feature uses to confirm the trip belongs to that user. This is the first feature to build, because every other feature depends on it. Password and session rules follow NIST SP 800-63B-4 for password-only login, because the user asked for trusted-source guidance on these points.

## User stories
- As a visitor, I want to register with an email and password, so that I can start tracking trips.
- As a user, I want to log in and log out, so that I can reach my trips and leave a shared device safely.
- As a user, I want my trips to be private and my account hard to guess into, so that no one else can see or change them.

## Scope
**In:**
- Registration with email and password (F1.R1–R5).
- Password rules, blocklist and hashing (F1.R3, F1.R12).
- Login and logout, in the current browser, with sessions that expire after 30 days (F1.R6–R8).
- Throttling of repeated failed logins (F1.R13).
- Password field usability: paste, password managers, show/hide (F1.R14).
- Login gate on all trip pages and trip endpoints (F1.R9–R10).
- The shared ownership check that F2–F6 call on every trip request (F1.R11).

**Out:**
- Trip creation, listing and deletion: F2. F1 adds no trip data; the cross-user test runs in F2 (see Dependencies).
- Email verification, password reset, account recovery: out of scope (product.md §4). Because there is no recovery, the NIST 100-failure disable is not applied (Decisions log).
- Checking passwords against an online breach service: out of scope, because third-party integrations are out of scope (product.md "After the core"). A bundled list is used instead (F1.R12).
- Bot challenges (CAPTCHA): not in F1.
- Logout from all devices: not in F1 (Decisions log).
- Display name, profile, changing the password, editing or deleting an account: not in the MVP (product.md §2, §4 "No editing").
- Login with other providers: out of scope (product.md §4 "email and password only").

## User flow & screens
There are no mock screens yet (`docs/design` does not exist). Screen names below are working names.

1. **Visitor opens the app** with no session → goes to **Log in** screen.
2. **Register** (from the Log in screen, "Create an account"): enter email and password → Submit.
   - Valid → account created, user is logged in, sent to **Trips** screen.
   - Invalid, too common, or email taken → stay on **Register**, show the error next to the field.
3. **Log in**: enter email and password → Submit.
   - Correct → user is logged in, sent to **Trips** screen.
   - Wrong → stay on **Log in**, show one general error.
   - Too many failures → stay on **Log in**, show the wait message.
4. **Log out** (control in the page header, visible when logged in) → session ends in this browser → **Log in** screen.
5. **Session older than 30 days** → next page visit goes to **Log in** with the expired message.
6. **Logged-out visitor opens a trip page** (any URL under trips) → redirected to **Log in**.
7. **Trips** screen: placeholder until F2 adds the trip list.

## Requirements
- **F1.R1** Registration takes exactly two inputs: email and password.
- **F1.R2** Email is trimmed of spaces at both ends, checked for a valid format, and at most 254 characters (the limit for an email address in RFC 5321). Emails are compared case-insensitively, so `Sam@Mail.com` and `sam@mail.com` are the same account. Stored in lowercase.
- **F1.R3** Password rules (NIST SP 800-63B-4 §3.1.1.2, for passwords used as the only login factor):
  - Length is 15 to 128 characters. Each Unicode code point counts as one character. (NIST requires at least 15 and says the maximum should be at least 64.)
  - Any characters are allowed, including spaces anywhere and Unicode. No composition rules (no forced digits, symbols or mixed case).
  - The password is never trimmed. Before length counting and hashing, it is Unicode-normalized to NFC, so the same password typed on different devices matches.
  - The whole password is verified, never cut short.
  - It is stored only as a salted Argon2id hash, the first choice in the OWASP Password Storage Cheat Sheet, using at least OWASP's current minimum settings (19 MiB memory, 2 iterations, 1 thread; the plan checks the live cheat sheet).
  - The plain password and the hash are never returned in any response and never logged.
- **F1.R4** A registration with an email that already has an account is rejected. No account is created, and the message says the email is taken.
- **F1.R5** A successful registration logs the new user in and sends them to the Trips screen. No email verification step.
- **F1.R6** Login takes email and password. A correct pair starts a session and always sends the user to the Trips screen, even when they reached Log in through a redirect from another page. A wrong email or wrong password gives the same general failure message, and no session starts. Email is matched the same way as in F1.R2.
- **F1.R7** A session lasts 30 days from login, whatever the activity, then ends; the user must log in again (NIST SP 800-63B-4 §2.2.3: overall timeout no more than 30 days). There is no inactivity timeout (optional at this level). Expiry is enforced on the server, not by the cookie's own expiry.
- **F1.R8** Logout ends the session in the current browser only, by deleting its server-side session record. Other browsers where the same user is logged in stay logged in.
- **F1.R9** A logged-out visitor who opens any trip page is redirected to the Log in screen. No trip content is rendered first.
- **F1.R10** A logged-out request to any trip endpoint gets `401 Unauthorized` and no trip data.
- **F1.R11** Every trip endpoint, from F2 on, runs two checks in order: (1) a logged-in user exists, (2) the trip's owner is that user. If the trip is owned by someone else, the response is `404 Not Found`, the same as for a trip that does not exist. F1 builds the shared check; F2–F6 must use it.
- **F1.R12** At registration, the password is rejected if it is on a blocklist (NIST SP 800-63B-4 §3.1.1.2). The blocklist is a bundled file, not an online service, and holds: common and previously breached passwords of 15 or more characters; words tied to this app (such as "trip expense tracker"); and the user's own email address or the part before the `@`. The whole password is compared, ignoring case. Per NIST, the list stays modest in size so it blocks the most-guessed passwords without frustrating users.
- **F1.R13** Failed logins are throttled per email address (NIST SP 800-63B-4 §3.2.2, increasing-wait method):
  - The count is kept for the normalized email as typed, whether or not an account exists, so throttling does not reveal which emails have accounts.
  - The first 5 consecutive failures have no wait.
  - After the 5th consecutive failure, the next attempt is allowed only after a wait of 30 seconds. Each further failure doubles the wait (1 minute, 2 minutes, 4 minutes, …), up to a maximum of 1 hour.
  - During a wait, login attempts for that email are refused without checking the password and do not add to the count.
  - A successful login resets the count to zero.
- **F1.R14** Password fields allow paste and password-manager autofill, and have a show/hide control so the user can check what they typed (NIST SP 800-63B-4 §3.1.1.2).

## Data & contract
**Schema (new):**
- `users`: `id`, `email` (lowercase, trimmed, unique, max 254), `password_hash` (Argon2id, includes its salt and settings), `created_at` (UTC). The unique constraint on `email` stops two simultaneous registrations from both succeeding (code review; see Test plan).
- `sessions`: `id_hash` (SHA-256 hex of the random session ID, which is at least 128 bits and only lives in the cookie), `user_id`, `created_at` (UTC), `expires_at` (UTC, `created_at` + 30 days). A new session ID is issued at every login and registration.
- `login_throttle`: `email` (normalized), `consecutive_failures`, `next_allowed_at` (UTC). The plan may store this elsewhere (for example in memory), as long as F1.R13 holds.

**Session cookie** (NIST SP 800-63B-4 §5.1): holds only the opaque session ID. Sent over HTTPS only (`Secure`), `HttpOnly`, `SameSite=Lax`, `Path=/`, `__Host-` prefix, and set to expire at or soon after `expires_at`. The server always checks `expires_at` itself.

**API (proposed; the plan may adjust paths and names, but not the behavior below):**

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `POST /api/register` | `{ email, password }` | `201` `{ user: { id, email } }` and session started | `400` with the failing field: invalid or too-long email, password too short or too long, password on the blocklist; `409` email already has an account |
| `POST /api/login` | `{ email, password }` | `200` `{ user: { id, email } }` and session started | `401` wrong email or password (one message for both); `429` too many failed attempts, with `Retry-After` in seconds |
| `POST /api/logout` | none | `204` and session ended in this browser | none |
| Any trip endpoint, logged out or session expired | any | none | `401` |
| Any trip endpoint, trip owned by another user (F2+) | any | none | `404` |

No response contains `password` or `password_hash`.

**Browser storage:** the session cookie only.

## States & errors
Copy below is final (wording delegated by the user; see Decisions log).

- **Register or Log in, email empty:** field error on Email. "Enter your email address."
- **Register, email in an invalid format or over 254 characters:** field error on Email. "Enter a valid email address, like name@example.com."
- **Register or Log in, password empty:** field error on Password. "Enter your password."
- **Register, password under 15 characters:** field error on Password. "Password must be at least 15 characters. A short phrase is easy to remember."
- **Register, password over 128 characters:** field error on Password. "Password must be 128 characters or fewer."
- **Register, password on the blocklist:** field error on Password. "This password is too common or easy to guess. Choose a different one."
- **Register, email already has an account:** field error on Email. "An account with this email already exists. Log in instead." ("Log in" links to the Log in screen.) Account existence is disclosed by choice (see Decisions log).
- **Log in, wrong email or password:** one form-level error, same text for both. "Email or password is incorrect." Password field is cleared.
- **Log in, throttled:** form-level error. "Too many failed attempts. Try again in {wait}." `{wait}` is the time left, rounded up, such as "30 seconds", "2 minutes" or "1 hour". Password field is cleared.
- **Session expired:** on the Log in screen after the redirect, a notice. "Your session has expired. Please log in again."
- **Any request fails with a server or network error:** form-level error. "Something went wrong. Please try again." Typed email is kept; password is cleared.
- **Loading:** while a register or log in request is running, the Submit button is disabled and shows a busy state, so a double-click cannot send two requests.
- **Empty state:** not applicable in F1.
- **Logged out:** a redirect, not an error page. No message is required.

## Accessibility
- Every input has a visible label (not only a placeholder).
- Errors are linked to their field (`aria-describedby`) and announced to screen readers (`role="alert"` on the form-level error).
- On a failed submit, focus moves to the first field with an error.
- Enter in either field submits the form. Tab order follows the visual order: Email, Password, Show password, Submit, then links.
- Email input uses `autocomplete="email"`. Password input uses `type="password"` with `autocomplete="new-password"` on Register and `current-password` on Log in. Paste is never blocked.
- The show/hide control is a button labelled "Show password" or "Hide password", with `aria-pressed`, reachable by keyboard. Showing the password does not move focus out of the field.
- On Register, the length rule ("At least 15 characters") is shown as hint text under the Password field before the user types, linked with `aria-describedby`.
- Text and error colors meet WCAG AA contrast (4.5:1 for body text).
- No animation is required. Any transition respects `prefers-reduced-motion`.

## Edge cases
- Email with leading or trailing spaces: trimmed, then checked (F1.R2).
- `Sam@Mail.com` registered, then `sam@MAIL.com` registered: rejected as email taken (F1.R2, F1.R4).
- Password of exactly 15 characters: accepted. 14: rejected. 128: accepted. 129: rejected (F1.R3).
- A password of 15 characters made of emoji or accented letters: counted by code point after NFC, so accented letters typed two different ways count the same (F1.R3).
- Password `my secret phrase` or ` my secret phrase`: accepted, and they are two different passwords. Logging in without the leading space fails (F1.R3).
- Password equal to the email address, or to the part before `@`, padded to 15 characters with the same text: rejected as too easy to guess (F1.R12).
- `Password1234567` and `password1234567`: both rejected if the list holds either, because the comparison ignores case (F1.R12).
- Visitor redirected to Log in from a trip page, then logs in: lands on the Trips screen, not the page they first opened (F1.R6).
- Two registrations with the same email at the same moment: one succeeds, the other gets the email-taken response. The database unique constraint decides this, not the app code.
- Log in on two browsers, then log out on one: the other browser stays logged in (F1.R8).
- Log out in a browser with no session, or an expired one: still shown the Log in screen, no error.
- Session exactly 30 days old: expired (F1.R7).
- Wrong password for a real email vs an unknown email: same message, same throttling, and the same hashing work, so the response time doesn't reveal which emails have accounts (F1.R6, F1.R13).
- Someone deliberately fails logins for another user's email: that user also has to wait, up to 1 hour per attempt after many failures, but is never locked out for good (Decisions log).
- Correct password sent during a wait: refused with the wait message; it does not log in and does not reset the count (F1.R13).

## Acceptance criteria
- **F1.AC1** Given no account for `sam@mail.com`, when a visitor registers with that email and a valid password of 15 or more characters, then an account is created, the password is stored only as an Argon2id hash, the visitor is logged in, and they land on the Trips screen.
- **F1.AC2** Given an account for `sam@mail.com`, when someone registers with `  SAM@Mail.com ` and any valid password, then no account is created and the response says the email is taken.
- **F1.AC3** Given a password of 14 characters, when a visitor registers, then the request is rejected with the at-least-15 message and no account is created; with 15 characters it is accepted.
- **F1.AC4** Given an email without an `@` or domain, or longer than 254 characters, when a visitor registers, then the request is rejected with the email-format message and no account is created.
- **F1.AC5** Given an account for `sam@mail.com`, when the user logs in with `SAM@mail.com` and the correct password, then they are logged in and land on the Trips screen.
- **F1.AC6** Given an account, when someone logs in with the wrong password or with an email that has no account, then the response is the same general failure, no session starts, and the password field is cleared.
- **F1.AC7** Given a logged-in user, when they log out, then the session ends in that browser, the Log in screen is shown, and a later trip request in that browser gets `401` or a redirect to login.
- **F1.AC8** Given the same user logged in on two browsers, when one browser logs out, then the other browser is still logged in.
- **F1.AC9** Given a logged-out visitor, when they open any trip page, then they are redirected to the Log in screen and no trip content is shown.
- **F1.AC10** Given a logged-out request to a trip endpoint, when it is sent, then the response is `401` and the body contains no trip data.
- **F1.AC11** Given a trip owned by user A, when user B passes the shared ownership check for that trip, then the check fails with not-found, the same result as for a trip that does not exist. (The full cross-user behavior through the API is proven in F2; see Dependencies.)
- **F1.AC12** Given any register or log in response, then the body contains no `password` or `password_hash` field.
- **F1.AC13** Given a visitor redirected to Log in from a trip page, when they log in successfully, then they land on the Trips screen.
- **F1.AC14** Given an account registered with a 128-character password, when the user logs in with the same password except for a change in the last character, then login fails.
- **F1.AC15** Given an account registered with the password ` my secret phrase` (leading space), when the user logs in with exactly ` my secret phrase`, then login succeeds; when they log in with `my secret phrase`, then login fails.
- **F1.AC16** Given a password of 129 characters, when a visitor registers, then the request is rejected with the 128-or-fewer message and no account is created.
- **F1.AC17** Given a password on the blocklist (in any letter case), or equal to the visitor's email or the part before `@`, when a visitor registers, then the request is rejected with the too-common message and no account is created.
- **F1.AC18** Given a password containing an accented letter, when the same password is typed in its composed and decomposed Unicode forms, then both forms log in successfully.
- **F1.AC19** Given 5 consecutive failed logins for an email, when a 6th attempt is made within 30 seconds, then it is refused with `429` and the wait message, without checking the password; after 30 seconds the attempt is allowed.
- **F1.AC20** Given consecutive failures past the 5th, when each further attempt fails, then the wait doubles each time and never exceeds 1 hour.
- **F1.AC21** Given an email with 3 consecutive failed logins, when the user then logs in successfully, then the failure count resets to zero.
- **F1.AC22** Given an email with no account, when failed logins are made for it, then it is throttled exactly as an existing account would be.
- **F1.AC23** Given a session created at time T, when a request arrives at T + 30 days or later, then the session is treated as ended: a trip page redirects to Log in with the expired notice, and a trip endpoint returns `401`.
- **F1.AC24** Given the Register or Log in screen, when the user presses "Show password", then the password is shown as plain text and the button reads "Hide password"; pasting into the field works.

## Dependencies
- **Build order:** step 1. F2–F6 depend on this feature. No feature may add a trip endpoint without the F1.R10 and F1.R11 checks.
- **Cross-user test:** the criterion "a user cannot see another user's trip" (product.md §3 F1 done-when) is proven when F2 adds trips. F1 proves the shared check itself (F1.AC11). The F2 spec must list this as its own acceptance criterion.
- **External services:** none. No email service and no online breach check.
- **Libraries and files:** an Argon2id library, and a bundled blocklist file whose source the plan names. Both are chosen in the plan.

## Test plan
Unit tests only (project-rules.md). Each test names its AC ID in the test name. Time-based rules (F1.AC19–AC20, F1.AC23) use an injected fake clock, never the real time.

| AC | How it is proven |
|---|---|
| F1.AC1 | Unit: registration service with a fake user store. Stored record holds an Argon2id hash, not the password. Session created. Redirect target is Trips. |
| F1.AC2 | Unit: registration with fake store; email comparison ignores case and surrounding spaces. |
| F1.AC3 | Unit: password validation (14 rejected, 15 accepted). |
| F1.AC4 | Unit: email validation with invalid, valid and 255-character samples. |
| F1.AC5 | Unit: login with fake store; normalized email matches. |
| F1.AC6 | Unit: login failure paths return the same message and start no session. |
| F1.AC7 | Unit: logout removes the session record for that browser; guard then rejects. |
| F1.AC8 | Unit: fake session store with two sessions for one user; logout of one leaves the other valid. |
| F1.AC9 | Unit: page guard with no session returns a redirect to login. |
| F1.AC10 | Unit: endpoint guard with no session returns 401 with no data. |
| F1.AC11 | Unit: ownership helper with a trip owned by A and a request from B returns not-found. |
| F1.AC12 | Unit: response builders exclude `password` and `password_hash`. |
| F1.AC13 | Unit: login success returns the Trips screen as the target, whatever page triggered the redirect. |
| F1.AC14 | Unit: hash and verify with the real hashing function (no database needed). |
| F1.AC15 | Unit: registration and login with a fake store keep spaces as typed; only the exact password verifies. |
| F1.AC16 | Unit: password validation (128 accepted, 129 rejected). |
| F1.AC17 | Unit: blocklist check with a small fake list, mixed-case input, and email-derived passwords. |
| F1.AC18 | Unit: normalization turns both Unicode forms into the same string before hashing. |
| F1.AC19 | Unit: throttle with a fake clock; 6th attempt inside 30 seconds refused, allowed after. |
| F1.AC20 | Unit: throttle with a fake clock; waits of 30 s, 1 min, 2 min … capped at 1 hour. |
| F1.AC21 | Unit: throttle count resets on success. |
| F1.AC22 | Unit: throttle keyed by email gives the same result for unknown and known emails. |
| F1.AC23 | Unit: session check with a fake clock at T + 30 days returns expired. |
| F1.AC24 | Unit (headless browser component test): toggle changes the input type and button label; no paste blocking. |
| Duplicate email under concurrency (Edge cases) | Code review: unique constraint on `users.email` exists in the migration. |
| Cookie attributes and server-side expiry (Data & contract) | Code review: `Secure`, `HttpOnly`, `SameSite=Lax`, `__Host-` prefix set; expiry read from `sessions.expires_at`. |
| No sensitive data in logs (product.md §6) | Code review: no password, hash or session ID is passed to the logger. |

## Open questions
None.

## Decisions log
- 2026-11-15: Session length → Until the user logs out (no expiry). Known trade-off: a lost or shared device stays logged in. Authentication changes need a person to review and approve (project-rules.md).
- 2026-11-15: Minimum password length → 8 characters.
- 2026-11-15: Email already registered → Say the email is taken (accepts that this reveals which emails have accounts).
- 2026-11-15: Login attempt limits → None in F1. Known gap; revisit before launch.
- 2026-11-15: After sign-up → Logged in and sent to the Trips screen.
- 2026-11-15: Logged-out visitor opens a trip page → Redirect to the Log in screen.
- 2026-11-15: Logout → Ends the session in this browser only.
- 2026-11-15: Email comparison → Trimmed and case-insensitive; stored in lowercase.
- 2026-11-15: Trip owned by another user → `404 Not Found`, same as a missing trip.
- 2026-11-15: Logged-out trip API call → `401 Unauthorized`.
- 2026-11-15: Proof of the cross-user criterion → Done in F2, with F1 proving the shared check.
- 2026-11-15: Spec approved by the user, with the four open questions still open.
- 2026-11-15: Maximum email and password length → None.
- 2026-11-15: After log in from a redirect → Always the Trips screen.
- 2026-11-15: Login attempt limits before launch → None. This replaces the earlier "revisit before launch" note; repeated wrong passwords are never blocked.
- 2026-11-15: Status set back to Draft, because these answers changed requirements (F1.R3, F1.R6) and added F1.AC13–AC14. Needs re-approval before `/plan-feature F1`.
- 2026-11-15: Message wording → Delegated to Claude; final copy written in States & errors.
- 2026-11-15: Spaces in passwords → Not allowed anywhere; passwords are never trimmed (F1.R3, F1.AC15).
- 2026-11-15: Spaces in passwords (changed) → Allowed anywhere; passwords are still never trimmed. The "Password can't contain spaces." message is removed, and F1.AC15 now checks that spaces count as typed.
- 2026-11-15: Password and security details → The user asked to follow recommended guidelines from trusted sources, since they are not familiar with the particulars. Applied NIST SP 800-63B-4 (checked on pages.nist.gov) and the OWASP Password Storage Cheat Sheet. This replaces these earlier answers:
  - Minimum password length 8 → 15 (NIST requires 15 when the password is the only login factor; 8 is only for multi-factor).
  - No maximum length → passwords up to 128 characters (NIST: allow at least 64 and a limit is reasonable); emails up to 254 (RFC 5321).
  - No login attempt limit → increasing waits after 5 failures, up to 1 hour (NIST requires rate limiting).
  - Session until logout → 30 days, then log in again (NIST: no more than 30 days at this level).
  - Added: blocklist of common passwords, Unicode normalization, Argon2id hashing, paste and password-manager support, a show/hide control, and session cookie rules.
  - Kept: spaces allowed and never trimmed (NIST says spaces should be accepted); same message for wrong email or password; logout in this browser only.
  - Kept against the usual OWASP advice: the "email already exists" message. OWASP prefers a generic sign-up response, but that only works when a confirmation email can be sent, and the MVP has no email (product.md §4). The disclosure is limited to the Register screen; login and throttling reveal nothing.
- 2026-11-15: NIST hard limit of 100 failed attempts → Not applied; waits only (F1.R13). NIST SP 800-63B-4 §3.2.2 says the password must be disabled after at most 100 consecutive failures until the account is recovered, but the MVP has no recovery (product.md §4), so that would lock users out for good. Accepted deviation for the MVP; the waits cap guessing at about one try per hour.
- 2026-11-15: Spec re-approved by the user (14 requirements, 24 acceptance criteria, no open questions).
