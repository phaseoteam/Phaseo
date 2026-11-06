// Standalone PostgreSQL regression test for browser-approved API keys (CLI coding-agent setup):
// public.api_key_requests and its functions. Checks that:
// - signed-in clients and anon can't reach the table or the functions (so not through /rest/v1 either),
//   and the service role reaches the table only through the functions,
// - only an owner or admin can ask, with at most 5 requests waiting,
// - only the requester can approve or deny, approval returns exactly the stored limits, and a request is
//   approved once,
// - only the requester holding the verifier collects the secret, exactly once, and it is wiped,
// - polling is rate-limited, repeated wrong verifiers deny the request, and requests and secrets expire.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/api-key-requests.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_api_key_requests.sql'));
assert(migrationName, 'the api_key_requests migration exists');
const migration = await read(`../migrations/${migrationName}`);
const schemaFiles = [
  'public/tables/api_key_requests.sql',
  'public/functions/create_api_key_request.sql',
  'public/functions/get_api_key_request.sql',
  'public/functions/begin_api_key_request_approval.sql',
  'public/functions/finish_api_key_request_approval.sql',
  'public/functions/abort_api_key_request_approval.sql',
  'public/functions/deny_api_key_request.sql',
  'public/functions/collect_api_key_request.sql',
  'public/functions/wipe_expired_api_key_request_secrets.sql',
];
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of schemaFiles) {
  assert(normalize(migration).includes(normalize(await read(`../schemas/${file}`))), `${file} is in the migration`);
  assert(manifest.loadOrder.includes(file) && manifest.files.includes(file), `${file} is registered for the schema export`);
}
assert(!/\bdelete\s+from\b|\bdrop\s+(table|function)\b|\btruncate\b/i.test(migration), 'the migration deletes nothing');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W1 = id(1);
const owner = id(11);
const admin = id(12);
const member = id(13);
const outsider = id(14);
const KEY = id(100);
const challenge = (c = 'a') => c.repeat(43);
const CLI = 'oauth:phaseo_cli';
const W2 = id(2);

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const create = (args = {}) => one(
  `select * from public.create_api_key_request($1, $2, 'oauth', 'phaseo_cli', 'Phaseo CLI', $3, $4, $5, $6, $7, $8, $9, $10)`,
  [args.workspace ?? W1, args.by ?? admin, args.agent ?? 'codex', args.name ?? 'Phaseo CLI: Codex API Key',
    args.daily ?? 0, args.monthly ?? 100_000_000_000, args.days ?? 90, args.challenge ?? challenge(), args.credential ?? CLI, args.tokenWorkspace ?? W1],
);
const begin = (request, user = admin) => one('select * from public.begin_api_key_request_approval($1, $2)', [request, user]);
const finish = async (request, user = admin, cipher = 'v1.iv.ct') =>
  (await one('select public.finish_api_key_request_approval($1, $2, $3, $4) ok', [request, user, KEY, cipher])).ok;
const collect = async (request, user = admin, code = challenge(), credential = CLI, tokenWorkspace = W1) => {
  // Each poll is more than the minimum interval after the previous one.
  await db.query(`update public.api_key_requests set last_polled_at = last_polled_at - interval '1 minute' where id = $1 and last_polled_at is not null`, [request]);
  return one('select * from public.collect_api_key_request($1, $2, $3, $4, $5)', [request, user, credential, tokenWorkspace, code]);
};
const row = (request) => one('select * from public.api_key_requests where id = $1', [request]);

try {
  await db.exec(`
    set timezone = 'UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create type public.workspace_role as enum ('owner', 'admin', 'member');
    create table public.workspaces (id uuid primary key, owner_user_id uuid);
    create table public.workspace_members (workspace_id uuid not null references public.workspaces(id) on delete cascade, user_id uuid not null, role public.workspace_role not null default 'member', primary key (workspace_id, user_id));
    create table public.keys (id uuid primary key);
    insert into auth.users values ('${owner}'), ('${admin}'), ('${member}'), ('${outsider}');
    insert into public.workspaces values ('${W1}', '${owner}');
    insert into public.workspace_members values ('${W1}', '${admin}', 'admin'), ('${W1}', '${member}', 'member');
    insert into public.keys values ('${KEY}');
    -- Supabase's default privileges grant new tables and functions to the API roles; the migration must take them away.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await db.exec(migration);

  // Signed-in clients and anon: no table access and no function access, so /rest/v1 can't reach either.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.api_key_requests'), /permission denied/, `${role} can't read the table`);
    await assert.rejects(db.query(`insert into public.api_key_requests (workspace_id, requested_by, requested_via, client_name, key_name, monthly_cost_nanos, key_lifetime_days, code_challenge, expires_at) values ('${W1}', '${admin}', 'oauth', 'x', 'x', 1, 1, '${challenge()}', now())`), /permission denied/, `${role} can't insert`);
    await assert.rejects(create(), /permission denied/, `${role} can't create a request`);
    await assert.rejects(db.query(`select * from public.get_api_key_request('${id(9)}')`), /permission denied/, `${role} can't read a request`);
    await assert.rejects(begin(id(9)), /permission denied/, `${role} can't approve`);
    await assert.rejects(db.query('select public.wipe_expired_api_key_request_secrets()'), /permission denied/, `${role} can't run the cleanup`);
    await assert.rejects(db.query(`select * from public.collect_api_key_request('${id(9)}', '${admin}', '${CLI}', '${W1}', '${challenge()}')`), /permission denied/, `${role} can't collect`);
    await db.exec('reset role');
  }
  // The service role uses the functions, not the table.
  await db.exec('set role service_role');
  await assert.rejects(db.query('select * from public.api_key_requests'), /permission denied/, 'service_role has no table grants');
  const viaService = await create();
  assert(viaService.id && viaService.expires_at, 'service_role can create through the function');
  await db.exec('reset role');
  const rls = await one(`select relrowsecurity from pg_class where oid = 'public.api_key_requests'::regclass`);
  assert.equal(rls.relrowsecurity, true, 'RLS is on');
  const definers = await rows(`select proname from pg_proc where proname like '%api_key_request%' and prosecdef order by proname`);
  assert.equal(definers.length, 8, 'every function is SECURITY DEFINER (and so service-role only, above)');

  // Asking: owners and admins only, valid challenge and limits, at most 5 waiting.
  await assert.rejects(create({ by: member }), /api_key_request_forbidden/, 'a member cannot ask for a key');
  await assert.rejects(create({ by: outsider }), /api_key_request_forbidden/, 'someone outside the workspace cannot ask');
  assert((await create({ by: owner })).id, 'the workspace owner can ask without a member row');
  await assert.rejects(create({ challenge: 'short' }), /api_key_requests_code_challenge_check/, 'the challenge must be an S256 value');
  await assert.rejects(create({ daily: 0, monthly: 0 }), /api_key_requests_limits_check/, 'a request must carry a spending limit');
  await assert.rejects(create({ days: 0 }), /api_key_requests_key_lifetime_days_check/);
  const expires = (await create()).expires_at;
  const minutes = (expires.getTime() - Date.now()) / 60_000;
  assert(minutes > 9.9 && minutes <= 10.01, `requests expire in 10 minutes, got ${minutes}`);
  // The admin now has two waiting (one through the service role above); the owner's doesn't count.
  for (let i = 0; i < 3; i += 1) await create();
  await assert.rejects(create(), /api_key_request_limit/, 'at most 5 requests wait per person and workspace');
  await db.exec(`update public.api_key_requests set status = 'denied'`);

  // The page reads the request without its challenge or secret.
  const pending = await create({ daily: 5_000_000_000, monthly: 100_000_000_000, days: 90 });
  const shown = await one('select * from public.get_api_key_request($1)', [pending.id]);
  assert.equal(shown.status, 'pending');
  assert.equal('code_challenge' in shown || 'secret_ciphertext' in shown, false, 'no challenge or secret on the page');
  assert.deepEqual([shown.key_name, Number(shown.daily_cost_nanos), Number(shown.monthly_cost_nanos), shown.key_lifetime_days, shown.client_name],
    ['Phaseo CLI: Codex API Key', 5_000_000_000, 100_000_000_000, 90, 'Phaseo CLI']);

  // Only the requester approves; approval returns exactly what the page showed; one approval wins.
  await assert.rejects(begin(pending.id, owner), /api_key_request_not_found/, 'another admin cannot approve someone else\'s request');
  await assert.rejects(begin(pending.id, outsider), /api_key_request_not_found/);
  assert.deepEqual((await collect(pending.id)).outcome, 'pending', 'pending before approval');
  const claimed = await begin(pending.id);
  assert.equal(claimed.status, 'approving');
  assert.equal(claimed.changed, true);
  assert.deepEqual([claimed.workspace_id, claimed.key_name, Number(claimed.daily_cost_nanos), Number(claimed.monthly_cost_nanos), claimed.key_lifetime_days],
    [shown.workspace_id, shown.key_name, Number(shown.daily_cost_nanos), Number(shown.monthly_cost_nanos), shown.key_lifetime_days], 'the approved limits are the shown limits');
  const again = await begin(pending.id);
  assert.deepEqual([again.status, again.changed], ['approving', false], 'a second approval does not claim it again');
  assert.equal((await collect(pending.id)).outcome, 'pending', 'still pending while the key is being created');
  assert.equal(await finish(pending.id, owner), false, 'only the claiming person can finish');
  assert.equal(await finish(pending.id), true);
  assert.equal(await finish(pending.id), false, 'finished once');
  assert.equal((await row(pending.id)).status, 'approved');

  // Collecting: other people and wrong verifiers get nothing; the secret comes out once and is wiped.
  assert.deepEqual(await collect(pending.id, owner), { outcome: 'not_found', workspace_id: null, key_id: null, secret_ciphertext: null }, 'a different user cannot collect');
  assert.equal((await collect(pending.id, admin, challenge('b'))).outcome, 'invalid_verifier', 'a wrong verifier cannot collect');
  const collected = await collect(pending.id);
  assert.deepEqual(collected, { outcome: 'approved', workspace_id: W1, key_id: KEY, secret_ciphertext: 'v1.iv.ct' });
  assert.deepEqual((await collect(pending.id)).outcome, 'collected', 'the secret is returned once');
  const after = await row(pending.id);
  assert.equal(after.secret_ciphertext, null, 'the secret is wiped on pickup');
  assert.equal(after.status, 'collected');
  assert(after.collected_at);

  // Polling faster than every 2 seconds is refused without changing anything.
  const polled = await create();
  assert.equal((await one('select * from public.collect_api_key_request($1, $2, $3, $4, $5)', [polled.id, admin, CLI, W1, challenge()])).outcome, 'pending');
  assert.equal((await one('select * from public.collect_api_key_request($1, $2, $3, $4, $5)', [polled.id, admin, CLI, W1, challenge()])).outcome, 'slow_down');

  // Denying: only the requester; a denied request can't be approved or collected.
  await assert.rejects(one('select public.deny_api_key_request($1, $2) s', [polled.id, owner]), /api_key_request_not_found/);
  assert.equal((await one('select public.deny_api_key_request($1, $2) s', [polled.id, admin])).s, 'denied');
  assert.deepEqual([(await begin(polled.id)).status, (await begin(polled.id)).changed], ['denied', false], 'a denied request cannot be approved');
  assert.equal((await collect(polled.id)).outcome, 'denied');
  assert.equal((await row(polled.id)).key_id, null, 'a denied request has no key');

  // Abort puts a claimed request back to pending.
  const aborted = await create();
  await begin(aborted.id);
  assert.equal((await one('select public.abort_api_key_request_approval($1, $2) ok', [aborted.id, admin])).ok, true);
  assert.equal((await row(aborted.id)).status, 'pending');
  assert.equal((await row(aborted.id)).decided_by, null);

  // Expiry: a pending request expires, and so does an approved secret nobody collected.
  await db.query(`update public.api_key_requests set expires_at = now() - interval '1 second' where id = $1`, [aborted.id]);
  assert.equal((await one('select * from public.get_api_key_request($1)', [aborted.id])).status, 'expired', 'the page shows it expired');
  assert.equal((await begin(aborted.id)).status, 'expired', 'an expired request cannot be approved');
  assert.equal((await collect(aborted.id)).outcome, 'expired');
  const stale = await create();
  await begin(stale.id);
  await finish(stale.id);
  await db.query(`update public.api_key_requests set secret_expires_at = now() - interval '1 second' where id = $1`, [stale.id]);
  assert.equal((await collect(stale.id)).outcome, 'expired', 'an uncollected secret expires');
  assert.equal((await row(stale.id)).secret_ciphertext, null, 'and is wiped');
  // A new request also sweeps expired secrets.
  const swept = await create();
  await begin(swept.id);
  await finish(swept.id);
  await db.query(`update public.api_key_requests set secret_expires_at = now() - interval '1 second' where id = $1`, [swept.id]);
  await create();
  assert.deepEqual([(await row(swept.id)).status, (await row(swept.id)).secret_ciphertext], ['expired', null], 'expired secrets are swept');
  await db.exec(`update public.api_key_requests set status = 'denied' where status = 'pending'`);

  // Five wrong verifiers deny the request and wipe its secret.
  const guessed = await create();
  await begin(guessed.id);
  await finish(guessed.id);
  for (let i = 0; i < 4; i += 1) assert.equal((await collect(guessed.id, admin, challenge('c'))).outcome, 'invalid_verifier');
  assert.equal((await row(guessed.id)).status, 'approved', 'four wrong guesses leave it approved');
  assert.equal((await collect(guessed.id, admin, challenge('c'))).outcome, 'invalid_verifier');
  assert.deepEqual([(await row(guessed.id)).status, (await row(guessed.id)).secret_ciphertext], ['denied', null], 'the fifth denies it and wipes the secret');
  assert.equal((await collect(guessed.id)).outcome, 'denied', 'the right verifier is too late');

  // Reserved names: keys Phaseo manages are hidden from Settings and the key limit, so a request can't take one.
  for (const name of ['__chat_route_managed_key__', '__slack_agent_managed_key__', ' __anything__ ']) {
    await assert.rejects(create({ name }), /api_key_requests_key_name_check/, `${name} is reserved`);
  }
  await db.exec(`update public.api_key_requests set status = 'denied' where status in ('pending', 'approving')`);

  // Pickup is bound to the credential and token workspace that asked, not just the person. Another client or
  // workspace gets not_found and can't use up the five verifier attempts; a refreshed token of the same
  // client (same credential, user and workspace) collects normally.
  const bound = await create();
  await begin(bound.id);
  await finish(bound.id);
  for (const [credential, tokenWorkspace, label] of [['oauth:partner_app', W1, 'another OAuth client'], ['api_key:mk_1', W1, 'a management key'], [CLI, W2, 'a token for another workspace']]) {
    for (let i = 0; i < 6; i += 1) {
      assert.equal((await collect(bound.id, admin, challenge('z'), credential, tokenWorkspace)).outcome, 'not_found', label);
    }
  }
  assert.deepEqual([(await row(bound.id)).failed_verifier_attempts, (await row(bound.id)).status, (await row(bound.id)).last_polled_at],
    [0, 'approved', null], 'other callers changed nothing');
  const refreshed = await collect(bound.id);
  assert.equal(refreshed.outcome, 'approved', 'the same client, user and workspace collect after a token refresh');
  assert.equal(refreshed.secret_ciphertext, 'v1.iv.ct');
  // The CLI may ask for a key in another workspace of the person's; pickup follows the token's workspace.
  await db.exec(`insert into public.workspaces values ('${W2}', '${owner}'); insert into public.workspace_members values ('${W2}', '${admin}', 'admin')`);
  const elsewhere = await create({ workspace: W2, tokenWorkspace: W1 });
  await begin(elsewhere.id);
  await finish(elsewhere.id);
  assert.equal((await collect(elsewhere.id, admin, challenge(), CLI, W2)).outcome, 'not_found');
  assert.deepEqual(await collect(elsewhere.id), { outcome: 'approved', workspace_id: W2, key_id: KEY, secret_ciphertext: 'v1.iv.ct' });

  // Cleanup with no later request or poll: the scheduled job wipes uncollected secrets past their expiry and
  // leaves the row, and secrets still in time.
  const forgotten = await create();
  await begin(forgotten.id);
  await finish(forgotten.id);
  const inTime = await create();
  await begin(inTime.id);
  await finish(inTime.id);
  await db.query(`update public.api_key_requests set secret_expires_at = now() - interval '1 second' where id = $1`, [forgotten.id]);
  await db.exec('set role service_role');
  assert.equal((await one('select public.wipe_expired_api_key_request_secrets() n')).n, 1);
  await db.exec('reset role');
  assert.deepEqual([(await row(forgotten.id)).status, (await row(forgotten.id)).secret_ciphertext, (await row(forgotten.id)).key_id], ['expired', null, KEY], 'wiped, row kept');
  assert.deepEqual([(await row(inTime.id)).status, (await row(inTime.id)).secret_ciphertext], ['approved', 'v1.iv.ct'], 'a secret still in time is kept');
  // Never more than 15 minutes: finish caps the pickup window at 900 seconds.
  const capped = await create();
  await begin(capped.id);
  await one('select public.finish_api_key_request_approval($1, $2, $3, $4, $5)', [capped.id, admin, KEY, 'v1.iv.ct', 86_400]);
  const window = ((await row(capped.id)).secret_expires_at.getTime() - Date.now()) / 60_000;
  assert(window <= 15.01, `pickup window capped at 15 minutes, got ${window}`);

  // Approval and pickup interleaved: a poll while the key is being created sees pending and leaves the claim
  // alone; the approval then finishes and the next poll collects.
  const raced = await create();
  await begin(raced.id);
  assert.equal((await collect(raced.id)).outcome, 'pending');
  assert.equal((await row(raced.id)).status, 'approving');
  assert.equal(await finish(raced.id), true);
  assert.equal((await collect(raced.id)).outcome, 'approved');

  console.log('api-key-requests: all assertions passed');
} finally {
  await db.close();
}
