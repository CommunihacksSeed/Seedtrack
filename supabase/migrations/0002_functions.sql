-- SeedFlow transactional functions.
-- Every inventory change runs inside one of these functions: each call is a
-- single transaction that locks the order row and the affected seed rows
-- (in id order, to avoid deadlocks) before checking quantities.
-- Errors are raised with a HINT code that the app maps to a friendly message.

create or replace function sf_norm(s text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(s, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Unique match of a free-text seed name to inventory, or NULL when none/ambiguous.
create or replace function sf_match_seed(p_name text) returns uuid
language plpgsql stable as $$
declare
  q text := sf_norm(p_name);
  ids uuid[];
begin
  if q = '' then return null; end if;
  select array_agg(id) into ids from seeds
   where sf_norm(name || ' ' || coalesce(variety, '')) = q
      or (variety is not null and sf_norm(variety || ' ' || name) = q)
      or (variety is null and sf_norm(name) = q);
  if coalesce(array_length(ids, 1), 0) = 1 then return ids[1]; end if;
  if coalesce(array_length(ids, 1), 0) > 1 then return null; end if;
  select array_agg(id) into ids from seeds where sf_norm(name) = q;
  if coalesce(array_length(ids, 1), 0) = 1 then return ids[1]; end if;
  return null;
end $$;

create or replace function sf_log_status(p_order uuid, p_prev text, p_next text, p_notes text)
returns void language sql as $$
  insert into order_status_history (order_id, previous_status, new_status, notes)
  values (p_order, p_prev, p_next, p_notes);
  update orders set status = p_next, updated_at = now() where id = p_order;
$$;

create or replace function sf_label(s seeds) returns text
language sql immutable as $$
  select case when s.variety is null then s.name else s.name || ' — ' || s.variety end
$$;

-- ---------- Seeds ----------

create or replace function sf_create_seed(p jsonb) returns seeds
language plpgsql as $$
declare s seeds;
begin
  if (p->>'physical_quantity') is not null and (p->>'physical_quantity')::int < 0 then
    raise exception 'Physical quantity must be a whole number of 0 or more.' using hint = 'invalid';
  end if;
  begin
    insert into seeds (name, variety, category, description, physical_quantity, unit, storage_location, low_stock_threshold)
    values (trim(p->>'name'), nullif(trim(p->>'variety'), ''), coalesce(p->>'category', 'Other'),
            nullif(trim(p->>'description'), ''), (p->>'physical_quantity')::int,
            coalesce(nullif(trim(p->>'unit'), ''), 'packets'), nullif(trim(p->>'storage_location'), ''),
            (p->>'low_stock_threshold')::int)
    returning * into s;
  exception when unique_violation then
    raise exception 'This seed already exists in inventory.' using hint = 'duplicate';
  end;
  if s.physical_quantity is not null then
    insert into inventory_movements (seed_id, movement_type, quantity, physical_after, reserved_after, notes)
    values (s.id, 'initial', s.physical_quantity, s.physical_quantity, 0, 'Initial stock entry');
  end if;
  return s;
end $$;

create or replace function sf_set_stock(p_seed_id uuid, p_physical integer, p_notes text default null)
returns seeds language plpgsql as $$
declare s seeds; before integer;
begin
  select * into s from seeds where id = p_seed_id for update;
  if not found then raise exception 'Seed not found.' using hint = 'not_found'; end if;
  if p_physical is not null and p_physical < 0 then
    raise exception 'Physical quantity must be a whole number of 0 or more.' using hint = 'invalid';
  end if;
  if p_physical is null and s.reserved_quantity > 0 then
    raise exception 'Cannot mark stock as uncounted while packets are reserved for orders.' using hint = 'below_reserved';
  end if;
  if p_physical is not null and p_physical < s.reserved_quantity then
    raise exception 'Physical stock cannot be lower than the % packets already reserved for approved orders.', s.reserved_quantity
      using hint = 'below_reserved';
  end if;
  before := s.physical_quantity;
  if before is not distinct from p_physical then return s; end if;
  update seeds set physical_quantity = p_physical, updated_at = now() where id = p_seed_id returning * into s;
  if p_physical is not null then
    insert into inventory_movements (seed_id, movement_type, quantity, physical_after, reserved_after, notes)
    values (s.id, case when before is null then 'initial' else 'adjustment' end, p_physical - coalesce(before, 0),
            s.physical_quantity, s.reserved_quantity,
            coalesce(nullif(p_notes, ''), case when before is null then 'First stock count' else 'Stock count updated' end));
  end if;
  return s;
end $$;

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
  delete from seeds where id = p_seed_id;
end $$;

-- ---------- Orders ----------

-- Idempotent on external_entry_id: importing the same Cognito entry twice
-- returns the existing order with duplicate = true.
create or replace function sf_create_order(p jsonb) returns jsonb
language plpgsql as $$
declare
  oid uuid;
  ext text := nullif(trim(p->>'external_entry_id'), '');
  it jsonb;
  item_count int := 0;
begin
  if coalesce(trim(p->>'requester_name'), '') = '' then
    raise exception 'Requester name is required.' using hint = 'invalid';
  end if;
  if coalesce(trim(p->>'organization_name'), '') = '' then
    raise exception 'Organization or school name is required.' using hint = 'invalid';
  end if;
  select count(*) into item_count from jsonb_array_elements(coalesce(p->'items', '[]')) e
   where coalesce(trim(e->>'requested_seed_name'), '') <> '';
  if item_count = 0 and coalesce(jsonb_array_length(p->'requested_bundles'), 0) = 0 then
    raise exception 'A request needs at least one seed variety or bundle.' using hint = 'invalid';
  end if;

  insert into orders (external_entry_id, requester_name, requester_email, organization_name, school_use,
                      mailing_address, student_count, requested_bundles, special_requests, garden_support,
                      seed_donation_interest, source, submitted_at)
  values (ext, trim(p->>'requester_name'), nullif(trim(p->>'requester_email'), ''), trim(p->>'organization_name'),
          (p->>'school_use')::boolean, nullif(trim(p->>'mailing_address'), ''), (p->>'student_count')::int,
          coalesce(array(select jsonb_array_elements_text(p->'requested_bundles')), '{}'),
          nullif(trim(p->>'special_requests'), ''), (p->>'garden_support')::boolean,
          (p->>'seed_donation_interest')::boolean, coalesce(nullif(p->>'source', ''), 'manual'),
          coalesce((p->>'submitted_at')::timestamptz, now()))
  on conflict (external_entry_id) do nothing
  returning id into oid;

  if oid is null then
    select id into oid from orders where external_entry_id = ext;
    return jsonb_build_object('order_id', oid, 'duplicate', true);
  end if;

  insert into order_status_history (order_id, previous_status, new_status, notes)
  values (oid, null, 'Received', 'Request created (' || coalesce(nullif(p->>'source', ''), 'manual') || ')');

  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    continue when coalesce(trim(it->>'requested_seed_name'), '') = '';
    insert into order_items (order_id, seed_id, requested_seed_name, requested_quantity)
    values (oid,
            coalesce((select id from seeds where id = nullif(it->>'seed_id', '')::uuid), sf_match_seed(it->>'requested_seed_name')),
            trim(it->>'requested_seed_name'), (it->>'requested_quantity')::int);
  end loop;
  return jsonb_build_object('order_id', oid, 'duplicate', false);
end $$;

create or replace function sf_add_item(p_order_id uuid, p_name text) returns order_items
language plpgsql as $$
declare o orders; i order_items;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status not in ('Received', 'Under Review') then
    raise exception 'Items can only be added while the request is under review.' using hint = 'bad_status';
  end if;
  insert into order_items (order_id, seed_id, requested_seed_name)
  values (p_order_id, sf_match_seed(p_name), trim(p_name)) returning * into i;
  return i;
end $$;

-- Applies review decisions to the items of an (already locked) order.
create or replace function sf_apply_review(p_order_id uuid, p_review jsonb) returns void
language plpgsql as $$
declare r jsonb; unavail boolean; qty int;
begin
  for r in select * from jsonb_array_elements(coalesce(p_review, '[]')) loop
    unavail := coalesce((r->>'unavailable')::boolean, false);
    qty := (r->>'approved_quantity')::int;
    if qty is not null and qty < 0 then
      raise exception 'Approved quantities must be whole numbers of 0 or more.' using hint = 'invalid';
    end if;
    update order_items
       set seed_id = nullif(r->>'seed_id', '')::uuid,
           unavailable = unavail,
           approved_quantity = case when unavail then 0 else qty end
     where id = (r->>'item_id')::uuid and order_id = p_order_id;
    if not found then
      raise exception 'Review references an item that is not on this order.' using hint = 'invalid';
    end if;
  end loop;
end $$;

create or replace function sf_start_review(p_order_id uuid) returns orders
language plpgsql as $$
declare o orders;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status <> 'Received' then raise exception 'Order is already %.', o.status using hint = 'bad_status'; end if;
  perform sf_log_status(o.id, o.status, 'Under Review', 'Review started');
  select * into o from orders where id = p_order_id;
  return o;
end $$;

create or replace function sf_save_review(p_order_id uuid, p_review jsonb) returns orders
language plpgsql as $$
declare o orders;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status not in ('Received', 'Under Review') then
    raise exception 'This order is % and can no longer be edited.', o.status using hint = 'bad_status';
  end if;
  perform sf_apply_review(p_order_id, p_review);
  if o.status = 'Received' then perform sf_log_status(o.id, o.status, 'Under Review', 'Review started'); end if;
  update orders set updated_at = now() where id = p_order_id returning * into o;
  return o;
end $$;

-- Approve and reserve stock atomically. Fails without side effects if any
-- item is unmatched, uncounted, or over the available quantity, and refuses
-- to run twice for the same order.
create or replace function sf_approve_order(p_order_id uuid, p_review jsonb default null) returns orders
language plpgsql as $$
declare
  o orders; s seeds; n record; bad record; total int := 0;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status in ('Approved', 'Preparing', 'Ready', 'Delivered') then
    raise exception 'This order has already been approved. Stock was not reserved again.' using hint = 'already_approved';
  end if;
  if o.status = 'Cancelled' then raise exception 'Cancelled orders cannot be approved.' using hint = 'bad_status'; end if;

  if p_review is not null then perform sf_apply_review(p_order_id, p_review); end if;

  select * into bad from order_items where order_id = p_order_id and not unavailable and approved_quantity is null limit 1;
  if found then
    raise exception 'Set an approved quantity for %, or mark it unavailable.', bad.requested_seed_name using hint = 'invalid';
  end if;
  select * into bad from order_items where order_id = p_order_id and not unavailable and approved_quantity > 0 and seed_id is null limit 1;
  if found then
    raise exception 'Inventory Match Required: choose the inventory item for "%".', bad.requested_seed_name using hint = 'match_required';
  end if;

  -- Lock every affected seed row in a consistent order.
  perform 1 from seeds where id in (
    select seed_id from order_items where order_id = p_order_id and not unavailable and approved_quantity > 0
  ) order by id for update;

  for n in
    select seed_id, sum(approved_quantity)::int as qty from order_items
     where order_id = p_order_id and not unavailable and approved_quantity > 0
     group by seed_id order by seed_id
  loop
    select * into s from seeds where id = n.seed_id;
    if s.physical_quantity is null then
      raise exception 'Stock Count Required: % has not been counted yet, so it cannot be allocated.', sf_label(s)
        using hint = 'stock_count_required';
    end if;
    if n.qty > s.physical_quantity - s.reserved_quantity then
      raise exception 'Insufficient stock for %: % requested, only % available (% on hand, % reserved).',
        sf_label(s), n.qty, s.physical_quantity - s.reserved_quantity, s.physical_quantity, s.reserved_quantity
        using hint = 'insufficient_stock';
    end if;
    total := total + n.qty;
  end loop;
  if total = 0 then
    raise exception 'Approve at least one packet, or cancel the request instead.' using hint = 'invalid';
  end if;

  for n in
    select seed_id, sum(approved_quantity)::int as qty from order_items
     where order_id = p_order_id and not unavailable and approved_quantity > 0
     group by seed_id order by seed_id
  loop
    update seeds set reserved_quantity = reserved_quantity + n.qty, updated_at = now()
     where id = n.seed_id returning * into s;
    insert into inventory_movements (seed_id, order_id, movement_type, quantity, physical_after, reserved_after, notes)
    values (s.id, p_order_id, 'reservation', n.qty, s.physical_quantity, s.reserved_quantity,
            'Reserved for order #' || o.order_number);
  end loop;

  update orders set approved_at = now() where id = p_order_id;
  perform sf_log_status(o.id, o.status, 'Approved', 'Approved and stock reserved');
  select * into o from orders where id = p_order_id;
  return o;
end $$;

create or replace function sf_start_preparing(p_order_id uuid) returns orders
language plpgsql as $$
declare o orders;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status = 'Preparing' then return o; end if;
  if o.status <> 'Approved' then
    raise exception 'Only approved orders can move to Preparing (this one is %).', o.status using hint = 'bad_status';
  end if;
  perform sf_log_status(o.id, o.status, 'Preparing', 'Packing started');
  select * into o from orders where id = p_order_id;
  return o;
end $$;

create or replace function sf_pack_items(p_order_id uuid, p_packs jsonb) returns orders
language plpgsql as $$
declare o orders; r jsonb; i order_items;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status not in ('Approved', 'Preparing') then
    raise exception 'Packing can only be recorded for Approved or Preparing orders (this one is %).', o.status using hint = 'bad_status';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_packs, '[]')) loop
    select * into i from order_items where id = (r->>'item_id')::uuid and order_id = p_order_id;
    if not found then raise exception 'Item not on this order.' using hint = 'invalid'; end if;
    if (r->>'packed_quantity')::int < 0 or (r->>'packed_quantity')::int > coalesce(i.approved_quantity, 0) then
      raise exception 'Cannot pack more than the % approved for %.', coalesce(i.approved_quantity, 0), i.requested_seed_name
        using hint = 'invalid';
    end if;
    update order_items set packed_quantity = (r->>'packed_quantity')::int where id = i.id;
  end loop;
  if o.status = 'Approved' then perform sf_log_status(o.id, o.status, 'Preparing', 'Packing started'); end if;
  update orders set updated_at = now() where id = p_order_id returning * into o;
  return o;
end $$;

create or replace function sf_mark_ready(p_order_id uuid) returns orders
language plpgsql as $$
declare o orders; missing text;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status = 'Ready' then return o; end if;
  if o.status not in ('Approved', 'Preparing') then
    raise exception 'Only orders being packed can be marked Ready (this one is %).', o.status using hint = 'bad_status';
  end if;
  select string_agg(requested_seed_name || ' (' || packed_quantity || '/' || approved_quantity || ')', ', ') into missing
    from order_items where order_id = p_order_id and coalesce(approved_quantity, 0) > 0 and packed_quantity <> approved_quantity;
  if missing is not null then
    raise exception 'Not all approved items are packed: %.', missing using hint = 'not_packed';
  end if;
  update orders set ready_at = now() where id = p_order_id;
  perform sf_log_status(o.id, o.status, 'Ready', 'All items packed');
  select * into o from orders where id = p_order_id;
  return o;
end $$;

-- Deliver exactly once: deduct physical stock and release the reservation.
create or replace function sf_deliver_order(p_order_id uuid) returns orders
language plpgsql as $$
declare o orders; s seeds; n record;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status = 'Delivered' then
    raise exception 'This order was already delivered. Stock was not deducted again.' using hint = 'already_delivered';
  end if;
  if o.status <> 'Ready' then
    raise exception 'Only Ready orders can be delivered (this one is %).', o.status using hint = 'bad_status';
  end if;
  perform 1 from seeds where id in (
    select seed_id from order_items where order_id = p_order_id and coalesce(approved_quantity, 0) > 0
  ) order by id for update;
  for n in
    select seed_id, sum(approved_quantity)::int as qty from order_items
     where order_id = p_order_id and coalesce(approved_quantity, 0) > 0 and seed_id is not null
     group by seed_id order by seed_id
  loop
    select * into s from seeds where id = n.seed_id;
    if s.physical_quantity is null or s.physical_quantity < n.qty or s.reserved_quantity < n.qty then
      raise exception 'Inventory for % is inconsistent with this order''s reservation.', sf_label(s) using hint = 'inconsistent';
    end if;
    update seeds set physical_quantity = physical_quantity - n.qty, reserved_quantity = reserved_quantity - n.qty,
                     updated_at = now()
     where id = n.seed_id returning * into s;
    insert into inventory_movements (seed_id, order_id, movement_type, quantity, physical_after, reserved_after, notes)
    values (s.id, p_order_id, 'fulfillment', -n.qty, s.physical_quantity, s.reserved_quantity,
            'Delivered order #' || o.order_number);
  end loop;
  update orders set delivered_at = now() where id = p_order_id;
  perform sf_log_status(o.id, o.status, 'Delivered', 'Delivered; stock deducted');
  select * into o from orders where id = p_order_id;
  return o;
end $$;

-- Cancel: release reservations (if any) without touching physical stock.
create or replace function sf_cancel_order(p_order_id uuid, p_reason text default null) returns orders
language plpgsql as $$
declare o orders; s seeds; n record;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.' using hint = 'not_found'; end if;
  if o.status = 'Cancelled' then raise exception 'This order is already cancelled.' using hint = 'already_cancelled'; end if;
  if o.status = 'Delivered' then raise exception 'Delivered orders cannot be cancelled.' using hint = 'bad_status'; end if;
  if o.status in ('Approved', 'Preparing', 'Ready') then
    perform 1 from seeds where id in (
      select seed_id from order_items where order_id = p_order_id and coalesce(approved_quantity, 0) > 0
    ) order by id for update;
    for n in
      select seed_id, sum(approved_quantity)::int as qty from order_items
       where order_id = p_order_id and coalesce(approved_quantity, 0) > 0 and seed_id is not null
       group by seed_id order by seed_id
    loop
      update seeds set reserved_quantity = greatest(0, reserved_quantity - n.qty), updated_at = now()
       where id = n.seed_id returning * into s;
      insert into inventory_movements (seed_id, order_id, movement_type, quantity, physical_after, reserved_after, notes)
      values (s.id, p_order_id, 'release', -n.qty, s.physical_quantity, s.reserved_quantity,
              'Released: order #' || o.order_number || ' cancelled');
    end loop;
  end if;
  update orders set cancelled_at = now() where id = p_order_id;
  perform sf_log_status(o.id, o.status, 'Cancelled', coalesce(nullif(p_reason, ''), 'Cancelled'));
  select * into o from orders where id = p_order_id;
  return o;
end $$;

-- Only the server (service role) may call these functions.
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
