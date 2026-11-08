-- Staff sign-in. Only accounts in staff_users can open the staff panel; the
-- public request form needs no account. Passwords are stored as salted
-- PBKDF2-SHA256 hashes, never in plain text. Session cookies hold a random
-- token; only its SHA-256 hash is stored here, so a database leak doesn't
-- hand out working sessions.

CREATE TABLE staff_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND instr(email, '@') > 1),
  name TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE staff_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX staff_sessions_user_idx ON staff_sessions (user_id);
CREATE INDEX staff_sessions_expires_idx ON staff_sessions (expires_at);
