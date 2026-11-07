-- Settings, bundle templates, notification log, and delivery fields.

alter table orders add column if not exists delivery_method text
  check (delivery_method is null or delivery_method in ('drop-off', 'mail', 'pickup'));
alter table orders add column if not exists delivery_lat double precision
  check (delivery_lat is null or delivery_lat between -90 and 90);
alter table orders add column if not exists delivery_lng double precision
  check (delivery_lng is null or delivery_lng between -180 and 180);
alter table orders drop constraint if exists orders_delivery_coords_pair;
alter table orders add constraint orders_delivery_coords_pair check ((delivery_lat is null) = (delivery_lng is null));

-- Single-row settings document (validated by the app before saving).
create table if not exists app_settings (
  id integer primary key default 1 check (id = 1),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict do nothing;

create table if not exists bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  -- [{ "seed_id": uuid, "quantity": int }]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bundles_name_uq on bundles (lower(name));

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  order_id uuid references orders (id) on delete set null,
  seed_id uuid references seeds (id) on delete set null,
  recipient text,
  subject text not null,
  body text not null,
  status text not null check (status in ('sent', 'logged', 'skipped', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists notification_log_created_idx on notification_log (created_at desc);

alter table app_settings enable row level security;
alter table bundles enable row level security;
alter table notification_log enable row level security;

-- Add a bundle's seeds to an order under review, skipping seeds already on it.
create or replace function sf_add_bundle_items(p_order_id uuid, p_bundle_id uuid) returns integer
language plpgsql as $$
declare o orders; b bundles; it jsonb; s seeds; added int := 0;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status not in ('Received', 'Under Review') then
    raise exception 'Items can only be added while the request is under review.' using hint = 'bad_status';
  end if;
  select * into b from bundles where id = p_bundle_id;
  if not found then raise exception 'Bundle not found.' using hint = 'not_found'; end if;
  for it in select * from jsonb_array_elements(b.items) loop
    select * into s from seeds where id = (it->>'seed_id')::uuid;
    continue when not found;
    continue when exists (select 1 from order_items where order_id = p_order_id and seed_id = s.id);
    insert into order_items (order_id, seed_id, requested_seed_name, requested_quantity)
    values (p_order_id, s.id, sf_label(s), (it->>'quantity')::int);
    added := added + 1;
  end loop;
  update orders set updated_at = now() where id = p_order_id;
  return added;
end $$;

-- Deleting a seed also removes it from bundle templates.
create or replace function sf_delete_seed(p_seed_id uuid) returns void
language plpgsql as $$
declare s seeds;
begin
  select * into s from seeds where id = p_seed_id for update;
  if not found then raise exception 'Seed not found.' using hint = 'not_found'; end if;
  if s.reserved_quantity > 0 or exists (
    select 1 from order_items i join orders o on o.id = i.order_id
     where i.seed_id = p_seed_id and o.status not in ('Delivered', 'Cancelled')) then
    raise exception 'This seed is referenced by an active order and cannot be deleted.' using hint = 'in_use';
  end if;
  if exists (select 1 from order_items where seed_id = p_seed_id) then
    raise exception 'This seed appears in past orders. Keep it for reporting history instead of deleting.' using hint = 'in_use';
  end if;
  update bundles set items = coalesce((select jsonb_agg(e) from jsonb_array_elements(items) e where e->>'seed_id' <> p_seed_id::text), '[]'::jsonb)
   where items @> jsonb_build_array(jsonb_build_object('seed_id', p_seed_id::text));
  delete from seeds where id = p_seed_id;
end $$;

-- Demo reset now also replaces settings, bundles and the notification log.
create or replace function sf_reset_demo(p jsonb, p_confirm text) returns void
language plpgsql as $$
begin
  if p_confirm is distinct from 'RESET' then
    raise exception 'Reset not confirmed.' using hint = 'invalid';
  end if;
  truncate notification_log, order_status_history, inventory_movements, order_items, orders, bundles, seeds;

  insert into seeds select * from jsonb_populate_recordset(null::seeds, p->'seeds');
  insert into orders select * from jsonb_populate_recordset(null::orders, p->'orders');
  insert into order_items select * from jsonb_populate_recordset(null::order_items, p->'order_items');
  insert into inventory_movements select * from jsonb_populate_recordset(null::inventory_movements, p->'inventory_movements');
  insert into order_status_history select * from jsonb_populate_recordset(null::order_status_history, p->'order_status_history');
  insert into bundles select * from jsonb_populate_recordset(null::bundles, coalesce(p->'bundles', '[]'));
  insert into notification_log select * from jsonb_populate_recordset(null::notification_log, coalesce(p->'notifications', '[]'));
  insert into app_settings (id, value, updated_at) values (1, coalesce(p->'settings', '{}'), now())
  on conflict (id) do update set value = excluded.value, updated_at = now();

  perform setval('order_number_seq', greatest((select coalesce(max(order_number), 1000) from orders), 1000));
end $$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'sf\_%' loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
