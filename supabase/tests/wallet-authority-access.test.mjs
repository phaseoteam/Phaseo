import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create table public.wallets(workspace_id uuid primary key,balance_nanos bigint default 0,
      reserved_nanos bigint default 0,stripe_customer_id text,auto_top_up_account_id text,
      auto_top_up_enabled boolean default false,low_balance_threshold bigint default 0,
      auto_top_up_amount bigint default 0,updated_at timestamptz);
    create table public.credit_ledger(id int,amount_nanos bigint);
    grant all on public.wallets,public.credit_ledger to anon,authenticated,service_role;
    insert into public.wallets(workspace_id,balance_nanos) values('00000000-0000-0000-0000-000000000001',10);
  `);
  const sql=await readFile(new URL('../migrations/20260907234615_protect_wallet_financial_state.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  await db.exec('set role authenticated');
  // Even with row access, owner-level database clients cannot edit money or payment identity.
  for(const assignment of ["balance_nanos=1000000","reserved_nanos=0","stripe_customer_id='other'","auto_top_up_account_id='other'"]) await assert.rejects(db.exec(`update public.wallets set ${assignment}`),/permission denied/);
  await assert.rejects(db.exec(`insert into public.wallets(workspace_id,balance_nanos) values('00000000-0000-0000-0000-000000000002',1000)`),/permission denied/);
  await assert.rejects(db.exec('insert into public.credit_ledger values(1,1000)'),/permission denied/);
  await db.exec(`update public.wallets set auto_top_up_enabled=true,auto_top_up_amount=100`);
  await db.exec(`insert into public.wallets(workspace_id) values('00000000-0000-0000-0000-000000000002')`);
  assert.equal(Number((await db.query("select balance_nanos from public.wallets where workspace_id='00000000-0000-0000-0000-000000000002'")).rows[0].balance_nanos),0);
  await db.exec('reset role;set role service_role');
  await db.exec('update public.wallets set balance_nanos=20;insert into public.credit_ledger values(1,10)');
  assert.equal((await db.query('select * from public.credit_ledger')).rows.length,1);
  console.log('Wallet authority: direct balance/payment/ledger writes denied, owner settings and trusted settlement preserved.');
} finally {await db.close();}
