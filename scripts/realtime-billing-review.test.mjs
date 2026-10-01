import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";

const readMigration = (name) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const workspace = "00000000-0000-4000-8000-000000000001";
const key = "00000000-0000-4000-8000-000000000002";
const reviewMigration = readMigration("20260911160957_realtime_billing_review");
const lifecycle = readMigration("20260713120000_secure_realtime_session_lifecycle");
const functionSql = (name) => {
  const start = lifecycle.search(new RegExp(`create (?:or replace )?function public.${name}\\(`));
  assert.ok(start >= 0);
  return lifecycle.slice(start, lifecycle.indexOf("$$;", start) + 3);
};

async function fixture(migrateReview = true) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table workspaces(id uuid primary key); create table keys(id uuid primary key);
    create table users(user_id text primary key, role text);
    create table wallets(workspace_id uuid primary key, balance_nanos bigint, reserved_nanos bigint, updated_at timestamptz);
    create table gateway_wallet_reservations(reservation_id text primary key, workspace_id uuid, status text, amount_nanos bigint,
      hold_ref_id text, captured_nanos bigint, released_nanos bigint, capture_ref_id text, release_ref_id text,
      captured_at timestamptz, released_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create table credit_ledger(workspace_id uuid, event_time timestamptz, kind text, amount_nanos bigint,
      before_balance_nanos bigint, after_balance_nanos bigint, before_reserved_nanos bigint, after_reserved_nanos bigint,
      ref_type text, ref_id text, created_at timestamptz, status text, unique(ref_type,ref_id));
    create table gateway_requests(id uuid default gen_random_uuid(), workspace_id uuid, request_id text, realtime_session_id text,
      endpoint text, model_id text, provider text, stream boolean, byok boolean, status_code int, success boolean,
      usage jsonb, cost_nanos bigint, currency text, pricing_lines jsonb, key_id uuid, created_at timestamptz,
      native_response_id text, error_code text, error_message text, generation_ms integer);
    insert into workspaces values ('${workspace}'); insert into keys values ('${key}');
    insert into users values ('admin','admin'),('member','member');
    insert into wallets values ('${workspace}',10000000000,0,now());`);
  const original = readMigration("20260707170000_realtime_voice_sessions");
  const start = original.indexOf("create table if not exists public.gateway_realtime_sessions");
  await db.exec(original.slice(start, original.indexOf("create index", start)));
  await db.exec("alter table gateway_realtime_sessions drop constraint gateway_realtime_sessions_status_check;");
  for (const name of ["gateway_realtime_create_with_hold", "gateway_realtime_settle_once", "gateway_realtime_mark_billing_unresolved"]) await db.exec(functionSql(name));
  if (migrateReview) await db.exec(reviewMigration);
  await db.query(`select * from gateway_realtime_create_with_hold($1,'rt_test',$2,'member','chat','openai','openai/gpt-live-1',
    'gpt-live-1','marin',now()+interval '1 hour','rt_test:','rt_test:1',5000000000,'hash')`, [workspace, key]);
  await db.query(`select * from gateway_realtime_mark_billing_unresolved($1,'rt_test',$2,'missing_final')`,
    [workspace, { live_started: true, live_seconds: 9 }]);
  return db;
}
async function current(db) { return (await db.query("select * from gateway_realtime_billing_reviews where session_id='rt_test'")).rows[0]; }
async function decide(db, action, options = {}) {
  return db.query("select gateway_realtime_review_decide('rt_test',$1,$2,$3,$4,$5) as result",
    [options.actor ?? "admin", options.id ?? randomUUID(), options.version ?? (await current(db)).version, action, options.reason ?? "Verified incident and supporting evidence."]);
}
async function quote(db, cost = 7500000) {
  return db.query(`select gateway_realtime_review_evidence(session_id,usage,metadata,$1,'[]',false,null,usage)
    from gateway_realtime_sessions where session_id='rt_test'`, [cost]);
}

test("capture is exact, atomic and idempotent; excess hold is released", async () => {
  const db = await fixture();
  try {
    await quote(db); const version = (await current(db)).version; const id = randomUUID();
    await decide(db, "capture_confirmed", { id, version });
    const replay = await decide(db, "capture_confirmed", { id, version });
    assert.equal(replay.rows[0].result.already_applied, true);
    assert.deepEqual((await db.query("select balance_nanos,reserved_nanos from wallets")).rows[0], { balance_nanos: 9992500000, reserved_nanos: 0 });
    assert.equal((await db.query("select count(*)::int as n from credit_ledger")).rows[0].n, 1);
    assert.equal((await db.query("select cost_nanos from gateway_requests")).rows[0].cost_nanos, 7500000);
    assert.equal((await current(db)).access_blocked, true);
    assert.equal((await db.query("select released_nanos from gateway_realtime_sessions")).rows[0].released_nanos, 4992500000);
    await assert.rejects(decide(db, "write_off", { id, version }), /idempotency_conflict/);
  } finally { await db.close(); }
});

test("write-off never charges and access restoration is a separate audited action", async () => {
  const db = await fixture();
  try {
    await assert.rejects(decide(db, "restore_access"), /still_open/);
    await decide(db, "write_off");
    assert.equal((await current(db)).evidence_usage.live_seconds, 9);
    assert.deepEqual((await db.query("select usage from gateway_requests")).rows[0].usage, {});
    assert.equal((await db.query("select count(*)::int as n from credit_ledger")).rows[0].n, 0);
    assert.deepEqual((await db.query("select balance_nanos,reserved_nanos from wallets")).rows[0], { balance_nanos: 10000000000, reserved_nanos: 0 });
    const create = () => db.query(`select * from gateway_realtime_create_with_hold($1,'rt_new',$2,'another-user','chat','openai',
      'openai/gpt-live-1','gpt-live-1','marin',now()+interval '1 hour','rt_new:','rt_new:1',5000000000,'hash')`, [workspace,key]);
    await assert.rejects(create(), /billing_review_required/);
    await decide(db, "restore_access"); await create();
    assert.equal((await current(db)).access_blocked, false);
    assert.equal((await db.query("select count(*)::int as n from gateway_realtime_billing_decisions where actor_user_id='admin'")).rows[0].n, 2);
  } finally { await db.close(); }
});

test("no missing/stale quote, extra-wallet capture, or non-admin decision", async () => {
  const db = await fixture();
  try {
    await assert.rejects(decide(db, "capture_confirmed"), /evidence_missing/);
    await assert.rejects(decide(db, "write_off", { actor: "member" }), /forbidden/);
    await assert.rejects(decide(db, "write_off", { reason: "short" }), /invalid_decision/);
    const version = (await current(db)).version; await quote(db);
    await assert.rejects(decide(db, "capture_confirmed", { version }), /stale/);
    await quote(db, 5000000001); await assert.rejects(decide(db, "capture_confirmed"), /cost_exceeds_hold/);
    await quote(db);
    await db.exec(`update gateway_realtime_sessions set usage='{"live_started":true,"live_seconds":10}' where session_id='rt_test'`);
    assert.equal((await current(db)).confirmed_cost_nanos, null);
    await assert.rejects(decide(db, "capture_confirmed"), /evidence_missing/);
    assert.equal((await db.query("select reserved_nanos from wallets")).rows[0].reserved_nanos, 5000000000);
  } finally { await db.close(); }
});

test("failed request-summary update rolls back wallet, reservations and audit", async () => {
  const db = await fixture();
  try {
    await quote(db); await db.exec("delete from gateway_requests");
    await assert.rejects(decide(db, "capture_confirmed"), /request_summary_missing/);
    assert.equal((await current(db)).status, "open");
    assert.equal((await db.query("select reserved_nanos from wallets")).rows[0].reserved_nanos, 5000000000);
    assert.equal((await db.query("select count(*)::int as n from gateway_realtime_billing_decisions")).rows[0].n, 0);
  } finally { await db.close(); }
});

test("hold extensions have a deadline and application roles cannot alter audit or evidence", async () => {
  const db = await fixture();
  try {
    await decide(db, "retain"); await decide(db, "retry");
    await db.exec("update gateway_realtime_billing_reviews set opened_at=now()-interval '8 days'");
    await assert.rejects(decide(db, "retain"), /retention_limit/);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec("update gateway_realtime_billing_decisions set reason='forged'"), /permission denied/);
      await assert.rejects(db.exec("update gateway_realtime_billing_reviews set confirmed_cost_nanos=1"), /permission denied/);
      if (role !== "service_role") await assert.rejects(decide(db, "write_off", { version: 1 }), /permission denied/);
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});

test("backfill registers historical incidents without changing their held funds", async () => {
  const db = await fixture(false);
  try {
    const before = (await db.query("select * from wallets")).rows;
    await db.exec(reviewMigration);
    assert.deepEqual((await db.query("select * from wallets")).rows, before);
    assert.equal((await current(db)).status, "open");
    assert.equal((await current(db)).confirmed_cost_nanos, null);
    assert.equal((await db.query("select count(*)::int as n from credit_ledger")).rows[0].n, 0);
  } finally { await db.close(); }
});

test("billing reviews follow workspace deletion for open and resolved incidents", async () => {
  for (const resolved of [false, true]) {
    const db = await fixture();
    try {
      await decide(db, resolved ? "write_off" : "retain");
      assert.ok((await db.query("select count(*)::int as n from gateway_realtime_billing_decisions")).rows[0].n > 0);
      await db.query("delete from workspaces where id=$1", [workspace]);
      for (const table of ["gateway_realtime_sessions", "gateway_realtime_billing_reviews", "gateway_realtime_billing_decisions"]) {
        assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0);
      }
    } finally { await db.close(); }
  }
});
