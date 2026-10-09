// PGlite 0.5.8; PGLITE_MODULE may point to an external installation's dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
try {
  await db.exec(`set timezone = 'UTC';
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.v2_models(model_id text primary key,name text,release_date timestamptz,deprecation_date timestamptz,previous_model_id text);
    insert into v2_models values
      ('model-a','A',date_trunc('day',now())-interval '3 days'+interval '12 hours',null,null),
      ('model-b','B',date_trunc('day',now())-interval '1 day',null,'model-a');
    create view private.v2_rpc_models_compat as select * from v2_models;
    create table public.v2_model_provider_routes(model_slug text,provider_slug text,api_model_id text);
    insert into v2_model_provider_routes values ('model-a','provider-a','native-a');
    create view private.v2_rpc_routes_compat as select provider_slug provider_id,api_model_id,model_slug internal_model_id from v2_model_provider_routes;
    create table public.v2_public_usage_daily(rollup_id uuid primary key,usage_date date,model_slug text);
    create table public.v2_public_usage_daily_meters(rollup_id uuid references v2_public_usage_daily,meter_key text,quantity numeric);
    create table public.v2_request_facts(request_event_id uuid primary key,occurred_at timestamptz,
      routed_model_slug text,requested_model_slug text,requested_model_input text);
    create table public.v2_request_usage(request_event_id uuid,meter_key text,quantity numeric);
    -- The release day is read from facts so usage before the release time is excluded.
    insert into v2_request_facts values
      ('10000000-0000-4000-8000-000000000001',date_trunc('day',now())-interval '3 days'+interval '13 hours','model-a',null,null),
      ('10000000-0000-4000-8000-000000000002',date_trunc('day',now())-interval '3 days'+interval '11 hours','model-a',null,null);
    insert into v2_request_usage values
      ('10000000-0000-4000-8000-000000000001','input_tokens',100),('10000000-0000-4000-8000-000000000001','output_tokens',20),
      ('10000000-0000-4000-8000-000000000002','input_tokens',9000);
  `);
  const grain = async (id, daysAgo, model, meters) => {
    await db.query('insert into v2_public_usage_daily values ($1,current_date-$2::int,$3)', [id, daysAgo, model]);
    for (const [key, quantity] of Object.entries(meters)) {
      await db.query('insert into v2_public_usage_daily_meters values ($1,$2,$3)', [id, key, quantity]);
    }
  };
  // A release-day grain (superseded by facts), a provider-prefixed legacy slug,
  // two grains on one day, an explicit total that wins over its own
  // input/output, unrelated meters and usage from before the release day.
  await grain('00000000-0000-4000-8000-000000000001', 3, 'model-a', { input_tokens: 9120, unrelated: 999 });
  await grain('00000000-0000-4000-8000-000000000002', 2, 'provider-a/native-a', { input_tokens: 41 });
  await grain('00000000-0000-4000-8000-000000000003', 1, 'model-a', { input_tokens: 5, output_tokens: 5 });
  await grain('00000000-0000-4000-8000-000000000004', 1, 'model-a', { total_tokens: 50, input_tokens: 100 });
  await grain('00000000-0000-4000-8000-000000000005', 5, 'model-a', { input_tokens: 7000 });
  await grain('00000000-0000-4000-8000-000000000006', 1, 'model-b', { input_tokens: 1 });
  await db.exec(await read('../schemas/public/functions/get_model_token_trajectory.sql'));

  const [row] = (await db.query("select * from get_model_token_trajectory('model-a')")).rows;
  assert.deepEqual(row.points.map(point => [point.daysSinceRelease, point.tokens, point.cumulativeTokens]),
    [[-1, 120, 120], [0, 41, 161], [1, 60, 221], [2, 0, 221]],
    'release-day facts from the release time, then daily rollup totals per UTC day');
  assert.deepEqual(row.successor_milestones.map(successor => successor.modelId), ['model-b']);
  assert.equal((await db.query("select * from get_model_token_trajectory('missing')")).rows.length, 0);
  console.log('Token trajectory reads daily usage rollups.');
} finally {
  await db.close();
}
