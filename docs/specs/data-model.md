# Data model

_Kept up to date with the migrations in `app/api/src/db/migrations/`. Last updated with F1.T4._

Database: SQLite, one file, foreign keys on (`PRAGMA foreign_keys = ON`), WAL journal mode.
Times are stored as UTC ISO 8601 text (for example `2026-11-24T10:00:00.000Z`).
Money is stored as whole cents in an `INTEGER` column, never as a float (no money tables yet).

Migrations are tracked in `schema_migrations` and applied in file-name order, each in one transaction with its record.

## Migration `001-auth` (F1)

### `schema_migrations` (created by `migrate.ts`)
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT, primary key | Migration name, for example `001-auth` |
| `applied_at` | TEXT, not null | UTC ISO 8601 time the migration was applied |

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER, primary key | Row id |
| `email` | TEXT, not null | Trimmed and lowercase, at most 254 characters (`CHECK`). Unique through `users_email_key` |
| `password_hash` | TEXT, not null | Argon2id hash, including salt and settings. Never the plain password |
| `created_at` | TEXT, not null | UTC ISO 8601 |

Indexes: `users_email_key` is a `UNIQUE` index on `users (email)`. It stops two simultaneous registrations with the same email from both succeeding (F1.R2, F1.R4).

### `sessions`
| Column | Type | Notes |
|---|---|---|
| `id_hash` | TEXT, primary key | SHA-256 hex of the random session ID. The raw ID is only in the cookie |
| `user_id` | INTEGER, not null | Foreign key to `users (id)` with `ON DELETE CASCADE` |
| `created_at` | TEXT, not null | UTC ISO 8601 |
| `expires_at` | TEXT, not null | UTC ISO 8601, `created_at` plus 30 days (F1.R7) |

Indexes: `sessions_user_id_idx` on `(user_id)`; `sessions_expires_at_idx` on `(expires_at)`.

### `login_throttle`
| Column | Type | Notes |
|---|---|---|
| `email` | TEXT, primary key | Normalized email as typed, whether or not an account exists (F1.R13) |
| `consecutive_failures` | INTEGER, not null, default 0 | Never negative (`CHECK`) |
| `next_allowed_at` | TEXT, nullable | UTC ISO 8601; null when no wait applies |

## Migration `002-trips` (F2)

### `trips`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER, primary key | Row id |
| `owner_id` | INTEGER, not null, FK to `users.id` | `ON DELETE CASCADE`; indexed (`trips_owner_id_idx`) |
| `name` | TEXT, not null | `CHECK (length(name) BETWEEN 1 AND 100)`; no unique constraint (F2.R3) |
| `created_at` | TEXT, not null | UTC ISO 8601 |

Rule for later migrations: every child table added in F3 to F6 references `trips.id` with `ON DELETE CASCADE`.

## Repositories
Functions in `app/api/src/db/repositories/` take a `Db` and use `?` placeholders only:
- `users.ts`: `insertUser`, `findUserByEmail`. `insertUser` throws `EmailTakenError` on a unique violation of `users.email`.
- `sessions.ts`: `insertSession`, `findSessionByHash`, `deleteSession`.
- `throttle.ts`: `getThrottle`, `saveThrottle`, `clearThrottle`.
- `trips.ts`: `insertTrip`, `listTripsByOwner`, `findTripForOwner`, `deleteTripById`. The list and find functions always filter by `owner_id`.
