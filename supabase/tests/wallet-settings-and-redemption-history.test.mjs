// Contract test for wallet_settings_and_redemption_history:
// 1. Auto top-up settings change only through update_workspace_auto_top_up (MFA or recorded consent,
//    with an audit event). A signed-in owner can read the wallet but not update it directly.
// 2. A credit code redemption stays recorded for the user after its workspace is deleted, so the same
//    user cannot redeem the code again from another workspace.
// Install @electric-sql/pglite in a temporary directory and set PGLITE_MODULE to its dist/index.js
// file URL. Run: node supabase/tests/wallet-settings-and-redemption-history.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = async path => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const tableFile = name => read(`../schemas/public/tables/${name}.sql`);
const functionFile = name => read(`../schemas/public/functions/${name}.sql`);
const createTable = async name => { const sql = await tableFile(name); return sql.slice(0, sql.indexOf('\n);') + 3); };

const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find(name => name.endsWith('_wallet_settings_and_redemption_history.sql'));
assert(migrationName, 'the migration exists');
const migration = await read(`../migrations/${migrationName}`);

const walletsSchema = await tableFile('wallets');
const redemptionsSchema = await tableFile('credit_grant_redemptions');
assert.doesNotMatch(walletsSchema, /UPDATE \("[a-z_]+"\) ON TABLE "public"\."wallets" TO "authenticated"/);
assert.doesNotMatch(walletsSchema, /FOR UPDATE\s+TO "authenticated"\s+USING \(public\.is_team_owner/);
assert.match(redemptionsSchema, /"workspace_id" uuid,/);
assert.match(redemptionsSchema, /"credit_grant_redemptions_workspace_id_fkey" FOREIGN KEY \(workspace_id\) REFERENCES public\.workspaces\(id\) ON DELETE SET NULL/);
assert.match(redemptionsSchema, /"credit_grant_redemptions_user_id_fkey" FOREIGN KEY \(user_id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/);

// Roles, auth helpers and the tables the schema files refer to; then the two tables from their schema files.
async function load(db) {
	await db.exec(`
		create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
		create schema auth; create schema private;
		create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
		create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
		create table auth.users (id uuid primary key);
		create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
		grant usage on schema auth, public to anon, authenticated, service_role;
		grant execute on all functions in schema auth to anon, authenticated, service_role;
		create table private.usage_workspace_identity (workspace_id uuid primary key);
		create table public.workspaces (id uuid primary key, owner_user_id uuid not null, billing_mode text not null default 'wallet');
		create table public.workspace_members (workspace_id uuid references public.workspaces(id) on delete cascade, user_id uuid, role text, primary key (workspace_id, user_id));
		create function public.is_admin_user() returns boolean language sql stable as $$ select false $$;
	`);
	for (const name of ['request_is_oauth_client', 'mfa_satisfied', 'is_workspace_member', 'is_team_owner']) await db.exec(await functionFile(name));
	await db.exec(walletsSchema);
	await db.exec(await createTable('credit_grants'));
	await db.exec(redemptionsSchema);
	await db.exec(await createTable('credit_ledger'));
	await db.exec(`
		create unique index credit_ledger_ref_type_ref_id_key on public.credit_ledger (ref_type, ref_id);
		create unique index credit_grants_code_normalized_key on public.credit_grants (code_normalized);
	`);
	await db.exec(await functionFile('reject_workspace_audit_event_mutation'));
	await db.exec(await tableFile('workspace_audit_events'));
	for (const name of ['update_workspace_auto_top_up', 'redeem_credit_code']) await db.exec(await functionFile(name));
	await db.exec('grant execute on function public.redeem_credit_code(text, uuid) to authenticated;');
}

// What the migration changes, read from the catalog.
async function snapshot(db) {
	const rows = async sql => (await db.query(sql)).rows;
	return {
		walletColumnGrants: await rows(`select column_name, privilege_type from information_schema.column_privileges
			where table_schema = 'public' and table_name = 'wallets' and grantee = 'authenticated' order by 1, 2`),
		walletPolicies: await rows(`select policyname, cmd, permissive, roles::text, qual, with_check from pg_policies
			where schemaname = 'public' and tablename = 'wallets' order by 1`),
		redemptionWorkspace: await rows(`select a.attnotnull, c.confdeltype::text, pg_get_constraintdef(c.oid) as definition
			from pg_attribute a join pg_constraint c on c.conrelid = a.attrelid and c.conname = 'credit_grant_redemptions_workspace_id_fkey'
			where a.attrelid = 'public.credit_grant_redemptions'::regclass and a.attname = 'workspace_id'`),
	};
}

const desired = new PGlite();
const db = new PGlite();
try {
	await load(desired);
	await load(db);
	// The two tables as they were before this migration.
	await db.exec(`
		grant update (auto_top_up_enabled, auto_top_up_amount, low_balance_threshold, updated_at) on table public.wallets to authenticated;
		create policy "wallets: update settings if owner" on public.wallets for update to authenticated
			using (public.is_team_owner(workspace_id)) with check (public.is_team_owner(workspace_id));
		alter table public.credit_grant_redemptions alter column workspace_id set not null;
		alter table public.credit_grant_redemptions drop constraint credit_grant_redemptions_workspace_id_fkey,
			add constraint credit_grant_redemptions_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade;
	`);
	assert.notDeepEqual(await snapshot(db), await snapshot(desired), 'the starting state differs from the schema files');

	// The migration can run twice and ends in the state the schema files describe.
	await db.exec(`begin; ${migration} commit;`);
	await db.exec(`begin; ${migration} commit;`);
	assert.deepEqual(await snapshot(db), await snapshot(desired), 'the migration ends in the state the schema files describe');

	const owner = '10000000-0000-4000-8000-000000000001';
	const other = '10000000-0000-4000-8000-000000000002';
	const workspace = n => `20000000-0000-4000-8000-00000000000${n}`;
	const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
	const asUser = async (user, fn) => {
		await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, role: 'authenticated', aal: 'aal1' })]);
		await db.exec('set role authenticated;');
		try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); }
	};
	const asService = async fn => { await db.exec('set role service_role;'); try { return await fn(); } finally { await db.exec('reset role;'); } };
	const newWorkspace = async (n, user) => db.exec(`
		insert into auth.users values ('${user}') on conflict do nothing;
		insert into public.workspaces (id, owner_user_id) values ('${workspace(n)}', '${user}');
		insert into private.usage_workspace_identity values ('${workspace(n)}');
		insert into public.workspace_members values ('${workspace(n)}', '${user}', 'owner');
		insert into public.wallets (workspace_id, stripe_customer_id) values ('${workspace(n)}', 'cus_${n}');`);
	const autoTopUp = (n, { mfa = false, phrase = null }, requestId) => asService(() => one(
		`select auto_top_up_enabled, low_balance_threshold, auto_top_up_amount
		 from public.update_workspace_auto_top_up($1, true, 10000000000, 20000000000, 'pm_1', $2, $3, $4, $5, $6)`,
		[workspace(n), mfa, phrase !== null, phrase, owner, requestId]));
	const auditActions = async n => (await db.query('select action from public.workspace_audit_events where workspace_id = $1', [workspace(n)])).rows.map(row => row.action);

	// 1. Auto top-up settings.
	await newWorkspace(1, owner);
	await asUser(owner, async () => {
		const wallet = await one('select auto_top_up_enabled, balance_nanos from public.wallets where workspace_id = $1', [workspace(1)]);
		assert.equal(wallet.auto_top_up_enabled, false, 'the owner still reads the wallet');
		for (const assignment of ['auto_top_up_enabled = true', 'auto_top_up_amount = 20000000000', 'low_balance_threshold = 10000000000', 'updated_at = now()']) {
			await assert.rejects(db.query(`update public.wallets set ${assignment} where workspace_id = $1`, [workspace(1)]), /permission denied/, assignment);
		}
		await assert.rejects(db.query(`select * from public.update_workspace_auto_top_up($1, true, 10000000000, 20000000000, null, true, false, null)`, [workspace(1)]), /permission denied/);
	});
	assert.equal((await one('select auto_top_up_enabled from public.wallets where workspace_id = $1', [workspace(1)])).auto_top_up_enabled, false);

	await assert.rejects(autoTopUp(1, {}, 'req-1'), /mfa_required/);
	const consented = await autoTopUp(1, { phrase: 'I ACCEPT THE RISK' }, 'req-2');
	assert.equal(consented.auto_top_up_enabled, true);
	assert.equal(Number(consented.low_balance_threshold), 10000000000);
	assert.equal(Number(consented.auto_top_up_amount), 20000000000);
	assert.deepEqual(await auditActions(1), ['auto_top_up.enabled_without_mfa'], 'consent is recorded');

	await newWorkspace(2, owner);
	assert.equal((await autoTopUp(2, { mfa: true }, 'req-3')).auto_top_up_enabled, true, 'an MFA session enables auto top-up');
	assert.deepEqual(await auditActions(2), []);

	await asService(() => db.query('update public.wallets set auto_top_up_enabled = false, updated_at = now() where workspace_id = $1', [workspace(2)]));
	assert.equal((await one('select auto_top_up_enabled from public.wallets where workspace_id = $1', [workspace(2)])).auto_top_up_enabled, false, 'trusted server writes still work');

	// 2. Credit code redemptions.
	await db.exec(`insert into public.credit_grants (code, code_normalized, amount_nanos, max_redemptions) values ('LAUNCH10', 'LAUNCH10', 10000000000, 100);`);
	const redeem = (user, n) => asUser(user, () => one('select status, amount_nanos from public.redeem_credit_code($1, $2)', ['launch10', workspace(n)]));
	const balance = async n => Number((await one('select balance_nanos from public.wallets where workspace_id = $1', [workspace(n)])).balance_nanos);
	const redemptions = async () => (await db.query('select user_id, workspace_id from public.credit_grant_redemptions order by created_at, user_id')).rows;

	assert.equal((await redeem(owner, 1)).status, 'succeeded');
	assert.equal(await balance(1), 10000000000);
	assert.equal((await redeem(owner, 1)).status, 'already_redeemed');

	await db.query('delete from public.workspaces where id = $1', [workspace(1)]);
	assert.deepEqual(await redemptions(), [{ user_id: owner, workspace_id: null }], 'the redemption outlives its workspace');

	assert.equal((await redeem(owner, 2)).status, 'already_redeemed', 'the same user cannot redeem again from another workspace');
	assert.equal(await balance(2), 0);

	// Another member can still redeem the code into the second workspace, and that workspace can go too.
	await db.exec(`insert into auth.users values ('${other}'); insert into public.workspace_members values ('${workspace(2)}', '${other}', 'member');`);
	assert.equal((await redeem(other, 2)).status, 'succeeded');
	assert.equal(await balance(2), 10000000000);
	await db.query('delete from public.workspaces where id = $1', [workspace(2)]);
	assert.deepEqual((await redemptions()).map(row => row.workspace_id), [null, null], 'several redemptions can have no workspace');
	assert.equal(Number((await one('select redemptions_count from public.credit_grants')).redemptions_count), 2);

	// Deleting the user still removes that user's redemptions.
	await db.query('delete from auth.users where id = $1', [other]);
	assert.deepEqual(await redemptions(), [{ user_id: owner, workspace_id: null }]);

	console.log('Wallet settings and redemption history: auto top-up changes go through the consent function; a redemption stays with its user after the workspace is deleted.');
} finally {
	await db.close();
	await desired.close();
}
