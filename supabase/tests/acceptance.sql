-- SQL acceptance tests for the transactional functions.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/acceptance.sql
-- Everything runs in a transaction that is rolled back at the end.
begin;
truncate notification_log, order_status_history, inventory_movements, order_items, orders, bundles, seeds;

create temp table t_ids (k text primary key, id uuid);

create or replace function pg_temp.expect_error(sql text, pattern text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'Expected error matching "%" but statement succeeded: %', pattern, sql;
exception when others then
  if sqlerrm not like 'Expected error%' and sqlerrm ~* pattern then return; end if;
  raise;
end $$;

create or replace function pg_temp.new_order(qty int, name text default 'Tomato — Crimson Giant', ext text default null)
returns uuid language sql as $$
  select (sf_create_order(jsonb_build_object(
    'requester_name', 'Test', 'organization_name', 'Test School', 'external_entry_id', ext,
    'items', jsonb_build_array(jsonb_build_object('requested_seed_name', name, 'requested_quantity', qty))))->>'order_id')::uuid
$$;

create or replace function pg_temp.review(oid uuid, qty int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('item_id', id, 'seed_id', seed_id, 'approved_quantity', qty, 'unavailable', false))
  from order_items where order_id = oid
$$;

create or replace function pg_temp.pack_all(oid uuid) returns void language sql as $$
  select sf_pack_items(oid, (select jsonb_agg(jsonb_build_object('item_id', id, 'packed_quantity', approved_quantity))
                             from order_items where order_id = oid));
  select sf_mark_ready(oid);
$$;

create or replace function pg_temp.tomato() returns seeds language sql as $$
  select * from seeds where name = 'Tomato' and variety = 'Crimson Giant'
$$;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

select sf_create_seed('{"name":"Tomato","variety":"Crimson Giant","category":"Fruits / Fruiting Vegetables","physical_quantity":50}');
select sf_create_seed('{"name":"Basil","category":"Herbs"}');

-- Test 1: normal allocation
insert into t_ids values ('o1', pg_temp.new_order(10));
select sf_approve_order((select id from t_ids where k='o1'), pg_temp.review((select id from t_ids where k='o1'), 10));
select pg_temp.assert((pg_temp.tomato()).physical_quantity = 50 and (pg_temp.tomato()).reserved_quantity = 10, 'T1 physical 50 reserved 10');

-- Approving twice never reserves twice
select pg_temp.expect_error(format('select sf_approve_order(%L, null)', (select id from t_ids where k='o1')), 'already been approved');
select pg_temp.assert((pg_temp.tomato()).reserved_quantity = 10, 'double approve');

-- Test 2: over-allocation (reserve up to 45, then try 10 more)
insert into t_ids values ('o2', pg_temp.new_order(35));
select sf_approve_order((select id from t_ids where k='o2'), pg_temp.review((select id from t_ids where k='o2'), 35));
insert into t_ids values ('o3', pg_temp.new_order(10));
select pg_temp.expect_error(format('select sf_approve_order(%L, %L)', (select id from t_ids where k='o3'),
  pg_temp.review((select id from t_ids where k='o3'), 10)), 'Insufficient stock');
select pg_temp.assert((pg_temp.tomato()).reserved_quantity = 45, 'T2 reservations unchanged');
select pg_temp.assert((select approved_quantity is null from order_items where order_id = (select id from t_ids where k='o3')), 'T2 review rolled back');

-- Test 4: cancellation releases without deducting (cancel o2 → reserved 10)
select sf_cancel_order((select id from t_ids where k='o2'), 'test');
select pg_temp.assert((pg_temp.tomato()).physical_quantity = 50 and (pg_temp.tomato()).reserved_quantity = 10, 'T4 cancel');

-- Test 3 + 5: deliver o1 once, second delivery refused
select pg_temp.pack_all((select id from t_ids where k='o1'));
select sf_deliver_order((select id from t_ids where k='o1'));
select pg_temp.assert((pg_temp.tomato()).physical_quantity = 40 and (pg_temp.tomato()).reserved_quantity = 0, 'T3 delivery');
select pg_temp.expect_error(format('select sf_deliver_order(%L)', (select id from t_ids where k='o1')), 'already delivered');
select pg_temp.assert((pg_temp.tomato()).physical_quantity = 40, 'T5 deducted once');
select pg_temp.assert((select count(*) = 1 from inventory_movements where movement_type = 'fulfillment'), 'T5 one movement');

-- Test 6: unknown stock is never allocated
insert into t_ids values ('o6', pg_temp.new_order(null, 'Basil'));
select pg_temp.assert((select seed_id is not null from order_items where order_id = (select id from t_ids where k='o6')), 'T6 basil matched');
select pg_temp.expect_error(format('select sf_approve_order(%L, %L)', (select id from t_ids where k='o6'),
  pg_temp.review((select id from t_ids where k='o6'), 3)), 'Stock Count Required');

-- Test 7: missing quantities import; approval needs a decision
select pg_temp.assert((select requested_quantity is null from order_items where order_id = (select id from t_ids where k='o6')), 'T7 null qty');
insert into t_ids values ('o7', pg_temp.new_order(null));
select pg_temp.expect_error(format('select sf_approve_order(%L, null)', (select id from t_ids where k='o7')), 'Set an approved quantity');

-- Unmatched names need a match
insert into t_ids values ('o8', pg_temp.new_order(5, 'Cherokee Purple Tomato'));
select pg_temp.expect_error(format('select sf_approve_order(%L, %L)', (select id from t_ids where k='o8'),
  pg_temp.review((select id from t_ids where k='o8'), 5)), 'Inventory Match Required');

-- Stock count can't go below reserved
select sf_approve_order((select id from t_ids where k='o7'), pg_temp.review((select id from t_ids where k='o7'), 8));
select pg_temp.expect_error(format('select sf_set_stock(%L, 5)', (pg_temp.tomato()).id), 'cannot be lower');

-- Test 10: duplicate external entry IDs
select pg_temp.assert((sf_create_order('{"requester_name":"A","organization_name":"B","external_entry_id":"COG-1","items":[{"requested_seed_name":"Kale"}]}')->>'duplicate')::boolean = false, 'T10 first');
select pg_temp.assert((sf_create_order('{"requester_name":"A","organization_name":"B","external_entry_id":"COG-1","items":[{"requested_seed_name":"Kale"}]}')->>'duplicate')::boolean = true, 'T10 second');
select pg_temp.assert((select count(*) = 1 from orders where external_entry_id = 'COG-1'), 'T10 one order');

\echo 'ALL SQL ACCEPTANCE TESTS PASSED'
rollback;
