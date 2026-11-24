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

### Logged-out trip requests (F1.R10)
Any trip endpoint (from F2 on) called with no cookie or an expired session returns `401` with no trip data. The trip endpoints themselves are added in F2.

### GET /api/trips (placeholder in F1)
A guarded placeholder for the trip list (F1.R10). It reads no trip data and F1 has no trips, so a live session gets an empty list. F2 replaces it with the real list.

| Status | When | Body |
|---|---|---|
| 401 | No session cookie, or the cookie is not the session cookie | `{ "error": "Unauthorized" }`, with no `reason` key |
| 401 | A session cookie was sent, but no live session matched (unknown, or 30 days reached) | `{ "error": "Unauthorized", "reason": "expired" }` |
| 200 | Live session | `{ "trips": [] }` |

### GET /api/trips/:id (placeholder in F1)
A guarded placeholder that proves the login gate (F1.R10). It reads no trip data. F2 replaces it with the real trip endpoint.

| Status | When | Body |
|---|---|---|
| 401 | No session cookie, or the cookie is not the session cookie | `{ "error": "Unauthorized" }`, with no `reason` key |
| 401 | A session cookie was sent, but no live session matched (unknown, or 30 days reached) | `{ "error": "Unauthorized", "reason": "expired" }` |
| 404 | Live session (F1 has no trips yet) | `{ "error": "Trip not found." }` |

`reason` is only ever `"expired"`, and only on a 401 (F1.R7, F1.AC23). The web app uses it to show the expired notice on the Log in screen. The 401 body never contains trip data (F1.AC10).

## Errors

Unexpected failures return `500` with `{ "error": "Something went wrong. Please try again." }`. The request body and cookies are never logged.

## Responses never contain
`password` or `password_hash` fields, and no session token outside the `Set-Cookie` header (F1.AC12).
