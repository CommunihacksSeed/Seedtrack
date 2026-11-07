-- Delivery fields, settings, bundle templates and the notification log.

ALTER TABLE orders ADD COLUMN delivery_method TEXT
  CHECK (delivery_method IS NULL OR delivery_method IN ('drop-off', 'mail', 'pickup'));
ALTER TABLE orders ADD COLUMN delivery_lat REAL
  CHECK (delivery_lat IS NULL OR delivery_lat BETWEEN -90 AND 90);
ALTER TABLE orders ADD COLUMN delivery_lng REAL
  CHECK (delivery_lng IS NULL OR delivery_lng BETWEEN -180 AND 180);

-- Single-row settings document (validated by the app before saving).
CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO app_settings (id) VALUES (1);

CREATE TABLE bundles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  -- JSON array of { "seed_id": string, "quantity": integer }
  items TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX bundles_name_uq ON bundles (lower(name));

CREATE TABLE notification_log (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  order_id TEXT REFERENCES orders (id) ON DELETE SET NULL,
  seed_id TEXT REFERENCES seeds (id) ON DELETE SET NULL,
  recipient TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'logged', 'skipped', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX notification_log_created_idx ON notification_log (created_at DESC);
