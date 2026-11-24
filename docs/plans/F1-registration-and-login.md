# Plan F1 — Registration and login

_Status: Approved (2026-11-15) · Last updated: 2026-11-15 · Spec: [F1-registration-and-login.md](../specs/features/F1-registration-and-login.md) · Spec version: 2026-11-15_

## Summary
This plan builds the app skeleton, the SQLite schema, registration, login and logout with Argon2id hashing, the 30-day server-side session, login throttling, the shared login and ownership checks that F2–F6 reuse, and the register/log-in screens with a Trips placeholder. It has 12 tasks. Eleven are marked **Needs person review**, because they change authentication, the database schema, or cookie handling (project-rules.md "Working with AI"). Only T1 (scaffolding) does not.

## Stack and conventions
From `CLAUDE.md`:
- **Back end:** Node.js (current LTS, pinned in `app/api/package.json` `engines`) + TypeScript (`strict`) + Express 5, in `app/api/`. Tests in `app/api/src/**/*.test.ts`.
- **Front end:** React + Vite + TypeScript, in `app/web/`. Tests in `app/web/src/**/*.test.tsx`, with jsdom and React Testing Library.
- **Database:** SQLite, one file, `PRAGMA foreign_keys = ON`.
- **Tests:** Vitest in both apps. Unit test command in each app: `npm test` (`vitest run`). Type check: `npm run typecheck`. Package manager: npm.
- **Libraries added by this plan** (added to the CLAUDE.md list in T1): `express`, `better-sqlite3`, `@node-rs/argon2`, `pino`, `cookie` (parse and serialize only), and dev-only `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `typescript`, `vite`.
- **Logs:** the project logger (`pino`). No `console.*`.

## Choices the spec left to the plan
| Spec ref | Choice | Why / source |
|---|---|---|
| F1.R3 | Argon2id via `@node-rs/argon2`, 19 MiB memory (`memoryCost` 19456 KiB), 2 iterations, parallelism 1 | The spec's numbers match the live OWASP Password Storage Cheat Sheet (checked for this plan). The library ships prebuilt Windows binaries. User's answer (Decisions log). |
| F1.R3 | NFC normalization, then code-point counting, then hash | Spec wording. Implemented with `String.prototype.normalize('NFC')` and `[...str].length`. |
| F1.R12 | Blocklist from SecLists (MIT), filtered to entries of 15+ characters, plus app words and the email-derived rule. Bundled as `app/api/src/auth/blocklist.txt`, loaded once at start | User's answer (Decisions log). Keeps the list modest per the spec. T2 downloads it once and a person reviews the file. |
| F1.R13 | Throttle state in a `login_throttle` table (not in memory) | The spec's data section lists the table, and the count must survive a server restart. Spec allows either. |
| F1.R7 / Data | Session ID: 32 random bytes, base64url in the cookie. The DB stores `SHA-256(token)` as `sessions.id` | A copy of the database then cannot be used to log in. Matches the spec's "opaque, at least 128 bits". OWASP Session Management advice. |
| F1.R7 | Expiry check uses `sessions.expires_at` and the injected clock, never the cookie's `Expires` | Spec F1.R7 (server enforces). |
| F1.R6 / F1.AC6 | A dummy Argon2id hash is verified when the email is unknown | Keeps response time the same for known and unknown emails (spec Edge cases). |
| F1.R2 | Email checks in plain functions: trim, lowercase, format regex, length ≤ 254 | CLAUDE.md "Keep rules and validation in plain functions". No validation library needed. |
| F1.R13 | Wait times: `min(30 s × 2^(n−6), 3600 s)` for failure count `n` ≥ 5 (30 s at 5th, 60 s at 6th, …) | Spec F1.R13 and AC19–AC20. |
| Architecture | Express 5 | Current major version; handles async errors in handlers. |
| Logging | `pino` with `redact` on password-like fields and the Cookie header | Project rules: no sensitive data in logs. Defence in depth; code review still checks. |
| Session cookie | Name `__Host-sid`, `HttpOnly; Secure; SameSite=Lax; Path=/`, `Max-Age` 30 days | Spec "Session cookie". `cookie` package to serialize. |

## Approach
**Back end (`app/api/src/`):**
- `config.ts`: reads environment variables (database file path, port, cookie `Secure` flag on/off for tests only, blocklist path). Pure function `loadConfig(env)`.
- `logger.ts`: one `pino` instance, with redaction paths.
- `db/`: `open.ts` (better-sqlite3, foreign keys on, WAL), `migrate.ts` (runs numbered SQL migrations in one transaction each, records the version), `migrations/001-auth.sql`, `repositories/users.ts`, `sessions.ts`, `throttle.ts`. Each repository takes a `db`-like interface, so unit tests pass a fake that records SQL text and parameters.
- `auth/validation.ts`: email and password rules (pure functions, `now`-free).
- `auth/blocklist.ts` and `auth/blocklist.txt`: `isBlockedPassword(password, email, list)`; the list is passed in.
- `auth/password.ts`: `hashPassword`, `verifyPassword`, `DUMMY_HASH`, all Argon2id calls go through this one file.
- `auth/sessions.ts`: `createSession`, `resolveSession`, `deleteSession`; token generation and hashing; pure functions over an injected store and clock.
- `auth/throttle.ts`: `throttleDecision(state, now)` and `recordFailure` / `recordSuccess` as pure functions; the store is injected.
- `auth/register.ts`, `auth/login.ts`: services. Take `{ userStore, sessions, hasher, clock, throttleStore, blocklist }` as arguments. Return plain results, not HTTP.
- `auth/guards.ts`: `ownsTrip(trip, userId)` (F1.R11, returns `'not-found'` or `'ok'`), `apiGuard` (401), `pageGuard` (redirect decision with expired notice).
- `http/`: `app.ts` builds the Express app from injected services; `routes/auth.ts`, `routes/trips-placeholder.ts` (no data yet, only the guard), `errors.ts` (the Express error handler; logs without sensitive data).

**Front end (`app/web/src/`):**
- `api/client.ts`: `register`, `login`, `logout`, `getSession`-free (the server decides); `ApiError` with status and `retryAfter`.
- `pages/LogIn.tsx`, `pages/Register.tsx`, `pages/Trips.tsx` (placeholder), `components/PasswordField.tsx` (show/hide), `components/RequireSession.tsx`.
- Form validation messages come from `app/web/src/copy.ts` (the final copy from the spec's States & errors). Server messages are shown as they come back.

Reused by later features: `auth/guards.ts` (`ownsTrip`, `apiGuard`, `pageGuard`), `db/open.ts`, `db/migrate.ts`, `logger.ts`, `http/app.ts`.

## Data and API changes
**Tables (new, migration `001-auth.sql`):** the spec's Data & contract section defines `users`, `sessions`, `login_throttle`. This plan adds:
- Index on `sessions(user_id)` and on `sessions(expires_at)`.
- `users.email` unique index (named `users_email_key`).
- `login_throttle.email` is the primary key.
- Foreign key `sessions.user_id` → `users.id` with `ON DELETE CASCADE`.
- Times stored as UTC ISO 8601 text.
- `docs/specs/data-model.md` is created by T4.

**Endpoints (new, documented in `docs/specs/api.md` by T9):** the spec's table, unchanged:
- `POST /api/register`, `POST /api/login`, `POST /api/logout`.
- Trip endpoints are not added in F1. The guards are tested with fakes.
- Page route `/trips` (placeholder) and the guarded trip-page route `/trips/:id` shell (F2 fills it) are added in T11.

## Tasks
### F1.T1 — Scaffold the two apps and their tooling
- **Builds:** none (foundation for all requirements)
- **Proves:** none. Supports F1.AC12 and the "no sensitive data in logs" check by setting up redaction.
- **Depends on:** none
- **Files:** `app/api/package.json`, `app/api/tsconfig.json`, `app/api/vitest.config.ts`, `app/api/src/config.ts`, `app/api/src/config.test.ts`, `app/api/src/logger.ts`, `app/api/src/logger.test.ts`, `app/api/src/index.ts`, `app/web/package.json`, `app/web/tsconfig.json`, `app/web/vite.config.ts`, `app/web/vitest.config.ts`, `app/web/src/main.tsx`, `app/web/src/App.tsx`, `app/web/index.html`, `app/web/src/App.test.tsx`, `CLAUDE.md` (library list only), `.gitignore` (add `*.sqlite`, `app/api/data/`)
- **Steps:**
  1. In `app/api`, run `npm init`, set `engines.node` to the current LTS, install the listed runtime libraries and dev libraries, add scripts `dev`, `test` (`vitest run`), `typecheck` (`tsc --noEmit`).
  2. Set `strict: true` in `tsconfig.json`. Add a `vitest.config.ts` with the `node` environment.
  3. Write `loadConfig(env)` with defaults and required values checked. Write `createLogger(options)` with `pino` and `redact` paths for `password`, `password_hash`, `cookie`, `set-cookie`, `req.headers.cookie`.
  4. Scaffold `app/web` with Vite's React-TypeScript template, add `jsdom`, `@testing-library/react`, `@testing-library/user-event`, add `test` (`vitest run`) and `typecheck` scripts, and a `App.test.tsx` smoke test that renders the root component.
  5. Add the new libraries to the CLAUDE.md "Stack" section (one line each).
  6. Run `npm test` and `npm run typecheck` in both apps.
- **Tests:** `config.test.ts`: missing required variable throws; defaults applied; `Secure` cookie flag is true unless the test-only override is set (no AC; supports F1.R7). `logger.test.ts`: a logged object with `password` and `cookie` fields has them replaced with `[Redacted]` (supports F1.AC12 and the logging rule). Fakes: a memory writable stream for pino. `App.test.tsx`: renders without error.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api` and `app/web`, and the apps start with `npm run dev`.
- **Needs person review:** no
- **Commit:** `F1.T1: Scaffold API and web apps with tooling`

### F1.T2 — Email and password rules, and the blocklist
- **Builds:** F1.R2, F1.R3 (length and no trimming), F1.R12
- **Proves:** F1.AC2 (email normalization part), F1.AC3, F1.AC4, F1.AC16, F1.AC17
- **Depends on:** F1.T1
- **Files:** `app/api/src/auth/validation.ts`, `app/api/src/auth/validation.test.ts`, `app/api/src/auth/blocklist.ts`, `app/api/src/auth/blocklist.test.ts`, `app/api/src/auth/blocklist.README.md`
- **Steps:**
  1. Write `normalizeEmail(raw)`: trim, lowercase. `validateEmail(normalized)`: regex format check, length ≤ 254. Returns `{ ok: true, email }` or `{ ok: false, field: 'email', message }`.
  2. Write `validatePasswordLength(password)`: NFC normalize (without trimming), count code points; 15 ≤ n ≤ 128. Return the field error with the spec's exact copy.
  3. Add a short starter list of common passwords as an exported constant in `blocklist.ts`: about 20 entries of 15+ characters, lowercased, including the app words ("trip expense tracker", "expense tracker"; "trip expense" is left out because it is under 15 characters). No file download. Record in `blocklist.README.md` that the list is a small starter set written for this project, and that a full list is a later follow-up.
  4. Write `isBlockedPassword(password, email, list)`: compares case-insensitively with the list, with the email, and with the part before `@`, after NFC normalization.
- **Tests:** `validation.test.ts`: F1.AC2 (`'  SAM@Mail.com '` normalizes to `sam@mail.com`), F1.AC4 (no `@`, no domain, 255-character email rejected; a valid one accepted), F1.AC3 (14 rejected, 15 accepted), F1.AC16 (128 accepted, 129 rejected). `blocklist.test.ts`: F1.AC17 (blocked entry in any case; the email and the part before `@` padded to 15 characters are blocked; a non-listed password passes). Fakes: a small in-test list passed as argument. `blocklist.test.ts` also checks that every entry in the starter constant is 15+ characters.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/api`; every entry in the starter list is 15+ characters.
- **Needs person review:** yes (authentication: password rules).
- **Commit:** `F1.T2: Add email and password rules and blocklist`

### F1.T3 — Password hashing with Argon2id
- **Builds:** F1.R3 (hashing, NFC before hashing, no trimming)
- **Proves:** F1.AC14, F1.AC15, F1.AC18
- **Depends on:** F1.T1, F1.T2
- **Files:** `app/api/src/auth/password.ts`, `app/api/src/auth/password.test.ts`
- **Steps:**
  1. `hashPassword(password)`: NFC normalize, then `argon2.hash` with `algorithm: Argon2id`, `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`. The output includes the salt and settings.
  2. `verifyPassword(stored, password)`: NFC normalize, then verify. Returns boolean; never throws on a bad hash (log a warning without the hash).
  3. `DUMMY_HASH`: computed once at module load with the same settings, used by login when the email is unknown.
- **Tests:** F1.AC14: a 128-character password verifies, and the same password with the last character changed does not. F1.AC15: a password with a leading space verifies with the leading space, and without it does not. F1.AC18: the composed and decomposed forms of an accented password both verify. A test checks the stored hash starts with `$argon2id$` and that the parameters match the spec. Fakes: none (the hash runs in-process; no database or network).
- **Done when:** `npm test` passes and the stored hash string shows `m=19456,t=2,p=1`.
- **Needs person review:** yes (authentication: password storage, Argon2 settings).
- **Commit:** `F1.T3: Add Argon2id password hashing`

### F1.T4 — Database connection, migration and repositories
- **Builds:** F1.R2 (unique stored email), data model for F1.R4, F1.R7, F1.R13
- **Proves:** none directly. Supports F1.AC1, F1.AC7, F1.AC13 (through the stores).
- **Depends on:** F1.T1
- **Files:** `app/api/src/db/open.ts`, `app/api/src/db/migrate.ts`, `app/api/src/db/migrate.test.ts`, `app/api/src/db/migrations/001-auth.sql`, `app/api/src/db/repositories/users.ts`, `app/api/src/db/repositories/sessions.ts`, `app/api/src/db/repositories/throttle.ts`, `app/api/src/db/repositories.test.ts`, `docs/specs/data-model.md`
- **Steps:**
  1. `open.ts`: open the file with better-sqlite3, run `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`.
  2. `001-auth.sql`: `CREATE TABLE users (...)`, `sessions` with FK `user_id` → `users.id` `ON DELETE CASCADE`, `login_throttle`, and the indexes from the Data and API section.
  3. `migrate.ts`: create `schema_migrations`, apply each pending file in order, each inside one transaction together with its version record.
  4. Repositories take a `Db` interface (`run`, `get`, `all`) and use only `?` parameters. Functions: `insertUser`, `findUserByEmail`; `insertSession`, `findSessionByHash`, `deleteSession`; `getThrottle`, `saveThrottle`, `clearThrottle`.
  5. Write `docs/specs/data-model.md` with the tables and fields.
- **Tests:** `migrate.test.ts`: with a fake `Db` that records statements, migrations run in order once, a failing migration rolls back and throws (not swallowed). `repositories.test.ts`: with a fake `Db` that records SQL and params, each function uses `?` placeholders and passes values as parameters (no string joining); `insertUser` maps a unique-violation error to a typed `EmailTakenError` (supports F1.AC2 / F1.AC1 concurrency). Fakes: fake `Db`. No real SQLite file in unit tests.
- **Done when:** `npm test` and `npm run typecheck` pass; `data-model.md` matches the migration.
- **Needs person review:** yes (database migration; the unique constraint and foreign keys are checked in review).
- **Commit:** `F1.T4: Add auth schema, migration and repositories`

### F1.T5 — Sessions: create, resolve and end, with 30-day expiry
- **Builds:** F1.R7, F1.R8
- **Proves:** F1.AC7 (session part), F1.AC8, F1.AC23
- **Depends on:** F1.T4
- **Files:** `app/api/src/auth/sessions.ts`, `app/api/src/auth/sessions.test.ts`
- **Steps:**
  1. `createSession({ userId, store, clock })`: token = 32 random bytes (base64url); store `SHA-256(token)` as `id`, `created_at` and `expires_at = now + 30 days` (UTC). Returns the raw token for the cookie.
  2. `resolveSession({ token, store, clock })`: look up by hash; if missing or `now >= expires_at`, return `null` (and delete the expired record).
  3. `endSession({ token, store })`: delete the record for this token only.
  4. The random source and clock are passed in, so tests can fix them.
- **Tests:** F1.AC23: a session created at T is `null` at T + 30 days and valid at T + 30 days − 1 second. F1.AC7 (session part): after `endSession`, `resolveSession` returns `null`. F1.AC8: two sessions for one user; ending one leaves the other valid. Fakes: in-memory session store, fake clock, fake random source returning fixed bytes.
- **Done when:** `npm test` passes and no test calls the real clock.
- **Needs person review:** yes (authentication: session lifetime and token handling).
- **Commit:** `F1.T5: Add session create, resolve and end`

### F1.T6 — Registration service
- **Builds:** F1.R1, F1.R2 (use), F1.R3 (use), F1.R4, F1.R5, F1.R12 (use)
- **Proves:** F1.AC1, F1.AC2, F1.AC3, F1.AC4, F1.AC12 (register response), F1.AC16, F1.AC17
- **Depends on:** F1.T2, F1.T3, F1.T4, F1.T5
- **Files:** `app/api/src/auth/register.ts`, `app/api/src/auth/register.test.ts`, `app/api/src/auth/responses.ts`, `app/api/src/auth/responses.test.ts`
- **Steps:**
  1. `register({ email, password }, deps)`: validate email (T2), validate password length and blocklist (T2), `hashPassword` (T3), insert user (T4). On `EmailTakenError` return "taken". Create session (T5). Return `{ ok: true, user, token }`.
  2. Field errors return `{ ok: false, status: 400, field, message }`; a taken email returns `{ ok: false, status: 409, field: 'email', message }` with the spec's copy.
  3. `responses.ts`: `userView(user)` returns only `{ id, email }`.
- **Tests:** F1.AC1 with fake user store and fake hasher: stored record holds the hash, not the password; session created; result targets Trips. F1.AC2: the second `  SAM@Mail.com ` gets 409. F1.AC3, F1.AC4, F1.AC16, F1.AC17: each validation returns the expected 400 field error and creates no user (fake store records zero inserts). F1.AC12: `userView` output has no `password` or `password_hash` keys. Fakes: fake user store, fake hasher, fake session store, fixed clock.
- **Done when:** `npm test` passes.
- **Needs person review:** yes (authentication: registration).
- **Commit:** `F1.T6: Add registration service`

### F1.T7 — Login throttling
- **Builds:** F1.R13
- **Proves:** F1.AC19, F1.AC20, F1.AC21, F1.AC22
- **Depends on:** F1.T4
- **Files:** `app/api/src/auth/throttle.ts`, `app/api/src/auth/throttle.test.ts`
- **Steps:**
  1. Pure `throttleDecision(state, now)`: if `consecutive_failures < 5` allowed; otherwise allowed when `now >= next_allowed_at`; returns `{ allowed: false, waitSeconds }` rounded up.
  2. Pure `recordFailure(state, now)`: count + 1; from the 5th failure, `next_allowed_at = now + min(30 × 2^(count − 5) s, 3600 s)`. Count is kept whether or not the account exists.
  3. `recordSuccess` → count 0, `next_allowed_at` null.
  4. The store (T4 `throttle` repository) is passed in; the service key is the normalized email.
- **Tests:** F1.AC19: after 5 failures, a 6th attempt at +29 s is refused with wait 1 s, at +30 s allowed. F1.AC20: waits 30 s, 60 s, 120 s, … and 3600 s cap at most. F1.AC21: 3 failures then success resets to 0. F1.AC22: throttle state for an unknown email is identical in shape and result to a known one. Fakes: fake throttle store, fake clock.
- **Done when:** `npm test` passes.
- **Needs person review:** yes (authentication: brute-force protection).
- **Commit:** `F1.T7: Add login throttling`

### F1.T8 — Login service
- **Builds:** F1.R6, F1.R13 (use)
- **Proves:** F1.AC5, F1.AC6, F1.AC12 (login response)
- **Depends on:** F1.T2, F1.T3, F1.T4, F1.T5, F1.T7
- **Files:** `app/api/src/auth/login.ts`, `app/api/src/auth/login.test.ts`
- **Steps:**
  1. `login({ email, password }, deps)`: normalize email; check throttle (T7); look up user; verify against the user's hash, or against `DUMMY_HASH` when the user is missing (same work either way).
  2. On wrong email or password: record failure, return `{ ok: false, status: 401, message: 'Email or password is incorrect.' }`, starts no session. Inside a wait: return `429` with `retryAfterSeconds` and the wait message; do not verify, do not add to the count.
  3. On success: record success, create session, return `{ ok: true, user, token }`.
- **Tests:** F1.AC5: `SAM@mail.com` with the correct password logs in when stored as `sam@mail.com`. F1.AC6: wrong password and unknown email return the same 401 object, no session is created (fake session store empty), and `verifyPassword` is called in both cases. F1.AC12: `userView` has no password fields. F1.AC6 + F1.R13 wait: a correct password during a wait returns 429 and does not reset the count. Fakes: fake user store, fake hasher, fake throttle store, fake session store, fixed clock.
- **Done when:** `npm test` passes.
- **Needs person review:** yes (authentication: login).
- **Commit:** `F1.T8: Add login service`

### F1.T9 — Auth guards: session check, login gate, ownership check
- **Builds:** F1.R9 (decision), F1.R10, F1.R11
- **Proves:** F1.AC9 (guard decision), F1.AC10, F1.AC11, F1.AC23 (guard result)
- **Depends on:** F1.T5
- **Files:** `app/api/src/auth/guards.ts`, `app/api/src/auth/guards.test.ts`
- **Steps:**
  1. `apiGuard({ token, sessions, clock })` → `{ ok: true, user }` or `{ ok: false, status: 401 }` with no data.
  2. `pageGuard({ token, sessions, clock })` → `{ ok: true }` or `{ redirect: '/login', notice: 'expired' | undefined }`. A missing cookie gives no notice; an expired one gives the notice.
  3. `ownsTrip(trip, userId)`: returns `'ok'` when `trip.owner_id === userId`, else `'not-found'`. Used by F2–F6 in this order: apiGuard first, then ownsTrip.
- **Tests:** F1.AC9: no session → redirect to `/login` with no notice; expired session → redirect with the expired notice. F1.AC10: no session → 401 and the body has no trip data. F1.AC11: trip owned by A, user B → `'not-found'`, same as a missing trip. F1.AC23: at T + 30 days, page guard redirects with notice and API guard returns 401. Fakes: fake session store, fixed clock.
- **Done when:** `npm test` passes.
- **Needs person review:** yes (authentication and the ownership check).
- **Commit:** `F1.T9: Add session, login-gate and ownership guards`

### F1.T10 — HTTP routes for register, log in and log out
- **Builds:** F1.R1, F1.R5, F1.R6, F1.R7 (cookie), F1.R8, F1.R10 (wiring)
- **Proves:** F1.AC6 (HTTP status and message), F1.AC7 (logout response), F1.AC10 (401 on a trip route), F1.AC12 (response bodies)
- **Depends on:** F1.T6, F1.T8, F1.T9
- **Files:** `app/api/src/http/app.ts`, `app/api/src/http/routes/auth.ts`, `app/api/src/http/routes/auth.test.ts`, `app/api/src/http/errors.ts`, `app/api/src/http/errors.test.ts`, `app/api/src/http/cookies.ts`, `app/api/src/http/cookies.test.ts`, `app/api/src/index.ts` (wiring), `docs/specs/api.md`
- **Steps:**
  1. `cookies.ts`: `sessionCookie(token, expiresAt)` with name `__Host-sid`, `HttpOnly; Secure; SameSite=Lax; Path=/`, `Max-Age` 30 days (serialized with `cookie`). `clearSessionCookie()` sets an expired cookie.
  2. `routes/auth.ts`: `POST /api/register` (201, 400, 409), `POST /api/login` (200, 401, 429 with `Retry-After`), `POST /api/logout` (204, always clears the cookie). Handlers are plain functions over injected services.
  3. `errors.ts`: Express error handler; logs with the project logger, never the body or cookies; returns `{ error: 'Something went wrong. Please try again.' }` with 500.
  4. `app.ts`: `createApp(deps)` builds the Express app. `index.ts` wires real dependencies (T4, T2 blocklist, T3 hasher).
  5. Update `docs/specs/api.md` with the three endpoints and their responses.
- **Tests:** `auth.test.ts`: register returns 201 with `user` and a `Set-Cookie` header with the required attributes, no `password` keys (F1.AC12). Login wrong password and unknown email return identical 401 bodies (F1.AC6). Logout returns 204 and calls `endSession` (F1.AC7). Trip route with no cookie returns 401 and no data (F1.AC10). `errors.test.ts`: a thrown error becomes 500 with the generic message, and the logger is called without the request body. `cookies.test.ts`: attribute string contains `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and the `__Host-` name. Fakes: fake services, fake response object, fixed clock.
- **Done when:** `npm test` and `npm run typecheck` pass; `api.md` lists the endpoints.
- **Needs person review:** yes (authentication, cookie attributes, and the API surface).
- **Commit:** `F1.T10: Add register, login and logout routes`

### F1.T11 — Log in and Register screens, and the Trips placeholder
- **Builds:** F1.R1 (screen), F1.R2 (field messages), F1.R3 (hint), F1.R5 (screen), F1.R6 (screen), F1.R14
- **Proves:** F1.AC13, F1.AC24
- **Depends on:** F1.T10
- **Files:** `app/web/src/api/client.ts`, `app/web/src/api/client.test.ts`, `app/web/src/copy.ts`, `app/web/src/components/PasswordField.tsx`, `app/web/src/components/PasswordField.test.tsx`, `app/web/src/pages/LogIn.tsx`, `app/web/src/pages/LogIn.test.tsx`, `app/web/src/pages/Register.tsx`, `app/web/src/pages/Register.test.tsx`, `app/web/src/pages/Trips.tsx`, `app/web/src/App.tsx`
- **Steps:**
  1. `client.ts`: `register`, `login`, `logout` using `fetch` with `credentials: 'same-origin'`; errors become `ApiError` with status and `Retry-After`.
  2. `PasswordField.tsx`: labelled input, `type` toggles `password`/`text`, button "Show password" / "Hide password" with `aria-pressed`. Paste not blocked.
  3. `LogIn.tsx` and `Register.tsx`: Email and Password fields with labels; errors linked by `aria-describedby`; form-level `role="alert"`; focus to first error field; Submit disabled while busy; after success always navigate to `/trips`; clear password on failure, keep email. Register shows the length hint under Password.
  4. `Trips.tsx`: placeholder heading and text only.
  5. `App.tsx`: routes `/login`, `/register`, `/trips`.
- **Tests:** `LogIn.test.tsx` (headless component test): F1.AC13: after a redirect from a trip page (location state set), a successful login navigates to `/trips`. `PasswordField.test.tsx` + `Register.test.tsx`: F1.AC24: "Show password" changes the input type and the label to "Hide password"; paste events are not prevented. Also: wrong login clears the password field (F1.AC6 UI). `client.test.ts`: maps 429 to `ApiError` with retry seconds. Fakes: a mocked `fetch` and a mocked router. Each test names its AC ID.
- **Done when:** `npm test` and `npm run typecheck` pass in `app/web`; the register and log-in screens render in `npm run dev`.
- **Needs person review:** yes (authentication UI, the login and registration flow).
- **Commit:** `F1.T11: Add register and log-in screens`

### F1.T12 — Route guard, log out and expired-session notice in the web app
- **Builds:** F1.R8 (UI), F1.R9, F1.R10 (UI), F1.R7 (UI notice)
- **Proves:** F1.AC7 (UI), F1.AC9, F1.AC23 (UI)
- **Depends on:** F1.T9, F1.T11
- **Files:** `app/web/src/components/RequireSession.tsx`, `app/web/src/components/RequireSession.test.tsx`, `app/web/src/components/Header.tsx`, `app/web/src/components/Header.test.tsx`, `app/web/src/pages/LogIn.tsx` (notice prop), `app/web/src/pages/TripPage.tsx` (shell), `app/web/src/App.tsx`, `app/api/src/http/routes/trips-placeholder.ts`, `app/api/src/http/routes/trips-placeholder.test.ts`
- **Steps:**
  1. `RequireSession`: the trip route loads its data through the API. The API returns 401 when logged out or expired; on 401 the client redirects to `/login`, with the expired notice when the user had been logged in, otherwise without a notice. No trip content is rendered before the API answers.
  2. `Header.tsx`: "Log out" visible only when logged in; calls `logout`, then navigates to `/login`.
  3. `LogIn.tsx`: shows "Your session has expired. Please log in again." when the expired notice is set.
  4. `TripPage.tsx`: shell route `/trips/:id` that calls the guarded placeholder endpoint `GET /api/trips/:id` (added in `trips-placeholder.ts`, returns 401 when logged out, 404 otherwise for F1 since no trips exist yet).
- **Tests:** `RequireSession.test.tsx`: F1.AC9: a 401 from the guard redirects to `/login` and renders no child content (headless component test with mocked fetch). F1.AC23: a 401 after expiry shows the expired notice on the login page. `Header.test.tsx`: F1.AC7: clicking Log out calls `logout` and navigates to `/login`; "Log out" is absent when logged out. `trips-placeholder.test.ts` (in T12 files): F1.AC10 with no cookie returns 401 and no data. Fakes: mocked `fetch`, mocked router.
- **Done when:** `npm test` passes in both apps; a logged-out visit to `/trips/1` redirects to `/login` in `npm run dev`.
- **Needs person review:** yes (login gate and logout).
- **Commit:** `F1.T12: Add login gate, log out and expired-session notice`

> Note: the spec has no trip endpoints in F1, so the `trips-placeholder` route exists only to prove the gate end to end. F2 replaces it.

## Coverage
| Spec ID | Task(s) | Proven by |
|---|---|---|
| F1.R1 | T6, T10, T11 | Unit (T6, T10); component test (T11) |
| F1.R2 | T2, T4, T6 | Unit |
| F1.R3 | T2, T3, T6 | Unit (length, hashing, NFC) |
| F1.R4 | T4, T6 | Unit (fake store); code review (unique constraint, T4) |
| F1.R5 | T6, T11 | Unit (T6); component (T11) |
| F1.R6 | T8, T10, T11 | Unit (T8, T10); component (T11) |
| F1.R7 | T5, T9, T10, T12 | Unit (T5, T9); code review (cookie attributes, T10) |
| F1.R8 | T5, T10, T12 | Unit (T5, T10); component (T12) |
| F1.R9 | T9, T12 | Unit (T9); component (T12) |
| F1.R10 | T9, T10, T12 | Unit (T9, T10); component (T12) |
| F1.R11 | T9 | Unit (T9); code review (real queries in F2) |
| F1.R12 | T2, T6 | Unit |
| F1.R13 | T7, T8 | Unit |
| F1.R14 | T11 | Component test |
| F1.AC1 | T6 | Unit |
| F1.AC2 | T2, T6 | Unit |
| F1.AC3 | T2, T6 | Unit |
| F1.AC4 | T2, T6 | Unit |
| F1.AC5 | T8 | Unit |
| F1.AC6 | T8, T10, T11 | Unit; component (password cleared) |
| F1.AC7 | T5, T10, T12 | Unit; component |
| F1.AC8 | T5 | Unit |
| F1.AC9 | T9, T12 | Unit; component |
| F1.AC10 | T9, T10, T12 | Unit |
| F1.AC11 | T9 | Unit |
| F1.AC12 | T6, T8, T10 | Unit |
| F1.AC13 | T11 | Component test |
| F1.AC14 | T3 | Unit |
| F1.AC15 | T3 | Unit |
| F1.AC16 | T2, T6 | Unit |
| F1.AC17 | T2, T6 | Unit |
| F1.AC18 | T3 | Unit |
| F1.AC19 | T7 | Unit (fake clock) |
| F1.AC20 | T7 | Unit (fake clock) |
| F1.AC21 | T7 | Unit |
| F1.AC22 | T7 | Unit |
| F1.AC23 | T5, T9, T12 | Unit (fake clock); component |
| F1.AC24 | T11 | Component test |

Spec test-plan rows not in the table above: "Duplicate email under concurrency" (T4 review), "Cookie attributes and server-side expiry" (T10 review), "No sensitive data in logs" (T1 logger test, T10 review).

## Review checklist
A person checks these in code review, because unit tests can't prove them:
- [ ] The `users.email` unique index exists in `001-auth.sql`, and `insertUser` maps the violation to "taken" (F1.T4, F1.T6).
- [ ] Session cookie has `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`; expiry is read from `sessions.expires_at` (F1.T5, F1.T10).
- [ ] No password, hash, session token or cookie value is passed to the logger, in any route or error handler (F1.T1, F1.T10).
- [ ] Every migration runs in one transaction; the `sessions` foreign key cascades (F1.T4).
- [ ] Every SQL statement uses `?` parameters (F1.T4).
- [ ] Argon2id parameters match the spec in `password.ts` (F1.T3).
- [ ] The downloaded blocklist was read by a person before being committed (F1.T2).
- [ ] `ownsTrip` is called after `apiGuard` in every future trip endpoint (F1.T9; enforced in F2–F6).

## Risks
- **Budget ($15, Haiku only):** 12 tasks with tests can run over budget. Each task is kept to one session. Stop and ask if a task runs long.
- **`better-sqlite3` on Windows:** install can fail without build tools. Mitigation: prebuilt binaries are used; if install fails, stop and tell the user before switching.
- **`Secure` cookies on `http://localhost`:** Chrome and Firefox accept `Secure` cookies on `localhost`, but a plain-IP dev URL would not. Dev uses `localhost` only.
- **Blocklist size:** a long list slows checks and is hard to review. Mitigation: T2 keeps only 15+ character entries and reviews the file.
- **Throttle in the database:** a wrong `next_allowed_at` could lock a user out. Mitigation: the throttle policy is a pure function tested with a fake clock (T7).
- **Scope creep into F2:** the `trips-placeholder` route in T12 must stay a guard test only; no trip data.

## Open questions
None. (The three plan choices the user answered are in the Decisions log.)

## Decisions log
- 2026-11-15: SQLite driver → `better-sqlite3`.
- 2026-11-15: Argon2id library → `@node-rs/argon2`.
- 2026-11-15: Common-password blocklist source → SecLists, filtered to 15+ characters, plus app words.
- 2026-11-15: Throttle storage → database table `login_throttle` (plan choice, see Choices table).
- 2026-11-15: Session ID stored as a SHA-256 hash (plan choice, see Choices table).
- 2026-11-15: Plan approved by the user.
