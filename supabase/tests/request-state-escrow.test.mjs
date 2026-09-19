import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const workspace = '00000000-0000-4000-8000-000000000001';
const allocation = '00000000-0000-4000-8000-000000000002';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table workspaces(id uuid primary key);
    create table wallets(workspace_id uuid primary key,balance_nanos bigint,reserved_nanos bigint,auto_top_up_enabled boolean,updated_at timestamptz);
    create table keys(id uuid primary key,workspace_id uuid references workspaces(id),status text);
    create table v2_models(id text primary key);
    create table credit_ledger(workspace_id uuid,kind text,amount_nanos bigint,before_balance_nanos bigint,after_balance_nanos bigint,
      before_reserved_nanos bigint,after_reserved_nanos bigint,ref_type text,ref_id text,status text,unique(ref_type,ref_id));
    grant all on all tables in schema public to service_role;
    insert into workspaces values('${workspace}');
    insert into wallets values('${workspace}',1000000000,0,false,now());`);
  await db.exec(await readFile(new URL('../migrations/20260919175153_gateway_request_state_escrow.sql',import.meta.url),'utf8'));
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select gateway_request_state_allocate($1,$2,$3)',[workspace,allocation,1000000000]),/permission denied/);
  await assert.rejects(db.query('select * from gateway_request_state_allocations'),/permission denied/);
  await db.exec('reset role; set role service_role');
  const allocate = (amount=1000000000) => db.query('select gateway_request_state_allocate($1,$2,$3)',[workspace,allocation,amount]);
  await assert.rejects(allocate(1000000001),/invalid_test_cap/);
  await allocate(); await allocate();
  const balance = async () => (await db.query('select balance_nanos,reserved_nanos from wallets')).rows[0];
  assert.deepEqual(await balance(), {balance_nanos:1000000000,reserved_nanos:1000000000});
  const held = {version:1,workspaceId:workspace,allocationId:allocation,sequence:1,balanceNanos:1000000000,reservedNanos:600000000,
    reservation:{id:'request',keyId:'key',kind:'inference',amountNanos:600000000,actualNanos:null,status:'held',requestCount:1,createdAt:1}};
  const project = event => db.query('select gateway_request_state_project($1::jsonb)',[JSON.stringify(event)]);
  await assert.rejects(project({...held,allocationId:undefined}),/allocation_not_found/);
  await assert.rejects(project({...held,sequence:2}),/event_sequence_gap/);
  await project(held); await project(held);
  await assert.rejects(project({...held,reservedNanos:1}),/event_conflict/);
  const spent = {...held,sequence:2,balanceNanos:600000000,reservedNanos:0,reservation:{...held.reservation,status:'captured',actualNanos:400000000}};
  await assert.rejects(project({...spent,balanceNanos:800000000}),/projection_invariant/);
  assert.deepEqual(await balance(), {balance_nanos:1000000000,reserved_nanos:1000000000});
  await project(spent); await project(spent); await allocate();
  assert.deepEqual(await balance(), {balance_nanos:600000000,reserved_nanos:600000000});
  await assert.rejects(allocate(600000000),/allocation_conflict/);
  const over = {...held,sequence:3,reservation:{...held.reservation,id:'too-much',amountNanos:700000000},reservedNanos:700000000,balanceNanos:600000000};
  await assert.rejects(project(over),/projection_invariant/);
  assert.equal((await db.query('select count(*)::int as n from gateway_request_state_events')).rows[0].n,2);
  assert.equal((await db.query("select sum(-amount_nanos)::bigint as n from credit_ledger where ref_type='request_state_event'")).rows[0].n,400000000);
  const lifecycle = {table:'gateway_async_operations',identity:'["batch","job"]',revision:2,
    row:{workspace_id:workspace,kind:'batch',internal_id:'job',status:'completed'}};
  const projectRow = event => db.query('select gateway_request_state_project_row($1::jsonb)',[JSON.stringify(event)]);
  await projectRow(lifecycle); await projectRow(lifecycle);
  await projectRow({...lifecycle,revision:1,row:{...lifecycle.row,status:'pending'}});
  assert.equal((await db.query('select payload from gateway_request_state_rows')).rows[0].payload.status,'completed');
  await assert.rejects(projectRow({...lifecycle,row:{...lifecycle.row,status:'failed'}}),/row_projection_conflict/);
  await assert.rejects(projectRow({...lifecycle,table:'keys'}),/check constraint/);

  // Publication notifications are scoped to allocations and include both owners
  // when a source row moves. The trigger has narrowly delegated write authority.
  const second = '00000000-0000-4000-8000-000000000003';
  const key = '00000000-0000-4000-8000-000000000004';
  await db.query('insert into workspaces values($1)',[second]);
  await db.query('insert into wallets values($1,1,0,false,now())',[second]);
  await db.query('insert into keys values($1,$2,$3)',[key,second,'active']);
  assert.equal((await db.query('select count(*)::int as n from gateway_request_state_changes')).rows[0].n,0);
  await db.query('select gateway_request_state_allocate($1,$2,1)',[second,second]);
  await db.query('update keys set workspace_id=$1 where id=$2',[workspace,key]);
  assert.deepEqual((await db.query('select revision from gateway_request_state_changes order by workspace_id')).rows.map(row=>row.revision),[1,1]);
  await db.exec('reset role; grant select,update on keys to authenticated; set role authenticated');
  await db.query("update keys set status='revoked' where id=$1",[key]);
  await assert.rejects(db.query('select * from gateway_request_state_changes'),/permission denied/);
  await assert.rejects(db.query('select gateway_request_state_ack_changes($1,999)',[workspace]),/permission denied/);
  await assert.rejects(projectRow(lifecycle),/permission denied/);
  await db.exec('reset role; set role service_role');
  assert.equal((await db.query('select revision from gateway_request_state_changes where workspace_id=$1',[workspace])).rows[0].revision,2);
  await db.query('delete from keys where id=$1',[key]);
  await db.query('insert into v2_models values($1)',['model']);
  await db.query('select gateway_request_state_ack_changes($1,999)',[workspace]);
  await db.query('select gateway_request_state_ack_changes($1,1)',[workspace]);
  assert.deepEqual((await db.query('select revision,acknowledged_revision from gateway_request_state_changes where workspace_id=$1',[workspace])).rows[0],{revision:4,acknowledged_revision:4});
  assert.equal((await db.query('select revision from gateway_request_state_changes where workspace_id=$1',[second])).rows[0].revision,2);
  console.log('Escrow SQL: cap, permissions, accounting replay/rollback, lifecycle revisions and scoped publication triggers passed.');
} finally {await db.close();}
