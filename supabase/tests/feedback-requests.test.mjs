import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const schemaFiles = [
    '../schemas/public/tables/feedback_requests.sql',
    '../schemas/public/functions/enqueue_feedback_request_emails.sql',
    '../schemas/public/functions/get_feedback_request.sql',
    '../schemas/public/functions/submit_feedback_response.sql',
    '../schemas/public/functions/opt_out_of_product_emails.sql',
];
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const enqueue = async limit => (await one("select public.enqueue_feedback_request_emails('v1', 90, $1) queued", [limit])).queued;
const tokenFor = async email => (await one(
    `select r.access_token from public.feedback_requests r join auth.users a on a.id = r.user_id where a.email = $1`, [email],
)).access_token;
const submit = async (token, answers, cap = 1) => (await one(
    'select public.submit_feedback_response($1, $2, 1000000000, $3, 90) result', [token, answers, cap],
)).result;

try {
    // The migration must carry every schema file it was built from.
    const migration = await read('../migrations/20261013150000_feedback_requests.sql');
    for (const file of schemaFiles) assert.ok(migration.includes((await read(file)).trim()), `${file} is in the migration`);

    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text, created_at timestamptz not null, last_sign_in_at timestamptz,
        raw_user_meta_data jsonb not null default '{}', deleted_at timestamptz, is_anonymous boolean not null default false
      );
      grant usage on schema auth to service_role; grant select on auth.users to service_role;
      create table public.users (
        user_id uuid primary key references auth.users(id) on delete cascade, display_name text,
        role text not null default 'user', product_emails_opted_out_at timestamptz
      );
      grant select on public.users to service_role;
      create table public.workspaces (id uuid primary key);
      create table public.workspace_members (workspace_id uuid, user_id uuid);
      create table public.credit_ledger (workspace_id uuid, ref_type text);
      create table public.v2_private_usage_daily (workspace_id uuid);
      create table public.gateway_requests (workspace_id uuid);
      create function public.is_admin_user() returns boolean language sql as 'select false';
    `);
    await db.exec(await read('../schemas/public/tables/email_outbox.sql'));
    await db.exec(await read('../schemas/public/tables/credit_grants.sql'));
    for (const file of schemaFiles) await db.exec(await read(file));

    // Signup ages in days; only accounts 90+ days old, not deleted, anonymous, admin
    // or opted out, are eligible. Oldest first.
    await db.exec(`
      insert into auth.users (id, email, created_at, last_sign_in_at, raw_user_meta_data, deleted_at, is_anonymous) values
        ('00000000-0000-0000-0000-00000000000a', 'paid@example.com',   now() - interval '400 days', now() - interval '5 days',   '{"full_name":"Ada Lovelace"}', null, false),
        ('00000000-0000-0000-0000-00000000000b', 'used@example.com',   now() - interval '300 days', now() - interval '60 days',  '{}', null, false),
        ('00000000-0000-0000-0000-00000000000c', 'never@example.com',  now() - interval '200 days', now() - interval '250 days', '{}', null, false),
        ('00000000-0000-0000-0000-00000000000d', 'new@example.com',    now() - interval '10 days',  now(),                       '{}', null, false),
        ('00000000-0000-0000-0000-00000000000e', 'optout@example.com', now() - interval '500 days', null,                        '{}', null, false),
        ('00000000-0000-0000-0000-00000000000f', 'admin@example.com',  now() - interval '500 days', null,                        '{}', null, false),
        ('00000000-0000-0000-0000-000000000010', 'gone@example.com',   now() - interval '500 days', null,                        '{}', now(), false),
        ('00000000-0000-0000-0000-000000000011', 'raw@example.com',    now() - interval '100 days', null,                        '{}', null, false);
      insert into public.users (user_id, display_name, role, product_emails_opted_out_at)
        select id, case when email = 'used@example.com' then 'Grace Hopper' end,
               case when email = 'admin@example.com' then 'admin' else 'user' end,
               case when email = 'optout@example.com' then now() end
        from auth.users;
      insert into public.workspaces values ('10000000-0000-0000-0000-00000000000a'), ('10000000-0000-0000-0000-00000000000b'), ('10000000-0000-0000-0000-000000000011');
      insert into public.workspace_members values
        ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'),
        ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b'),
        ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011');
      insert into public.credit_ledger values ('10000000-0000-0000-0000-00000000000a', 'Stripe_Payment_Intent'), ('10000000-0000-0000-0000-00000000000b', 'promo_code_redeem');
      insert into public.v2_private_usage_daily values ('10000000-0000-0000-0000-00000000000b');
      insert into public.gateway_requests values ('10000000-0000-0000-0000-000000000011');
    `);

    await db.exec('set role service_role');
    assert.equal(await enqueue(0), 0);
    assert.equal(await enqueue(2), 2);
    assert.equal(await enqueue(10), 2);
    assert.equal(await enqueue(10), 0, 'nobody is asked twice in a campaign');

    const queued = (await db.query(`select to_email, kind, template, dedupe_key, payload from public.email_outbox order by to_email`)).rows;
    assert.deepEqual(queued.map(row => [row.to_email, row.payload.segment, row.payload.recency, row.payload.first_name]), [
        ['never@example.com', 'never_requested', 'dormant', null],
        ['paid@example.com', 'paid', 'active', 'Ada'],
        ['raw@example.com', 'used_not_paid', 'dormant', null],
        ['used@example.com', 'used_not_paid', 'lapsed', 'Grace'],
    ]);
    assert.ok(queued.every(row => row.kind === 'feedback_request' && row.template === 'feedback_request'));
    assert.ok(queued.every(row => row.dedupe_key.startsWith('feedback_request:v1:')));

    // The feedback page sees the segment but never the address.
    const paidToken = await tokenFor('paid@example.com');
    const page = (await one('select public.get_feedback_request($1) page', [paidToken])).page;
    assert.deepEqual(page, { campaign: 'v1', segment: 'paid', recency: 'active', responded: false, rewardCode: null, optedOut: false });
    assert.equal((await one("select public.get_feedback_request('99999999-9999-9999-9999-999999999999') page")).page, null);

    // First answer is kept and earns one single-use code; repeats return the same code.
    assert.deepEqual(await submit(paidToken, '[1]'), { status: 'invalid_answers' });
    const first = await submit(paidToken, { reason: 'Pricing is unclear' });
    assert.equal(first.status, 'submitted');
    assert.equal(first.rewardStatus, 'issued');
    assert.match(first.rewardCode, /^THANKS-[A-Z0-9]{12}$/);
    const grant = await one('select amount_nanos::text amount_nanos, max_redemptions, code_normalized, expires_at > now() + interval \'89 days\' valid from public.credit_grants');
    assert.deepEqual(grant, { amount_nanos: '1000000000', max_redemptions: 1, code_normalized: first.rewardCode, valid: true });
    assert.deepEqual(await submit(paidToken, { reason: 'changed my mind' }), { status: 'already_submitted', rewardCode: first.rewardCode });
    assert.deepEqual((await one('select answers from public.feedback_requests where access_token = $1', [paidToken])).answers, { reason: 'Pricing is unclear' });

    // The cap counts codes already issued in the campaign.
    assert.deepEqual(await submit(await tokenFor('used@example.com'), { reason: 'x' }, 1), { status: 'submitted', rewardStatus: 'budget_exhausted' });
    assert.deepEqual(await submit('99999999-9999-9999-9999-999999999999', { reason: 'x' }), { status: 'not_found' });

    // Unsubscribing opts the user out of all non-essential email and cancels unsent feedback email.
    const neverToken = await tokenFor('never@example.com');
    assert.equal((await one('select public.opt_out_of_product_emails($1) ok', [neverToken])).ok, true);
    assert.equal((await one('select public.opt_out_of_product_emails($1) ok', [neverToken])).ok, true);
    assert.equal((await one("select public.opt_out_of_product_emails('99999999-9999-9999-9999-999999999999') ok")).ok, false);
    assert.deepEqual(await one(`select attempts, last_error from public.email_outbox where to_email = 'never@example.com'`), { attempts: 5, last_error: 'unsubscribed' });
    assert.equal((await one('select public.get_feedback_request($1) page', [neverToken])).page.optedOut, true);
    assert.ok((await one(`select product_emails_opted_out_at from public.users where user_id = '00000000-0000-0000-0000-00000000000c'`)).product_emails_opted_out_at);
    await db.exec('reset role');

    // Deleting the account removes its feedback.
    await db.exec(`delete from auth.users where id = '00000000-0000-0000-0000-00000000000a'`);
    assert.equal((await one('select count(*)::int n from public.feedback_requests')).n, 3);

    // Backend-only: browsers can neither read requests nor call the functions.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query('select * from public.feedback_requests'), /permission denied/);
        await assert.rejects(enqueue(1), /permission denied/);
        await assert.rejects(db.query('select public.get_feedback_request($1)', [neverToken]), /permission denied/);
        await assert.rejects(submit(neverToken, { a: 1 }), /permission denied/);
        await assert.rejects(db.query('select public.opt_out_of_product_emails($1)', [neverToken]), /permission denied/);
        await db.exec('reset role');
    }
    console.log('feedback requests: ok');
} finally {
    await db.close();
}
