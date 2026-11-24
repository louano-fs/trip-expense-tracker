# API

Endpoints of the back end (`app/api`). Kept up to date as features are built. Paths are relative to the API origin. Bodies are JSON.

Source of the rules: `docs/specs/features/F1-registration-and-login.md` (F1.R1 to F1.R10).

## Auth (F1)

### POST /api/register
Creates an account, logs the new user in and starts a session (F1.R1, F1.R4, F1.R5).

Request: `{ "email": string, "password": string }`

| Status | When | Body |
|---|---|---|
| 201 | Account created | `{ "user": { "id": number, "email": string } }` and a session cookie |
| 400 | Email empty, invalid or over 254 characters; password under 15 or over 128 characters; password on the blocklist | `{ "error": string, "field": "email" \| "password" }` and no cookie |
| 409 | Email already has an account | `{ "error": string, "field": "email" }` and no cookie |

### POST /api/login
Logs in and starts a session (F1.R6, F1.R13).

Request: `{ "email": string, "password": string }`

| Status | When | Body |
|---|---|---|
| 200 | Correct email and password | `{ "user": { "id": number, "email": string } }` and a session cookie |
| 401 | Wrong email or wrong password (one message for both) | `{ "error": "Email or password is incorrect." }` and no cookie |
| 429 | Too many failed attempts; a wait applies | `{ "error": string }` with `Retry-After` in seconds, and no cookie |

### POST /api/logout
Ends the session in this browser only (F1.R8). Always clears the session cookie, even when there is no session.

Request: none.

| Status | When | Body |
|---|---|---|
| 204 | Always | No body, and a cookie that clears the session |

### Session cookie
Set by register and login (F1.R7):
- Name `__Host-sid`. Value is the opaque session ID only.
- Attributes: `HttpOnly; Secure; SameSite=Lax; Path=/`, `Max-Age` 30 days (2592000 seconds), and `Expires` set to the session expiry.
- `Secure` follows config (`cookieSecure`). Only the test-only override `TEST_ALLOW_INSECURE_COOKIES=true` turns it off.
- The server checks the session expiry on every request. The cookie's own expiry is not trusted alone.

## Trips (F2)

Every trip endpoint needs a live session (F1.R10). Each trip is owned by the user who created it, and a user only ever sees or changes their own trips (F2.R11). Trip names are trimmed and must be 1 to 100 characters (F2.R2). `createdAt` is UTC, ISO 8601. No trip response includes `owner_id` or any data about another user (F2.AC13).

### Logged-out trip requests (F1.R10, F2.AC9)
Every trip endpoint, called with no cookie or an expired session, returns the same `401` with no trip data.

| Status | When | Body |
|---|---|---|
| 401 | No session cookie, or the cookie is not the session cookie | `{ "error": "Unauthorized" }`, with no `reason` key |
| 401 | A session cookie was sent, but no live session matched (unknown, or 30 days reached) | `{ "error": "Unauthorized", "reason": "expired" }` |

`reason` is only ever `"expired"`, and only on a 401 (F1.R7, F1.AC23). The web app uses it to show the expired notice on the Log in screen. The 401 body never contains trip data (F1.AC10).

### GET /api/trips
The logged-in user's trips, newest first (by creation time, then ID). All of them, with no paging (F2.R5).

| Status | When | Body |
|---|---|---|
| 200 | Live session | `{ "trips": [{ "id": number, "name": string, "createdAt": string }] }`; an empty array when the user has no trips |
| 401 | Logged out (see above) | as above |

### POST /api/trips
Creates a trip owned by the logged-in user (F2.R1, F2.R2, F2.R3).

Request: `{ "name": string }`

| Status | When | Body |
|---|---|---|
| 201 | Name is valid after trimming | `{ "trip": { "id": number, "name": string, "createdAt": string } }` |
| 400 | Name is empty or only spaces, or over 100 characters | `{ "field": "name", "message": string }`; no trip is created |
| 401 | Logged out (see above) | as above |

The `message` is `"Enter a trip name."` for an empty name and `"Trip name must be 100 characters or fewer."` for a long one. A missing or non-text `name` is treated as empty.

### GET /api/trips/:id
One trip the logged-in user owns (F2.R11).

| Status | When | Body |
|---|---|---|
| 200 | Trip exists and the user owns it | `{ "trip": { "id": number, "name": string, "createdAt": string } }` |
| 401 | Logged out (see above) | as above |
| 404 | Trip does not exist, was deleted, or belongs to another user | `{ "error": "Trip not found" }` (the same body in every case) |

### DELETE /api/trips/:id
Deletes a trip the logged-in user owns, with everything in it (people, expenses and payments), in one transaction (F2.R8, F2.R9, F2.R11). The web app asks the user to confirm first (F2.R8).

Request: none.

| Status | When | Body |
|---|---|---|
| 204 | Trip exists and the user owns it; it and its contents are deleted | No body |
| 401 | Logged out (see above) | as above |
| 404 | Trip does not exist, was already deleted, or belongs to another user; nothing changes | `{ "error": "Trip not found" }` (the same body in every case) |

An ID that is not a positive whole number is treated as a missing trip and gets the same `404`.

## Errors

Unexpected failures return `500` with `{ "error": "Something went wrong. Please try again." }`. The request body and cookies are never logged.

## Responses never contain
`password` or `password_hash` fields, and no session token outside the `Set-Cookie` header (F1.AC12).
