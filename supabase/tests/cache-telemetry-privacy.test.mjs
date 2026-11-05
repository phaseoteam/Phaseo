import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
// Unfiltered views publish at any volume; a colo filter keeps the 20-request minimum.
const unfiltered = 'p_cloudflare_colo => null';
const filtered = "p_cloudflare_colo => 'LHR'";
try {
  await db.exec(`create role service_role; create role anon; create role authenticated;
    create table public.v2_models(model_slug text, hidden boolean, status text);
    create table public.v2_providers(provider_slug text, name text);
    create table public.v2_model_provider_routes(provider_model_id text, provider_slug text, model_slug text, is_stealth boolean);
    create table public.v2_request_facts(request_event_id text, occurred_at timestamptz,
      routed_model_slug text, requested_model_slug text, provider_model_id text,
      success boolean, stream boolean, cloudflare_colo text, safe_metadata jsonb,
      gateway_ttft_ms numeric, time_to_first_token_ms numeric, provider_ttft_ms numeric, gateway_total_ms numeric,
      generation_ms numeric, phaseo_overhead_ms numeric, throughput numeric, output_speed_tps numeric,
      tpot_ms numeric, itl_ms numeric, tool_call_count integer, tool_call_succeeded boolean,
      structured_output_attempted boolean, structured_output_succeeded boolean);
    create table public.v2_request_usage(request_event_id text, meter_key text, quantity numeric);
    insert into public.v2_models values ('model',false,'active');
    insert into public.v2_providers values ('provider','Provider');
    insert into public.v2_model_provider_routes values ('route','provider','model',false);
    insert into public.v2_request_facts(request_event_id,occurred_at,routed_model_slug,provider_model_id,success,stream,cloudflare_colo,safe_metadata,gateway_ttft_ms)
      select n::text,date_trunc('hour',now()),'model','route',true,false,'LHR','{}'::jsonb,100 from generate_series(1,40) n;
    insert into public.v2_request_usage select request_event_id,'input_tokens',100 from public.v2_request_facts;`);
  await db.exec('create view public.reporting_request_facts as select * from public.v2_request_facts');
  for (const name of [
    'get_v2_model_cached_input_metrics',
    'get_v2_model_provider_hourly_performance_v2',
    'get_v2_model_provider_30m_performance_v1',
    'get_v2_model_performance_metrics_unsuppressed',
    'get_v2_model_performance_metrics',
    'get_v2_model_provider_percentile_series_v2_unsuppressed',
    'get_v2_model_provider_percentile_series_v2',
  ]) {
    await db.exec(await readFile(new URL(`../schemas/public/functions/${name}.sql`, import.meta.url), 'utf8'));
  }
  for (const telemetryCount of [1,19,20]) {
    await db.exec(`delete from public.v2_request_usage where meter_key='cached_input_tokens';
      insert into public.v2_request_usage select n::text,'cached_input_tokens',20 from generate_series(1,${telemetryCount}) n;`);
    for (const [filter, minimum] of [[unfiltered, 1], [filtered, 20]]) {
      const published = telemetryCount >= minimum;
      const cached = (await db.query(`select public.get_v2_model_cached_input_metrics('model', ${filter}) data`)).rows[0].data;
      assert.equal(cached.hourly_24h.length, published ? 1 : 0, `cached hourly at ${telemetryCount} (${filter})`);
      assert.equal(cached.provider_daily_7d.length, published ? 1 : 0, `cached daily at ${telemetryCount} (${filter})`);
      for (const name of ['get_v2_model_provider_hourly_performance_v2', 'get_v2_model_provider_30m_performance_v1']) {
        const rows = (await db.query(`select * from public.${name}('model', ${filter})`)).rows;
        assert.equal(rows.length, 1);
        assert.equal(Number(rows[0].requests), 40);
        for (const field of ['cache_telemetry_requests','cache_hit_requests','effective_input_tokens','cached_input_tokens','cached_input_pct']) {
          if (!published) assert.equal(rows[0][field], null, `${name} leaked ${field} at ${telemetryCount} (${filter})`);
          else assert.notEqual(rows[0][field], null, `${name} suppressed a publishable cohort at ${telemetryCount} (${filter})`);
        }
      }
    }
  }
  for (const requestCount of [20,19,1]) {
    await db.exec(`delete from public.v2_request_facts where request_event_id::int > ${requestCount}`);
    for (const [filter, minimum] of [[unfiltered, 1], [filtered, 20]]) {
      const published = requestCount >= minimum;
      const performance = (await db.query(`select public.get_v2_model_performance_metrics('model', ${filter}) data`)).rows[0].data;
      assert.equal(performance.hourly_24h.length, published ? 1 : 0, `hourly performance at ${requestCount} (${filter})`);
      assert.equal(performance.provider_daily_7d.length, published ? 1 : 0, `daily performance at ${requestCount} (${filter})`);
      assert.equal(Number(performance.last_24h.total_requests ?? 0), published ? requestCount : 0, `summary at ${requestCount} (${filter})`);
      const percentiles = (await db.query(`select * from public.get_v2_model_provider_percentile_series_v2('model', ${filter})`)).rows;
      assert.equal(percentiles.length, published ? 9 : 0, `percentiles at ${requestCount} (${filter})`);
    }
  }
  console.log('Public performance thresholds passed at 1, 19 and 20 requests, unfiltered and filtered by colo');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.close(); }
