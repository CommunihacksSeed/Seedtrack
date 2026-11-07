-- SeedFlow schema (Supabase / PostgreSQL)
-- Inventory quantities are nullable: NULL means "Unknown / Not Counted",
-- which is deliberately different from 0.

create extension if not exists pgcrypto;

create table if not exists seeds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  variety text,
  category text not null default 'Other' check (category in (
    'Greens', 'Herbs', 'Root Vegetables', 'Flowers',
    'Fruits / Fruiting Vegetables', 'Legumes', 'Other')),
  description text,
  physical_quantity integer,
  reserved_quantity integer not null default 0,
  unit text not null default 'packets',
  storage_location text,
  low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seeds_physical_nonneg check (physical_quantity is null or physical_quantity >= 0),
  constraint seeds_reserved_nonneg check (reserved_quantity >= 0),
  constraint seeds_reserved_le_physical check (physical_quantity is null or reserved_quantity <= physical_quantity),
  constraint seeds_unknown_not_reserved check (physical_quantity is not null or reserved_quantity = 0)
);
create unique index if not exists seeds_name_variety_uq on seeds (lower(name), lower(coalesce(variety, '')));
create index if not exists seeds_category_idx on seeds (category);

create sequence if not exists order_number_seq start 1001;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number integer not null unique default nextval('order_number_seq'),
  external_entry_id text unique,
  requester_name text not null,
  requester_email text,
  organization_name text not null,
  school_use boolean,
  mailing_address text,
  student_count integer check (student_count is null or student_count >= 0),
  requested_bundles text[] not null default '{}',
  special_requests text,
  garden_support boolean,
  seed_donation_interest boolean,
  assigned_steward text,
  status text not null default 'Received' check (status in (
    'Received', 'Under Review', 'Approved', 'Preparing', 'Ready', 'Delivered', 'Cancelled')),
  source text not null default 'manual',
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_submitted_idx on orders (submitted_at);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  seed_id uuid references seeds (id) on delete restrict,
  requested_seed_name text not null,
  requested_quantity integer check (requested_quantity is null or requested_quantity >= 0),
  approved_quantity integer check (approved_quantity is null or approved_quantity >= 0),
  packed_quantity integer not null default 0 check (packed_quantity >= 0),
  unavailable boolean not null default false,
  created_at timestamptz not null default now(),
  constraint order_items_packed_le_approved check (packed_quantity <= coalesce(approved_quantity, 0))
);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_seed_idx on order_items (seed_id);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  seed_id uuid not null references seeds (id) on delete cascade,
  order_id uuid references orders (id) on delete set null,
  movement_type text not null check (movement_type in (
    'initial', 'adjustment', 'reservation', 'release', 'fulfillment')),
  quantity integer not null,
  physical_after integer,
  reserved_after integer not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_seed_idx on inventory_movements (seed_id, created_at desc);
create index if not exists inventory_movements_order_idx on inventory_movements (order_id);

create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  previous_status text,
  new_status text not null,
  notes text,
  changed_at timestamptz not null default now()
);
create index if not exists order_status_history_order_idx on order_status_history (order_id, changed_at);

-- Row Level Security: no anonymous or authenticated-role access at all.
-- The Next.js server talks to Supabase with the service role key (server-side
-- only), and all inventory-changing writes go through the functions in 0002.
alter table seeds enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table inventory_movements enable row level security;
alter table order_status_history enable row level security;
