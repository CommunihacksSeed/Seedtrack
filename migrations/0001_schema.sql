-- SeedFlow schema for Cloudflare D1 (SQLite).
-- NULL physical_quantity means "Unknown / Not Counted", which is deliberately
-- different from 0. Timestamps are ISO 8601 text; booleans are 0/1 integers;
-- requested_bundles is a JSON array stored as text.

-- A single row that every write goes through. `version` is the compare-and-swap
-- guard described in src/lib/store/d1.ts: a stale writer sets it to -1, which
-- violates store_meta_cas and rolls back the whole batch.
CREATE TABLE store_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0 CONSTRAINT store_meta_cas CHECK (version >= 0),
  next_order_number INTEGER NOT NULL DEFAULT 1001
);
INSERT INTO store_meta (id) VALUES (1);

CREATE TABLE seeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  variety TEXT,
  category TEXT NOT NULL DEFAULT 'Other' CHECK (category IN (
    'Greens', 'Herbs', 'Root Vegetables', 'Flowers',
    'Fruits / Fruiting Vegetables', 'Legumes', 'Other')),
  description TEXT,
  physical_quantity INTEGER,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'packets',
  storage_location TEXT,
  low_stock_threshold INTEGER CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT seeds_physical_nonneg CHECK (physical_quantity IS NULL OR physical_quantity >= 0),
  CONSTRAINT seeds_reserved_nonneg CHECK (reserved_quantity >= 0),
  CONSTRAINT seeds_reserved_le_physical CHECK (physical_quantity IS NULL OR reserved_quantity <= physical_quantity),
  CONSTRAINT seeds_unknown_not_reserved CHECK (physical_quantity IS NOT NULL OR reserved_quantity = 0)
);
CREATE UNIQUE INDEX seeds_name_variety_uq ON seeds (lower(name), lower(coalesce(variety, '')));
CREATE INDEX seeds_category_idx ON seeds (category);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number INTEGER NOT NULL UNIQUE,
  external_entry_id TEXT UNIQUE,
  requester_name TEXT NOT NULL,
  requester_email TEXT,
  organization_name TEXT NOT NULL,
  school_use INTEGER CHECK (school_use IN (0, 1)),
  mailing_address TEXT,
  student_count INTEGER CHECK (student_count IS NULL OR student_count >= 0),
  requested_bundles TEXT NOT NULL DEFAULT '[]',
  special_requests TEXT,
  garden_support INTEGER CHECK (garden_support IN (0, 1)),
  seed_donation_interest INTEGER CHECK (seed_donation_interest IN (0, 1)),
  assigned_steward TEXT,
  status TEXT NOT NULL DEFAULT 'Received' CHECK (status IN (
    'Received', 'Under Review', 'Approved', 'Preparing', 'Ready', 'Delivered', 'Cancelled')),
  source TEXT NOT NULL DEFAULT 'manual',
  submitted_at TEXT NOT NULL,
  approved_at TEXT,
  ready_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_submitted_idx ON orders (submitted_at);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  seed_id TEXT REFERENCES seeds (id) ON DELETE RESTRICT,
  requested_seed_name TEXT NOT NULL,
  requested_quantity INTEGER CHECK (requested_quantity IS NULL OR requested_quantity >= 0),
  approved_quantity INTEGER CHECK (approved_quantity IS NULL OR approved_quantity >= 0),
  packed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (packed_quantity >= 0),
  unavailable INTEGER NOT NULL DEFAULT 0 CHECK (unavailable IN (0, 1)),
  created_at TEXT NOT NULL,
  CONSTRAINT order_items_packed_le_approved CHECK (packed_quantity <= coalesce(approved_quantity, 0))
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_seed_idx ON order_items (seed_id);

CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL REFERENCES seeds (id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders (id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'initial', 'adjustment', 'reservation', 'release', 'fulfillment')),
  quantity INTEGER NOT NULL,
  physical_after INTEGER,
  reserved_after INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX inventory_movements_seed_idx ON inventory_movements (seed_id, created_at DESC);
CREATE INDEX inventory_movements_order_idx ON inventory_movements (order_id);

CREATE TABLE order_status_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  changed_at TEXT NOT NULL
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, changed_at);
