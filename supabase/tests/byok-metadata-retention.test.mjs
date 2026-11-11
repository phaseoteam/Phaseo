import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = path => readFile(new URL(path, import.meta.url), 'utf8').then(text => text.replace(/\r\n/g, '\n'));
const indexMigration = await read('../migrations/20261110102600_byok_metadata_retention_index.sql');
const jobMigration = await read('../migrations/20261110102700_byok_metadata_retention_job.sql');
const schemaFunction = await read('../schemas/private/functions/redact_expired_byok_request_metadata.sql');
const schemaTable = await read('../schemas/private/tables/byok_metadata_retention_runs.sql');
const schemaFacts = await read('../schemas/public/tables/v2_request_facts.sql');
const schemaCron = await read('../schemas/_cluster/misc.sql');
const pgdelta = JSON.parse(await read('../schemas/.pgdelta-export.json'));

// The migration and the declarative files must describe the same objects.
const body = text => text.match(/\$function\$\n([\s\S]*?)\$function\$/)?.[1];
assert.ok(body(jobMigration), 'migration has a function body');
assert.equal(body(jobMigration), body(schemaFunction), 'declarative function body matches the migration');
assert.match(schemaFacts, /CREATE INDEX v2_request_facts_byok_retention_idx ON public\.v2_request_facts USING btree \(occurred_at, request_event_id\)\n  WHERE \(byok AND \(NOT \(safe_metadata \? 'retention_redacted_at'::text\)\)\);/);
assert.ok(indexMigration.includes("USING btree (occurred_at, request_event_id) WHERE (byok AND (NOT (safe_metadata ? 'retention_redacted_at'::text)))"));
assert.ok(schemaTable.includes('"private"."byok_metadata_retention_runs"'));
assert.ok(schemaCron.includes("cron.schedule_in_database('redact-expired-byok-request-metadata', '37 * * * *',\n  'set statement_timeout = ''60s''; set lock_timeout = ''500ms''; select private.redact_expired_byok_request_metadata(false, 500, 365);'"));
for (const file of ['private/tables/byok_metadata_retention_runs.sql', 'private/functions/redact_expired_byok_request_metadata.sql']) {
  assert.ok(pgdelta.loadOrder.includes(file) && pgdelta.files.includes(file), `${file} is exported`);
}
assert.doesNotMatch(jobMigration, /\bdelete\s+from\b/i, 'the job migration deletes nothing');
assert.doesNotMatch(body(jobMigration), /\bdelete\b/i, 'the job never deletes rows');

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema cron;
    create table cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text);
    create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as
      'insert into cron.job(jobname, schedule, command) values (p_name, p_schedule, p_command) returning jobid';

    create table public.gateway_requests (
      id uuid not null, created_at timestamptz not null, workspace_id uuid not null, request_id text not null,
      byok boolean not null, cost_nanos bigint, usage jsonb not null default '{}', usage_total_tokens bigint not null default 0,
      native_response_id text, error_message text, error_payload jsonb, location text, oauth_user_id uuid,
      end_user_id text, session_id text, trace_data jsonb, provider_attempts jsonb not null default '[]',
      detail_metadata jsonb, realtime_session_id text, attributed_user_id uuid, attributed_access_role text,
      attributed_department_id uuid,
      primary key (id, created_at)
    );
    create table public.gateway_upstream_requests (
      id uuid primary key default gen_random_uuid(), gateway_request_id uuid not null, gateway_request_created_at timestamptz not null,
      key_source text, cost_nanos bigint not null default 0, usage jsonb not null default '{}',
      upstream_url text, native_response_id text, error_message text, error_description text, error_param text,
      request_payload jsonb, response_payload jsonb, metadata jsonb not null default '{}',
      foreign key (gateway_request_id, gateway_request_created_at) references public.gateway_requests(id, created_at) on delete cascade
    );
    create table public.v2_request_facts (
      request_event_id uuid primary key default gen_random_uuid(), workspace_id uuid not null, request_id text not null,
      occurred_at timestamptz not null, byok boolean not null default false, cost_nanos bigint, service_tier_slug text,
      cloudflare_colo text, latency_ms integer, user_agent text, sdk_name text, sdk_version text, client_version text,
      session_id text, end_user_id text, native_response_id text, edge_country text, edge_continent text,
      safe_metadata jsonb not null default '{}', gateway_request_id uuid not null, gateway_request_created_at timestamptz not null,
      foreign key (gateway_request_id, gateway_request_created_at) references public.gateway_requests(id, created_at) on delete cascade
    );
    create table public.v2_request_attempts (
      attempt_id uuid primary key default gen_random_uuid(),
      request_event_id uuid not null references public.v2_request_facts on delete cascade,
      provider_model_id text, success boolean not null default true, latency_ms integer, safe_metadata jsonb not null default '{}',
      upstream_response_id text, upstream_error_message text, upstream_error_description text, upstream_error_code text
    );
    create table public.v2_request_routing_traces (
      request_event_id uuid primary key references public.v2_request_facts on delete cascade,
      requested_routing jsonb not null default '{}', sticky_routing jsonb not null default '{}', pool_bounds jsonb not null default '{}'
    );
    create table public.v2_request_pricing_lines (
      pricing_line_id uuid primary key default gen_random_uuid(),
      request_event_id uuid not null references public.v2_request_facts on delete cascade, charged_nanos bigint not null
    );
    create table public.gateway_routing_archive_deletions (object_prefix text primary key, created_at timestamptz not null default now());

    -- Stand-ins for the rollup triggers: a delete would decrement the rollup, and every
    -- write records whether the rebuild-suppression flag was on.
    create table public.usage_rollup (id int primary key, total_nanos bigint not null);
    insert into public.usage_rollup values (1, 0);
    create function public.decrement_rollup() returns trigger language plpgsql as $$
    begin update public.usage_rollup set total_nanos = total_nanos - old.charged_nanos where id = 1; return old; end $$;
    create trigger pricing_lines_rollup after delete on public.v2_request_pricing_lines for each row execute function public.decrement_rollup();
    create table public.trigger_audit (tbl text, op text, pruning text);
    create function public.audit_write() returns trigger language plpgsql as $$
    begin
      insert into public.trigger_audit values (tg_table_name, tg_op, coalesce(current_setting('phaseo.pruning_byok_metadata', true), ''));
      return null;
    end $$;
    create trigger facts_audit after update or delete on public.v2_request_facts for each row execute function public.audit_write();
    create trigger attempts_audit after update or delete on public.v2_request_attempts for each row execute function public.audit_write();
  `);

  await db.exec(indexMigration.replace('CONCURRENTLY ', ''));
  await db.exec(jobMigration);

  const jobs = (await db.query(`select jobname, schedule, command from cron.job`)).rows;
  assert.deepEqual(jobs, [{
    jobname: 'redact-expired-byok-request-metadata', schedule: '37 * * * *',
    command: "set statement_timeout = '60s'; set lock_timeout = '500ms'; select private.redact_expired_byok_request_metadata(false, 500, 365);",
  }], 'the schedule is report-only');

  const ws = '00000000-0000-0000-0000-0000000000aa';
  async function seed(label, daysOld, byok) {
    const id = (await db.query(`select gen_random_uuid() id`)).rows[0].id;
    const created = (await db.query(`select now() - make_interval(days => $1) ts`, [daysOld])).rows[0].ts;
    await db.query(`insert into public.gateway_requests(id, created_at, workspace_id, request_id, byok, cost_nanos, usage, usage_total_tokens,
        native_response_id, error_message, error_payload, location, oauth_user_id, end_user_id, session_id, trace_data,
        provider_attempts, detail_metadata, realtime_session_id, attributed_user_id, attributed_access_role, attributed_department_id)
      values ($1, $2, $3, $4, $5, 1500, '{"input_tokens":10}', 30, 'resp_1', 'bad prompt text', '{"m":"x"}', 'GB',
        gen_random_uuid(), 'user-7', 'sess-1', '{"t":1}', '[{"provider":"p"}]',
        '{"routing_snapshot":{"a":1},"client_source":{"id":"api"}}', null, gen_random_uuid(), 'member', '00000000-0000-0000-0000-0000000000dd')`,
      [id, created, ws, label, byok]);
    await db.query(`insert into public.gateway_upstream_requests(gateway_request_id, gateway_request_created_at, key_source, cost_nanos,
        upstream_url, native_response_id, error_message, error_description, error_param, request_payload, response_payload, metadata)
      values ($1, $2, $3, 1500, 'https://provider/v1', 'resp_1', 'e', 'd', 'p', '{"messages":[1]}', '{"choices":[1]}', '{"k":1}')`,
      [id, created, byok ? 'byok' : 'gateway']);
    const fact = (await db.query(`insert into public.v2_request_facts(workspace_id, request_id, occurred_at, byok, cost_nanos,
        service_tier_slug, cloudflare_colo, latency_ms, user_agent, sdk_name, sdk_version, client_version, session_id,
        end_user_id, native_response_id, edge_country, edge_continent, safe_metadata, gateway_request_id, gateway_request_created_at)
      values ($1, $2, $3, $4, 1500, 'priority', 'LHR', 900, 'curl/8', 'phaseo-ts', '1.0', '2.0', 'sess-1', 'user-7', 'resp_1', 'GB', 'EU',
        '{"labels":{"team":"x"},"client_source":{"id":"api"},"service_tier":"priority","performance":{"tpot_ms":3},"testing_mode":false,"lifecycle_events":[1]}',
        $5, $3) returning request_event_id`, [ws, label, created, byok, id])).rows[0].request_event_id;
    await db.query(`insert into public.v2_request_attempts(request_event_id, provider_model_id, latency_ms, safe_metadata,
        upstream_response_id, upstream_error_message, upstream_error_description, upstream_error_code)
      values ($1, 'p/m', 900, $2, 'resp_1', 'quota for prompt', 'desc', 'rate_limit')`, [fact, JSON.stringify({ key_source: byok ? 'byok' : 'gateway' })]);
    await db.query(`insert into public.v2_request_routing_traces(request_event_id, requested_routing, sticky_routing, pool_bounds)
      values ($1, '{"order":["a"]}', '{"session":"s"}', '{"n":1}')`, [fact]);
    await db.query(`insert into public.v2_request_pricing_lines(request_event_id, charged_nanos) values ($1, 1500)`, [fact]);
    await db.query(`update public.usage_rollup set total_nanos = total_nanos + 1500 where id = 1`);
    return { id, fact };
  }
  const old = await seed('old-byok', 400, true);
  const recent = await seed('recent-byok', 100, true);
  const oldGateway = await seed('old-gateway', 400, false);
  await db.query(`delete from public.trigger_audit`);
  const counts = async () => (await db.query(`select
      (select count(*)::int from public.gateway_requests) gr, (select count(*)::int from public.gateway_upstream_requests) up,
      (select count(*)::int from public.v2_request_facts) facts, (select count(*)::int from public.v2_request_attempts) attempts,
      (select count(*)::int from public.v2_request_routing_traces) traces, (select count(*)::int from public.v2_request_pricing_lines) lines,
      (select total_nanos::int from public.usage_rollup) rollup`)).rows[0];
  const before = await counts();
  assert.equal(before.rollup, 4500);
  const snapshot = async () => (await db.query(`select to_jsonb(f) fact, to_jsonb(g) gr from public.v2_request_facts f
    join public.gateway_requests g on g.id = f.gateway_request_id order by f.request_id`)).rows;
  const untouched = await snapshot();

  const run = async (sql, params) => (await db.query(sql, params)).rows[0].result;

  // Report mode counts and logs, and changes nothing.
  const report = await run(`select private.redact_expired_byok_request_metadata() result`);
  assert.equal(report.mode, 'report');
  assert.equal(report.eligible_requests, 1);
  assert.equal(report.facts_redacted, 0);
  assert.deepEqual(await snapshot(), untouched, 'report mode changes no data');
  assert.equal((await db.query(`select count(*)::int n from public.gateway_routing_archive_deletions`)).rows[0].n, 0);
  assert.deepEqual((await db.query(`select mode, eligible_requests, facts_redacted from private.byok_metadata_retention_runs`)).rows,
    [{ mode: 'report', eligible_requests: 1, facts_redacted: 0 }]);

  await assert.rejects(db.query(`select private.redact_expired_byok_request_metadata(true, 500, 364)`), /retention 365-3650 days/);
  await assert.rejects(db.query(`select private.redact_expired_byok_request_metadata(true, 0, 365)`), /batch size 1-5000/);
  await assert.rejects(db.query(`select private.redact_expired_byok_request_metadata(null, 500, 365)`), /apply must be set/);

  // Apply mode redacts the one expired BYOK request and keeps every row and total.
  const applied = await run(`select private.redact_expired_byok_request_metadata(true, 500, 365) result`);
  assert.deepEqual({ ...applied, cutoff: undefined, oldest_eligible_at: undefined }, {
    mode: 'apply', cutoff: undefined, oldest_eligible_at: undefined, eligible_requests: 1, facts_redacted: 1, attempts_redacted: 1,
    routing_traces_redacted: 1, gateway_requests_redacted: 1, upstream_attempts_redacted: 1, archive_prefixes_queued: 1,
  });
  assert.deepEqual(await counts(), before, 'no row is deleted and the rollup is not decremented');

  const fact = (await db.query(`select * from public.v2_request_facts where request_event_id = $1`, [old.fact])).rows[0];
  assert.deepEqual(Object.keys(fact.safe_metadata).sort(), ['performance', 'retention_redacted_at', 'service_tier', 'testing_mode']);
  for (const column of ['user_agent', 'sdk_name', 'sdk_version', 'client_version', 'session_id', 'end_user_id', 'native_response_id', 'edge_country', 'edge_continent']) {
    assert.equal(fact[column], null, `fact ${column} is cleared`);
  }
  assert.equal(Number(fact.cost_nanos), 1500);
  assert.equal(fact.service_tier_slug, 'priority');
  assert.equal(fact.cloudflare_colo, 'LHR');
  assert.equal(fact.latency_ms, 900);

  const gr = (await db.query(`select * from public.gateway_requests where id = $1`, [old.id])).rows[0];
  for (const column of ['native_response_id', 'error_message', 'error_payload', 'location', 'oauth_user_id', 'end_user_id', 'session_id', 'trace_data', 'attributed_user_id', 'attributed_access_role']) {
    assert.equal(gr[column], null, `gateway request ${column} is cleared`);
  }
  assert.deepEqual(gr.provider_attempts, []);
  assert.deepEqual(Object.keys(gr.detail_metadata), ['routing_archive']);
  assert.deepEqual(Object.keys(gr.detail_metadata.routing_archive), ['redacted_at']);
  assert.equal(Number(gr.cost_nanos), 1500);
  assert.equal(Number(gr.usage_total_tokens), 30);
  assert.deepEqual(gr.usage, { input_tokens: 10 });
  assert.equal(gr.attributed_department_id, '00000000-0000-0000-0000-0000000000dd');

  const upstream = (await db.query(`select * from public.gateway_upstream_requests where gateway_request_id = $1`, [old.id])).rows[0];
  for (const column of ['upstream_url', 'native_response_id', 'error_message', 'error_description', 'error_param', 'request_payload', 'response_payload']) {
    assert.equal(upstream[column], null, `upstream ${column} is cleared`);
  }
  assert.deepEqual(upstream.metadata, {});
  assert.equal(upstream.key_source, 'byok');
  assert.equal(Number(upstream.cost_nanos), 1500);

  const attempt = (await db.query(`select * from public.v2_request_attempts where request_event_id = $1`, [old.fact])).rows[0];
  assert.equal(attempt.upstream_response_id, null);
  assert.equal(attempt.upstream_error_message, null);
  assert.equal(attempt.upstream_error_description, null);
  assert.equal(attempt.upstream_error_code, 'rate_limit');
  assert.equal(attempt.latency_ms, 900);
  assert.deepEqual(attempt.safe_metadata, { key_source: 'byok' });

  const trace = (await db.query(`select * from public.v2_request_routing_traces where request_event_id = $1`, [old.fact])).rows[0];
  assert.deepEqual(trace.requested_routing, {});
  assert.deepEqual(trace.sticky_routing, {});
  assert.deepEqual(trace.pool_bounds, { n: 1 });

  const prefix = (await db.query(`select object_prefix from public.gateway_routing_archive_deletions`)).rows;
  const hash = (await db.query(`select encode(sha256(convert_to('old-byok', 'UTF8')), 'hex') h`)).rows[0].h;
  assert.deepEqual(prefix, [{ object_prefix: `workspaces/${ws}/routing/v1/${hash}/` }]);

  const audit = (await db.query(`select tbl, op, pruning from public.trigger_audit order by tbl`)).rows;
  assert.deepEqual(audit, [
    { tbl: 'v2_request_attempts', op: 'UPDATE', pruning: 'on' },
    { tbl: 'v2_request_facts', op: 'UPDATE', pruning: 'on' },
  ], 'only updates run, with rollup rebuilds suppressed');
  assert.equal((await db.query(`select coalesce(current_setting('phaseo.pruning_byok_metadata', true), '') v`)).rows[0].v, '');

  // The recent BYOK request and the old non-BYOK request are untouched.
  const after = await snapshot();
  assert.deepEqual(after.filter(row => row.fact.request_id !== 'old-byok'), untouched.filter(row => row.fact.request_id !== 'old-byok'));
  assert.ok(recent.fact && oldGateway.fact);

  // A second run finds nothing, changes nothing and logs nothing.
  await db.query(`delete from public.trigger_audit`);
  const again = await run(`select private.redact_expired_byok_request_metadata(true, 500, 365) result`);
  assert.equal(again.eligible_requests, 0);
  assert.equal(again.facts_redacted, 0);
  assert.equal((await db.query(`select count(*)::int n from public.trigger_audit`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from private.byok_metadata_retention_runs`)).rows[0].n, 2);

  // Batches are bounded and resume where the previous one stopped.
  for (let i = 0; i < 3; i += 1) await seed(`batch-${i}`, 380 + i, true);
  const first = await run(`select private.redact_expired_byok_request_metadata(true, 2, 365) result`);
  assert.equal(first.eligible_requests, 3);
  assert.equal(first.facts_redacted, 2);
  const second = await run(`select private.redact_expired_byok_request_metadata(true, 2, 365) result`);
  assert.equal(second.eligible_requests, 1);
  assert.equal(second.facts_redacted, 1);
  assert.equal((await run(`select private.redact_expired_byok_request_metadata(true, 2, 365) result`)).eligible_requests, 0);

  // A longer operator window leaves younger expired rows alone.
  const longer = await run(`select private.redact_expired_byok_request_metadata(false, 500, 3650) result`);
  assert.equal(longer.eligible_requests, 0);
} finally {
  await db.close();
}
console.log('byok metadata retention: ok');
