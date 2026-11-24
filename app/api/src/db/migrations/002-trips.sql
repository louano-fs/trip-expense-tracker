-- F2 trips schema. Times are UTC ISO 8601 text. Money does not appear in this table.
-- Every table added later with a trip_id column must reference trips (id) ON DELETE CASCADE (F2.R9).

CREATE TABLE trips (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Trimmed by the service (F2.R2). Length is counted in characters (code points), 1 to 100.
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  created_at TEXT NOT NULL
);

-- Lists and ownership checks always filter by owner (F1.R11, F2.R11). No unique constraint on name (F2.R3).
CREATE INDEX trips_owner_id_idx ON trips (owner_id);
