#!/usr/bin/env bash
# Test 9: two sessions approve competing orders for the same seed at the same time.
# Usage: DATABASE_URL=postgres://... bash supabase/tests/concurrency.sh
# WARNING: truncates all SeedFlow tables in the target database. Use a scratch DB.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to a scratch database}"
q() { psql "$DATABASE_URL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"; }

q "truncate order_status_history, inventory_movements, order_items, orders, seeds"
SEED=$(q "select (sf_create_seed('{\"name\":\"Tomato\",\"variety\":\"Race\",\"physical_quantity\":50}')).id")
mk() { q "select sf_create_order('{\"requester_name\":\"R\",\"organization_name\":\"S$1\",\"items\":[{\"requested_seed_name\":\"Tomato Race\",\"requested_quantity\":30}]}')->>'order_id'"; }
A=$(mk 1); B=$(mk 2)
rev() { echo "(select jsonb_agg(jsonb_build_object('item_id',id,'seed_id',seed_id,'approved_quantity',30,'unavailable',false)) from order_items where order_id='$1')"; }

# Session A holds its transaction open for 2s after approving; B starts meanwhile.
psql "$DATABASE_URL" -X -q -c "begin; select sf_approve_order('$A', $(rev "$A")); select pg_sleep(2); commit;" >/tmp/sf_a.log 2>&1 &
sleep 0.5
set +e
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c "select sf_approve_order('$B', $(rev "$B"));" >/tmp/sf_b.log 2>&1
B_EXIT=$?
set -e
wait

RES=$(q "select reserved_quantity from seeds where id='$SEED'")
echo "Session B exit code: $B_EXIT (expected non-zero)"
grep -o "Insufficient stock[^.]*" /tmp/sf_b.log || true
echo "Reserved after race: $RES (expected 30)"
[ "$B_EXIT" -ne 0 ] && [ "$RES" = "30" ] && echo "CONCURRENCY TEST PASSED" || { echo "CONCURRENCY TEST FAILED"; exit 1; }
