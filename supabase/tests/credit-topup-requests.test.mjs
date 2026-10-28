// Standalone PostgreSQL regression test for CLI credit top-ups: the billing:write allowlist
// update, the credit_topup_requests table (cap, flows, RLS), the pending cap and idempotency
// of public.create_credit_topup_request, confirm/decline rules (token, owner/admin, expiry,
// single use) of public.decide_credit_topup_request, and the one-PaymentIntent-per-request
// rule of public.record_credit_topup_payment. Runs the whole migration on a minimal schema.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/credit-topup-requests.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_cli_credit_topups.sql'));
assert(migrationName, 'the CLI credit top-ups migration exists');
const migration = await read(`../migrations/${migrationName}`);
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
for (const file of [
  '../schemas/public/tables/credit_topup_requests.sql',
  '../schemas/public/functions/create_credit_topup_request.sql',
  '../schemas/public/functions/decide_credit_topup_request.sql',
  '../schemas/public/functions/record_credit_topup_payment.sql',
]) {
  assert(normalize(migration).includes(normalize(await read(file))), `${file} is in the migration`);
}
const exportConfig = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of ['public/tables/credit_topup_requests.sql', 'public/functions/create_credit_topup_request.sql', 'public/functions/decide_credit_topup_request.sql', 'public/functions/record_credit_topup_payment.sql']) {
  assert(exportConfig.loadOrder.includes(file) && exportConfig.files.includes(file), `${file} is registered for the schema export`);
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W1 = id(1);
const W2 = id(2);
const owner = id(11);
const admin = id(12);
const member = id(13);
const outsider = id(14);
const legacyOwner = id(15); // workspaces.owner_user_id without a member row

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const rejects = (promise, pattern, message) => assert.rejects(promise, pattern, message);
const create = (args = {}) => one(
  `select * from public.create_credit_topup_request($1, $2, 'oauth', 'phaseo_cli', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
  [args.workspace ?? W1, args.by ?? member, args.flow ?? 'saved_card', args.amount ?? 2000,
    args.flow === 'checkout' ? null : (args.pm ?? 'pm_1'), args.flow === 'checkout' ? null : 'visa', args.flow === 'checkout' ? null : '4242',
    args.token ?? 'hash-a', args.key ?? null, args.ttl ?? 1800, args.max ?? 5],
);
const decide = (requestId, user, decision, token = 'hash-a') => one(
  'select * from public.decide_credit_topup_request($1, $2, $3, $4)', [requestId, token, user, decision]);
const record = async (requestId, pi, outcome, reason = null, workspace = W1) => (await one(
  'select public.record_credit_topup_payment($1, $2, $3, $4, $5) ok', [requestId, workspace, pi, outcome, reason])).ok;
const request = (requestId) => one('select * from public.credit_topup_requests where id = $1', [requestId]);

try {
  await db.exec(`
    set timezone = 'UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create type public.workspace_role as enum ('owner', 'admin', 'member');
    create table public.workspaces (id uuid primary key, owner_user_id uuid);
    create table public.workspace_members (workspace_id uuid not null references public.workspaces(id) on delete cascade, user_id uuid not null, role public.workspace_role not null default 'member', primary key (workspace_id, user_id));
    create table public.oauth_clients (id text primary key, allowed_scopes text[], updated_at timestamptz);
    insert into public.oauth_clients values ('phaseo_cli', array['credits:read', 'me:read'], null), ('other_app', array['me:read'], null);
    insert into public.workspaces values ('${W1}', '${legacyOwner}'), ('${W2}', '${outsider}');
    insert into public.workspace_members values
      ('${W1}', '${owner}', 'owner'), ('${W1}', '${admin}', 'admin'), ('${W1}', '${member}', 'member'),
      ('${W2}', '${outsider}', 'owner');
  `);
  await db.exec(migration);

  // ---- billing:write is added to the CLI client only, once.
  assert.deepEqual((await one("select allowed_scopes from public.oauth_clients where id = 'phaseo_cli'")).allowed_scopes, ['billing:write', 'credits:read', 'me:read']);
  assert.deepEqual((await one("select allowed_scopes from public.oauth_clients where id = 'other_app'")).allowed_scopes, ['me:read']);
  await db.exec(migration.split('CREATE TABLE')[0]);
  assert.deepEqual((await one("select allowed_scopes from public.oauth_clients where id = 'phaseo_cli'")).allowed_scopes, ['billing:write', 'credits:read', 'me:read'], 'the allowlist update is idempotent');

  // ---- Table constraints: $5 to $500, saved_card needs a payment method, known statuses only.
  await rejects(create({ amount: 499 }), /amount_cents_check/, 'below the $5 minimum is refused');
  await rejects(create({ amount: 50001 }), /amount_cents_check/, 'above the $500 cap is refused');
  await rejects(db.query(`insert into public.credit_topup_requests (workspace_id, requested_via, flow, amount_cents, confirm_token_hash, expires_at) values ('${W1}', 'oauth', 'saved_card', 1000, 'h', now())`), /saved_card_check/);
  await rejects(db.query(`insert into public.credit_topup_requests (workspace_id, requested_via, flow, amount_cents, confirm_token_hash, expires_at, status) values ('${W1}', 'oauth', 'checkout', 1000, 'h', now(), 'refunded')`), /status_check/);
  const maxRequest = await create({ amount: 50000, key: 'max' });
  assert.equal(maxRequest.created, true, 'exactly $500 is allowed');

  // ---- Expiry is 30 minutes by default.
  const ttl = await one('select extract(epoch from expires_at - created_at)::int s from public.credit_topup_requests where id = $1', [maxRequest.request_id]);
  assert.ok(Math.abs(ttl.s - 1800) <= 1, 'requests expire after 30 minutes');

  // ---- Idempotency: the same key returns the same request; a different amount conflicts.
  const first = await create({ key: 'agent-run-1' });
  const again = await create({ key: 'agent-run-1' });
  assert.equal(first.created, true);
  assert.equal(again.created, false);
  assert.equal(again.request_id, first.request_id);
  await rejects(create({ key: 'agent-run-1', amount: 3000 }), /credit_topup_idempotency_conflict/);
  await rejects(create({ key: 'agent-run-1', by: admin }), /credit_topup_idempotency_conflict/, 'another requester cannot reuse the key');

  // ---- At most 5 pending per workspace; expired ones stop counting; other workspaces are separate.
  await create(); await create(); await create(); // 5 pending now (max, agent-run-1 and these three)
  await rejects(create(), /credit_topup_too_many_pending/);
  assert.equal((await create({ workspace: W2, by: outsider })).created, true, 'the cap is per workspace');
  await db.query(`update public.credit_topup_requests set expires_at = now() - interval '1 second' where id = $1`, [maxRequest.request_id]);
  const afterExpiry = await create();
  assert.equal(afterExpiry.created, true, 'an expired request frees a slot');
  assert.equal((await request(maxRequest.request_id)).status, 'expired');
  assert.equal((await request(maxRequest.request_id)).reason, 'expired');

  // ---- Deciding needs the token and an owner or admin of the request's workspace.
  await rejects(decide(first.request_id, owner, 'confirm', 'wrong-hash'), /credit_topup_not_found/);
  await rejects(decide(first.request_id, member, 'confirm'), /credit_topup_forbidden/, 'members cannot confirm');
  await rejects(decide(first.request_id, outsider, 'confirm'), /credit_topup_forbidden/, 'owners of other workspaces cannot confirm');
  await rejects(decide(id(99), owner, 'confirm'), /credit_topup_not_found/);
  await rejects(decide(first.request_id, owner, 'approve'), /credit_topup_invalid_arguments/);

  // ---- Confirm is single use; repeating returns the status without changes.
  const confirmed = await decide(first.request_id, admin, 'confirm');
  assert.deepEqual({ ...confirmed }, { status: 'confirmed', reason: null, changed: true });
  const confirmedAgain = await decide(first.request_id, owner, 'confirm');
  assert.deepEqual({ ...confirmedAgain }, { status: 'confirmed', reason: null, changed: false });
  const declineAfterConfirm = await decide(first.request_id, owner, 'decline');
  assert.deepEqual({ ...declineAfterConfirm }, { status: 'confirmed', reason: null, changed: false }, 'a confirmed request cannot be declined');
  assert.equal((await request(first.request_id)).decided_by, admin);

  // ---- Decline, including by the legacy workspace owner column.
  const toDecline = await create({ by: owner });
  assert.deepEqual({ ...(await decide(toDecline.request_id, legacyOwner, 'decline')) }, { status: 'declined', reason: 'declined', changed: true });
  assert.deepEqual({ ...(await decide(toDecline.request_id, owner, 'confirm')) }, { status: 'declined', reason: 'declined', changed: false }, 'a declined request cannot be confirmed');

  // ---- An expired request cannot be confirmed.
  const late = (await rows("select id from public.credit_topup_requests where status = 'pending' and workspace_id = $1 limit 1", [W1]))[0].id;
  await db.query(`update public.credit_topup_requests set expires_at = now() - interval '1 second' where id = $1`, [late]);
  assert.deepEqual({ ...(await decide(late, owner, 'confirm')) }, { status: 'expired', reason: 'expired', changed: true });
  assert.equal((await request(late)).decided_by, null);

  // ---- One PaymentIntent per request; paid is idempotent; failed does not undo paid.
  assert.equal(await record(first.request_id, 'pi_A', 'paid', null, W2), false, 'the workspace must match');
  assert.equal(await record(first.request_id, 'pi_A', 'paid'), true);
  const paid = await request(first.request_id);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.stripe_payment_intent_id, 'pi_A');
  assert.ok(paid.paid_at);
  assert.equal(await record(first.request_id, 'pi_A', 'paid'), true, 'a repeated webhook is accepted');
  assert.equal(await record(first.request_id, 'pi_B', 'paid'), false, 'a second PaymentIntent is refused');
  assert.equal(await record(first.request_id, 'pi_A', 'failed', 'card_declined'), false, 'failed cannot replace paid');
  assert.equal((await request(first.request_id)).status, 'paid');
  await rejects(db.query(`update public.credit_topup_requests set stripe_payment_intent_id = 'pi_A' where id = $1`, [afterExpiry.request_id]), /stripe_payment_intent_id_key/);

  // ---- Failed keeps its reason; a Checkout payment can still land after expiry.
  const toFail = await create({ by: owner });
  await decide(toFail.request_id, owner, 'confirm');
  assert.equal(await record(toFail.request_id, 'pi_C', 'failed', 'card_declined'), true);
  assert.deepEqual(
    { ...(await one('select status, reason, stripe_payment_intent_id from public.credit_topup_requests where id = $1', [toFail.request_id])) },
    { status: 'failed', reason: 'card_declined', stripe_payment_intent_id: 'pi_C' });
  assert.equal(await record(late, 'pi_D', 'paid'), true, 'money taken after expiry is still recorded');
  assert.equal((await request(late)).status, 'paid');

  // ---- Clients have no direct access; functions are service role only.
  await db.exec('grant usage on schema public to anon, authenticated, service_role; grant select on public.credit_topup_requests to authenticated;');
  await db.exec('set role authenticated');
  assert.equal((await rows('select * from public.credit_topup_requests')).length, 0, 'RLS hides every row from clients');
  await rejects(db.query(`select * from public.decide_credit_topup_request('${first.request_id}', 'hash-a', '${owner}', 'confirm')`), /permission denied/);
  await rejects(db.query(`select public.record_credit_topup_payment('${first.request_id}', '${W1}', 'pi_A', 'paid')`), /permission denied/);
  await db.exec('reset role');
  for (const fn of ['create_credit_topup_request', 'decide_credit_topup_request', 'record_credit_topup_payment']) {
    const security = await one(`select prosecdef, proconfig from pg_proc where proname = $1`, [fn]);
    assert.equal(security.prosecdef, true, `${fn} is security definer`);
    assert.deepEqual(security.proconfig, ['search_path=""'], `${fn} pins an empty search_path`);
  }

  console.log('credit-topup-requests: all assertions passed');
} finally {
  await db.close();
}
