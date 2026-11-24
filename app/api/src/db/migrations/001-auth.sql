-- F1 auth schema. Times are UTC ISO 8601 text. Money does not appear in auth tables.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL CHECK (length(email) <= 254),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Stops two simultaneous registrations with the same email from both succeeding (F1.R2, F1.R4).
CREATE UNIQUE INDEX users_email_key ON users (email);

-- id_hash is the SHA-256 hex of the random session ID held in the cookie. The raw ID is never stored.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- One row per normalized email typed at login, whether or not an account exists (F1.R13).
CREATE TABLE login_throttle (
  email TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  next_allowed_at TEXT
);
