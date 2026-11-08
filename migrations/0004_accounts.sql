-- Simple email + password accounts for signing in to the staff panel.
-- Passwords are stored only as salted PBKDF2-SHA256 hashes; sessions only as
-- SHA-256 hashes of the random token kept in the browser cookie.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX accounts_email_uq ON accounts (lower(email));

CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX account_sessions_account_idx ON account_sessions (account_id);
