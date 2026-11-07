-- Replace ALL data with a demo snapshot (JSON shaped like the app's DataSnapshot).
-- Used by Settings → "Reset demo data" and by supabase/seed.sql.
-- Disabled unless the app passes p_confirm = 'RESET'.
create or replace function sf_reset_demo(p jsonb, p_confirm text) returns void
language plpgsql as $$
begin
  if p_confirm is distinct from 'RESET' then
    raise exception 'Reset not confirmed.' using hint = 'invalid';
  end if;
  truncate order_status_history, inventory_movements, order_items, orders, seeds;

  insert into seeds select * from jsonb_populate_recordset(null::seeds, p->'seeds');
  insert into orders select * from jsonb_populate_recordset(null::orders, p->'orders');
  insert into order_items select * from jsonb_populate_recordset(null::order_items, p->'order_items');
  insert into inventory_movements select * from jsonb_populate_recordset(null::inventory_movements, p->'inventory_movements');
  insert into order_status_history select * from jsonb_populate_recordset(null::order_status_history, p->'order_status_history');

  perform setval('order_number_seq', greatest((select coalesce(max(order_number), 1000) from orders), 1000));
end $$;

revoke execute on function sf_reset_demo(jsonb, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function sf_reset_demo(jsonb, text) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function sf_reset_demo(jsonb, text) to service_role;
  end if;
end $$;
