import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrationNamed = async (suffix) => {
  const name = (await readdir(new URL('../migrations/', import.meta.url))).find((file) => file.endsWith(suffix));
  return read(`../migrations/${name}`);
};
const billing = await read('../migrations/20261021203244_slack_agent_billing.sql');
const guardrailRule = await read('../migrations/20261026223103_slack_agent_guardrail_allows_logging_providers.sql');
const uninstallFromSlack = await read('../migrations/20261022113514_slack_agent_uninstall_from_slack.sql');
const modelChoice = await read('../migrations/20261027131100_slack_agent_model_choice.sql');
const memory = await migrationNamed('_slack_agent_memory_and_skills.sql');
const migration = await migrationNamed('_slack_agent_schedules.sql');
// Skipped runs while the agent is paused or a bill is due: replaces the claim, recording a run and the failures
// column's comment, and resumes the schedules the claim used to pause for that.
const skipWhilePaused = await migrationNamed('_slack_agent_schedules_skip_while_paused.sql');
const REPLACED = ['functions/claim_slack_agent_schedules.sql', 'functions/record_slack_agent_schedule_run.sql'];
const FAILURES_COMMENT = /COMMENT ON COLUMN "public"\."slack_agent_schedules"\."failures" IS '[^\n]*';/;
const declarative = [
  'tables/slack_agent_schedules.sql', 'functions/slack_agent_schedule_next_run.sql', 'functions/save_slack_agent_schedule.sql',
  'functions/claim_slack_agent_schedules.sql', 'functions/record_slack_agent_schedule_run.sql', 'functions/cancel_slack_agent_schedule.sql',
  'functions/set_slack_agent_schedule_status.sql', 'functions/delete_slack_agent_schedules.sql',
];
const installationsFile = await read('../schemas/public/tables/slack_installations.sql');
const WORKSPACE = '10000000-0000-4000-8000-000000000001';
const OTHER_WORKSPACE = '10000000-0000-4000-8000-000000000002';
const OWNER = '20000000-0000-4000-8000-000000000001';
const ADMIN = '20000000-0000-4000-8000-000000000002';
const MEMBER = '20000000-0000-4000-8000-000000000003';
const CHANNEL = 'C0CHANNEL1';
const PERSON = 'U0PERSON01';
const OTHER_PERSON = 'U0PERSON02';
const MINUTE = 60_000;

try {
  // Minimal pre-existing objects the Slack migrations use (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create type public.workspace_role as enum ('owner', 'admin', 'member');
    create table public.workspaces (id uuid primary key, owner_user_id uuid);
    create table public.workspace_members (workspace_id uuid not null, user_id uuid not null, role public.workspace_role not null, primary key (workspace_id, user_id));
    create table public.keys (id uuid primary key, workspace_id uuid not null, hash text not null,
      status text not null default 'active', soft_blocked boolean not null default false, expires_at timestamptz);
    create table public.workspace_guardrails (id uuid primary key, workspace_id uuid not null, description text, enabled boolean not null default true,
      privacy_enable_paid_may_train boolean not null default true, privacy_enable_free_may_train boolean not null default true,
      privacy_enable_free_may_publish_prompts boolean not null default true, privacy_enable_input_output_logging boolean not null default true,
      updated_at timestamptz not null default now());
    create table public.key_guardrails (key_id uuid not null references public.keys(id) on delete cascade,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade, primary key (key_id, guardrail_id));
    create table public.workspace_member_guardrails (workspace_id uuid not null, user_id uuid not null,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade, primary key (workspace_id, user_id, guardrail_id));
    create table public.workspace_audit_events (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      actor_user_id uuid, action text not null, target_type text not null, target_id text not null, target_name text,
      metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
    create table public.wallets (workspace_id uuid primary key, balance_nanos bigint not null default 0,
      reserved_nanos bigint not null default 0, updated_at timestamptz not null default now());
    create table public.credit_ledger (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      event_time timestamptz not null default now(), kind text not null, amount_nanos bigint not null,
      before_balance_nanos bigint not null, after_balance_nanos bigint not null, ref_type text not null,
      ref_id text not null, created_at timestamptz not null default now(), status text, source_ref_type text, source_ref_id text);
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$
    begin
      if row(NEW.*) is distinct from row(OLD.*) and NEW.updated_at is not distinct from OLD.updated_at then NEW.updated_at := now(); end if;
      return NEW;
    end $$;
    insert into auth.users values ('${OWNER}'), ('${ADMIN}'), ('${MEMBER}');
    insert into public.workspaces values ('${WORKSPACE}', '${OWNER}'), ('${OTHER_WORKSPACE}', null);
    insert into public.workspace_members values ('${WORKSPACE}', '${ADMIN}', 'admin'), ('${WORKSPACE}', '${MEMBER}', 'member');
  `);
  for (const sql of [billing, guardrailRule, uninstallFromSlack, modelChoice, memory, migration]) await db.exec(sql);

  // The migrations are the declarative schema, verbatim: what the skip-while-paused migration replaced is in it,
  // and the rest is in the schedules migration.
  for (const file of declarative) {
    const definition = await read(`../schemas/public/${file}`);
    if (REPLACED.includes(file)) {
      assert.ok(skipWhilePaused.includes(definition), `the skip-while-paused migration matches ${file}`);
    } else if (file === 'tables/slack_agent_schedules.sql') {
      const comment = definition.match(FAILURES_COMMENT)?.[0];
      assert.ok(comment && skipWhilePaused.includes(comment), 'the skip-while-paused migration matches the failures comment');
      for (const part of definition.split(comment)) assert.ok(migration.includes(part), `the migration matches ${file}`);
    } else {
      assert.ok(migration.includes(definition), `the migration matches ${file}`);
    }
  }
  assert.doesNotMatch(skipWhilePaused, /\bdelete\s+from\b|\bdrop\s|\btruncate\b/i, 'deletes nothing');
  const trigger = installationsFile.match(/CREATE TRIGGER slack_installations_delete_agent_schedules[\s\S]*?delete_slack_agent_schedules\(\);/)?.[0];
  assert.ok(trigger && migration.includes(trigger), 'the migration matches the installations table trigger');
  assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /m);

  const install = async (workspaceId, teamId, extra = '') => (await rows(
    `insert into public.slack_installations (workspace_id, team_id, team_name, bot_user_id, secrets_ciphertext, monthly_cap_nanos, installed_at)
     values ($1, $2, 'Test team', 'U0BOT0001', 'v1.iv.cipher', 25000000000, '2026-10-20T09:00:00Z') returning id ${extra}`,
    [workspaceId, teamId],
  ))[0];
  const first = await install(WORKSPACE, 'T0TEAM0001', ', schedules_enabled, schedules_max, schedule_creators');
  assert.deepEqual([first.schedules_enabled, first.schedules_max, first.schedule_creators], [true, 20, 'everyone'], 'on, 20 and everyone by default');
  const installationId = first.id;
  const otherId = (await install(OTHER_WORKSPACE, 'T0TEAM0002')).id;
  await assert.rejects(rows('update public.slack_installations set schedules_max = 0 where id = $1', [installationId]), /slack_installations_schedules_max_check/);
  await assert.rejects(rows('update public.slack_installations set schedules_max = 101 where id = $1', [installationId]), /slack_installations_schedules_max_check/);
  await assert.rejects(rows(`update public.slack_installations set schedule_creators = 'admins' where id = $1`, [installationId]), /slack_installations_schedule_creators_check/);

  // A schedule's row, making one due, claiming, recording a run, Settings' pause and resume, and an admin
  // pausing the agent (or a bill falling due).
  const schedule = async (id) => (await rows('select * from public.slack_agent_schedules where id = $1', [id]))[0];
  const makeDue = async (id, minutesAgo) => {
    await db.exec('reset role');
    await rows(`update public.slack_agent_schedules set next_run_at = date_trunc('minute', now()) - make_interval(mins => $2) where id = $1`, [id, minutesAgo]);
    await db.exec('set role service_role');
    return (await schedule(id)).next_run_at;
  };
  const claim = async (limit = 50) => rows('select * from public.claim_slack_agent_schedules($1)', [limit]);
  const record = async (id, runAt, result, { reason = null, pause = false } = {}) =>
    (await rows('select public.record_slack_agent_schedule_run($1, $2, $3, $4, $5) as result', [id, runAt, result, reason, pause]))[0].result;
  const setStatus = async (id, status, installation = installationId) =>
    (await rows('select public.set_slack_agent_schedule_status($1, $2, $3) as result', [installation, id, status]))[0].result;
  const setInstallationStatus = async (id, status) => {
    await db.exec('reset role');
    await rows('update public.slack_installations set status = $2 where id = $1', [id, status]);
    await db.exec('set role service_role');
  };

  // Before the skip-while-paused migration, the claim paused the due schedules of a paused installation (or one
  // with a bill due), and so did the Worker when it found that before a run started. The migration makes those
  // active again, as Resume in Settings would, and leaves other pauses alone.
  const LEGACY_WORKSPACE = '10000000-0000-4000-8000-000000000003';
  const WAITING_WORKSPACE = '10000000-0000-4000-8000-000000000004';
  await rows('insert into public.workspaces values ($1, null), ($2, null)', [LEGACY_WORKSPACE, WAITING_WORKSPACE]);
  const legacyId = (await install(LEGACY_WORKSPACE, 'T0TEAM0003')).id;
  const waitingId = (await install(WAITING_WORKSPACE, 'T0TEAM0004')).id;
  await db.exec('set role service_role');
  const legacy = {};
  for (const [installation, title] of [[legacyId, 'Paused'], [legacyId, 'Bill due'], [legacyId, 'By admin'], [legacyId, 'Creator gone'], [waitingId, 'Waiting']]) {
    legacy[title] = (await rows('select public.save_slack_agent_schedule($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as result',
      [installation, CHANNEL, title, 'Post the status.', 'hourly', null, 20, null, null, 'UTC', PERSON, `Legacy:${title}`]))[0].result.schedule.id;
  }
  await setInstallationStatus(legacyId, 'paused');
  await setInstallationStatus(waitingId, 'paused');
  await makeDue(legacy.Paused, 1);
  await makeDue(legacy.Waiting, 1);
  assert.deepEqual(await claim(), [], 'the old claim pauses them');
  await setInstallationStatus(legacyId, 'active');
  await makeDue(legacy['Bill due'], 1);
  await makeDue(legacy['Creator gone'], 1);
  const legacyRuns = await claim();
  const legacyRun = (title) => legacyRuns.find((row) => row.schedule_id === legacy[title]).run_at;
  await record(legacy['Bill due'], legacyRun('Bill due'), 'skipped', { reason: 'payment_due', pause: true });
  await record(legacy['Creator gone'], legacyRun('Creator gone'), 'skipped', { reason: 'creator_access', pause: true });
  await setStatus(legacy['By admin'], 'paused', legacyId);
  const before = {};
  for (const [title, id] of Object.entries(legacy)) before[title] = await schedule(id);
  assert.deepEqual(Object.values(before).map((row) => [row.status, row.pause_reason, row.failures]), [
    ['paused', 'installation_paused', 0], ['paused', 'payment_due', 1], ['paused', 'admin', 0], ['paused', 'creator_access', 1], ['paused', 'installation_paused', 0],
  ], 'paused the old way');

  await db.exec('reset role');
  await db.exec(skipWhilePaused);
  await db.exec('set role service_role');
  for (const title of ['Paused', 'Bill due', 'Waiting']) {
    const row = await schedule(legacy[title]);
    assert.deepEqual([row.status, row.pause_reason, row.failures], ['active', null, 0], `${title} is active again`);
    const sinceClaim = row.next_run_at.getTime() - before[title].last_claimed_at.getTime();
    assert.ok(sinceClaim >= 50 * MINUTE && sinceClaim <= 110 * MINUTE, `${title} runs at its next time at least 50 minutes after its last claim`);
    assert.equal(row.next_run_at.getUTCMinutes(), 20);
    assert.deepEqual([row.last_result, row.last_result_reason], [before[title].last_result, before[title].last_result_reason], 'its last run as it was');
  }
  for (const title of ['By admin', 'Creator gone']) assert.deepEqual(await schedule(legacy[title]), before[title], `${title} stays paused`);
  // An installation that's still paused skips the runs until it's active, then carries on.
  await makeDue(legacy.Waiting, 1);
  assert.deepEqual(await claim(), []);
  const waiting = await schedule(legacy.Waiting);
  assert.deepEqual([waiting.status, waiting.last_result, waiting.last_result_reason, waiting.failures], ['active', 'skipped', 'installation_paused', 0]);
  await setInstallationStatus(waitingId, 'active');
  await makeDue(legacy.Waiting, 1);
  assert.deepEqual((await claim()).map((row) => row.schedule_id), [legacy.Waiting]);
  await db.exec('reset role');

  // Clients can neither read the table nor call the functions.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select * from public.slack_agent_schedules'), /permission denied/);
    await assert.rejects(rows('select * from public.claim_slack_agent_schedules(10)'), /permission denied/);
    await assert.rejects(rows('select public.save_slack_agent_schedule($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
      [installationId, CHANNEL, 'x', 'x', 'daily', 9, 0, null, null, 'UTC', PERSON, 'Ev0000000001:0:1']), /permission denied/);
    await assert.rejects(rows('select public.cancel_slack_agent_schedule($1, $2, $3)', [installationId, WORKSPACE, PERSON]), /permission denied/);
    await db.exec('reset role');
  }

  // When each frequency runs next, in local time.
  await db.exec('set role service_role');
  const next = async (frequency, { hour = null, minute = 0, dayOfWeek = null, dayOfMonth = null, tz = 'UTC', after }) => (await rows(
    'select public.slack_agent_schedule_next_run($1, $2, $3, $4, $5, $6, $7) as at', [frequency, hour, minute, dayOfWeek, dayOfMonth, tz, after],
  ))[0].at.toISOString();
  assert.equal(await next('hourly', { minute: 15, after: '2026-10-27T10:20:00Z' }), '2026-10-27T11:15:00.000Z');
  assert.equal(await next('hourly', { minute: 15, after: '2026-10-27T10:10:00Z' }), '2026-10-27T10:15:00.000Z');
  assert.equal(await next('hourly', { minute: 15, after: '2026-10-27T10:15:00Z' }), '2026-10-27T11:15:00.000Z', 'always later than after');
  assert.equal(await next('hourly', { minute: 0, tz: 'Asia/Kolkata', after: '2026-10-27T10:20:00Z' }), '2026-10-27T10:30:00.000Z', 'on the local hour');
  assert.equal(await next('daily', { hour: 9, tz: 'Europe/London', after: '2026-10-27T10:00:00Z' }), '2026-10-28T09:00:00.000Z');
  assert.equal(await next('daily', { hour: 9, tz: 'Europe/London', after: '2026-03-28T10:00:00Z' }), '2026-03-29T08:00:00.000Z', 'after the clocks go forward');
  assert.equal(await next('weekdays', { hour: 9, tz: 'America/New_York', after: '2026-10-30T15:00:00Z' }), '2026-11-02T14:00:00.000Z', 'Friday afternoon to Monday morning');
  assert.equal(await next('weekdays', { hour: 9, tz: 'America/New_York', after: '2026-10-29T12:00:00Z' }), '2026-10-29T13:00:00.000Z');
  assert.equal(await next('weekly', { hour: 17, minute: 30, dayOfWeek: 3, after: '2026-10-28T18:00:00Z' }), '2026-11-04T17:30:00.000Z');
  assert.equal(await next('weekly', { hour: 17, minute: 30, dayOfWeek: 7, after: '2026-10-28T18:00:00Z' }), '2026-11-01T17:30:00.000Z', 'Sunday is 7');
  assert.equal(await next('monthly', { hour: 12, dayOfMonth: 31, after: '2026-11-01T00:00:00Z' }), '2026-11-30T12:00:00.000Z', 'the last day of a shorter month');
  assert.equal(await next('monthly', { hour: 12, dayOfMonth: 31, after: '2027-02-01T00:00:00Z' }), '2027-02-28T12:00:00.000Z');
  assert.equal(await next('monthly', { hour: 12, dayOfMonth: 15, after: '2026-10-15T12:00:00Z' }), '2026-11-15T12:00:00.000Z');
  assert.equal(await next('monthly', { hour: 0, dayOfMonth: 1, tz: 'Pacific/Auckland', after: '2026-10-27T10:00:00Z' }), '2026-10-31T11:00:00.000Z', 'the 1st, local');
  await assert.rejects(next('daily', { hour: 9, tz: 'Mars/Olympus_Mons', after: '2026-10-27T10:00:00Z' }), /time zone/);
  await assert.rejects(next('every_minute', { after: '2026-10-27T10:00:00Z' }), /invalid_schedule/);

  // Saving: what the agent's schedule_task tool calls.
  await assert.rejects(rows(`insert into public.slack_agent_schedules (installation_id, channel_id, title, prompt, frequency, minute, timezone, created_by, next_run_at)
    values ($1, $2, 'x', 'x', 'hourly', 0, 'UTC', $3, now())`, [installationId, CHANNEL, PERSON]), /permission denied/, 'only through the save function');
  let saves = 0;
  const save = async ({ installation = installationId, channel = CHANNEL, title = 'Weekly spend', prompt = 'Summarise last week\'s Phaseo spend by model.',
    frequency = 'weekly', hour = 9, minute = 0, dayOfWeek = 1, dayOfMonth = null, tz = 'Europe/London', by = PERSON, key = `Ev${++saves}:0:1` } = {}) =>
    (await rows('select public.save_slack_agent_schedule($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as result',
      [installation, channel, title, prompt, frequency, hour, minute, dayOfWeek, dayOfMonth, tz, by, key]))[0].result;
  const weekly = await save({ title: '  Weekly spend  ' });
  assert.equal(weekly.status, 'saved');
  assert.equal(weekly.schedule.title, 'Weekly spend', 'saved trimmed');
  assert.equal(weekly.schedule.installation_id, undefined, 'the installation id is not echoed back');
  assert.equal(weekly.schedule.status, 'active');
  assert.ok(Date.parse(weekly.schedule.next_run_at) > Date.now(), 'first runs after now');
  assert.equal(new Date(weekly.schedule.next_run_at).getUTCDay(), 1, 'on a Monday');
  await assert.rejects(save({ frequency: 'hourly', hour: 9, dayOfWeek: null }), /slack_agent_schedules_hour_check/, 'hourly has no hour');
  await assert.rejects(save({ frequency: 'daily', hour: null, dayOfWeek: null }), /slack_agent_schedules_hour_check/);
  await assert.rejects(save({ frequency: 'daily', dayOfWeek: 1 }), /slack_agent_schedules_day_of_week_check/);
  await assert.rejects(save({ frequency: 'weekly', dayOfWeek: 8 }), /slack_agent_schedules_day_of_week_check|invalid_schedule/);
  await assert.rejects(save({ frequency: 'monthly', dayOfWeek: null }), /slack_agent_schedules_day_of_month_check/);
  await assert.rejects(save({ minute: 60 }), /slack_agent_schedules_minute_check|invalid/);
  await assert.rejects(save({ title: 'x'.repeat(81) }), /slack_agent_schedules_title_check/);
  await assert.rejects(save({ title: 'Two\nlines' }), /slack_agent_schedules_title_check/);
  await assert.rejects(save({ prompt: 'x'.repeat(2001) }), /slack_agent_schedules_prompt_check/);
  await assert.rejects(save({ channel: 'general' }), /slack_agent_schedules_channel_id_check/);
  await assert.rejects(save({ by: 'someone' }), /slack_agent_schedules_created_by_check/);
  await assert.rejects(save({ tz: 'Mars/Olympus_Mons' }), /time zone/);
  await assert.rejects(save({ key: '' }), /slack_agent_schedules_creation_key_check/);
  await db.exec('reset role');
  await assert.rejects(rows(`insert into public.slack_agent_schedules (installation_id, channel_id, title, prompt, frequency, minute, timezone, created_by, creation_key, next_run_at)
    values ($1, $2, 'x', 'x', 'hourly', 0, '-03', $3, 'Ev0:0:1', now())`, [installationId, CHANNEL, PERSON]), /slack_agent_schedules_timezone_check/, 'IANA names only');
  await db.exec('set role service_role');
  assert.deepEqual(await save({ installation: '00000000-0000-4000-8000-0000000000ff' }), { status: 'not_installed' });

  // The admins' settings, held by the database.
  await db.exec('reset role');
  await rows('update public.slack_installations set schedules_enabled = false where id = $1', [installationId]);
  await db.exec('set role service_role');
  assert.deepEqual(await save(), { status: 'off' });
  await db.exec('reset role');
  await rows(`update public.slack_installations set schedules_enabled = true, schedule_creators = 'linked' where id = $1`, [installationId]);
  await rows('insert into public.slack_user_links (installation_id, slack_user_id, user_id) values ($1, $2, $3)', [installationId, OTHER_PERSON, MEMBER]);
  await db.exec('set role service_role');
  assert.deepEqual(await save(), { status: 'link_required' }, 'only linked people');
  assert.equal((await save({ by: OTHER_PERSON, title: 'Linked' })).status, 'saved');
  await db.exec('reset role');
  await rows(`update public.slack_installations set schedule_creators = 'everyone', schedules_max = 4 where id = $1`, [installationId]);
  await db.exec('set role service_role');
  const hourly = await save({ title: 'Hourly status', frequency: 'hourly', hour: null, minute: 5, dayOfWeek: null });
  const daily = await save({ title: 'Daily digest', frequency: 'daily', dayOfWeek: null, tz: 'America/New_York' });
  assert.deepEqual(await save({ title: 'One too many' }), { status: 'full', limit: 4 }, 'at most schedules_max');
  // A retried Workflow step saves again with the same key: it gets the schedule saved the first time, even when full.
  const replayed = await save({ title: 'Hourly status, reworded', frequency: 'hourly', hour: null, minute: 10, dayOfWeek: null, key: (await schedule(hourly.schedule.id)).creation_key });
  assert.deepEqual([replayed.status, replayed.schedule.id, replayed.schedule.title, replayed.schedule.minute], ['saved', hourly.schedule.id, 'Hourly status', 5]);
  assert.equal((await save({ installation: otherId })).status, 'saved', 'another installation has its own maximum');
  assert.equal((await save({ installation: otherId, key: (await schedule(hourly.schedule.id)).creation_key })).status, 'saved', 'keys are per installation');
  const count = async (installation = installationId) => (await rows('select count(*)::int as n from public.slack_agent_schedules where installation_id = $1', [installation]))[0].n;
  assert.equal(await count(), 4);
  assert.equal(await count(otherId), 2);

  // Claiming: due rows once, the next run at least 50 minutes on.
  assert.deepEqual(await claim(), [], 'nothing is due yet');
  const hourlyDue = await makeDue(hourly.schedule.id, 1);
  const weeklyDue = await makeDue(weekly.schedule.id, 3);
  const claimed = await claim();
  assert.deepEqual(claimed.map((row) => row.schedule_id), [weekly.schedule.id, hourly.schedule.id], 'oldest first');
  assert.deepEqual(Object.keys(claimed[0]).sort(), ['channel_id', 'created_by', 'day_of_month', 'day_of_week', 'frequency', 'hour', 'installation_id', 'minute', 'prompt', 'run_at', 'schedule_id', 'timezone', 'title']);
  assert.equal(claimed[1].run_at.getTime(), hourlyDue.getTime(), 'run_at is when it was due');
  assert.equal(claimed[0].prompt, 'Summarise last week\'s Phaseo spend by model.');
  assert.deepEqual(await claim(), [], 'and is claimed once');
  const afterHourly = await schedule(hourly.schedule.id);
  assert.equal(afterHourly.last_run_at.getTime(), hourlyDue.getTime());
  assert.equal(afterHourly.last_result, null, 'running');
  assert.ok(afterHourly.next_run_at.getTime() >= hourlyDue.getTime() + 50 * MINUTE, '50 minutes later at the soonest');
  assert.equal(afterHourly.next_run_at.getUTCMinutes(), 5, 'at its minute');
  const afterWeekly = await schedule(weekly.schedule.id);
  assert.ok(afterWeekly.next_run_at.getTime() > weeklyDue.getTime() + 50 * MINUTE);
  const london = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  assert.equal(london.format(afterWeekly.next_run_at), 'Mon 09:00', 'on its own day and local time');

  // A run missed for hours (the Worker was down) runs once, not once per hour missed.
  const missed = await makeDue(hourly.schedule.id, 5 * 60);
  assert.equal((await claim()).length, 1);
  assert.deepEqual(await claim(), []);
  assert.ok((await schedule(hourly.schedule.id)).next_run_at.getTime() > Date.now(), 'the next run is in the future');
  assert.ok(missed.getTime() < Date.now());

  // p_limit: the rest wait for the next tick.
  await makeDue(hourly.schedule.id, 2);
  await makeDue(daily.schedule.id, 1);
  assert.deepEqual((await claim(1)).map((row) => row.schedule_id), [hourly.schedule.id]);
  assert.deepEqual((await claim(1)).map((row) => row.schedule_id), [daily.schedule.id]);

  // A run claimed late, 59.5 minutes after it was due: the next run is still at least 50 minutes after the
  // claim, not at its minute moments later. Resuming it keeps that gap too.
  const soon = (new Date().getUTCMinutes() + 2) % 60;
  await db.exec('reset role');
  await rows(`update public.slack_agent_schedules set minute = $2, next_run_at = now() - interval '59 minutes 30 seconds' where id = $1`, [hourly.schedule.id, soon]);
  await db.exec('set role service_role');
  const claimedFrom = Date.now();
  assert.deepEqual((await claim()).map((row) => row.schedule_id), [hourly.schedule.id]);
  const late = await schedule(hourly.schedule.id);
  assert.ok(late.last_claimed_at.getTime() >= claimedFrom, 'when it was claimed');
  assert.ok(late.last_claimed_at.getTime() - late.last_run_at.getTime() >= 59 * MINUTE, 'last_run_at stays when it was due');
  assert.ok(late.next_run_at.getTime() >= late.last_claimed_at.getTime() + 50 * MINUTE, '50 minutes after the claim at the soonest');
  assert.equal(late.next_run_at.getUTCMinutes(), soon, 'at its minute');
  await setStatus(hourly.schedule.id, 'paused');
  const resumedLate = await setStatus(hourly.schedule.id, 'active');
  assert.ok(Date.parse(resumedLate.next_run_at) >= late.last_claimed_at.getTime() + 50 * MINUTE, 'resuming keeps the gap after the claim');

  // A run claimed a few minutes late keeps its next hourly slot.
  const slot = (new Date().getUTCMinutes() + 55) % 60;
  await db.exec('reset role');
  await rows(`update public.slack_agent_schedules set status = 'active', minute = $2, next_run_at = now() - interval '5 minutes' where id = $1`, [hourly.schedule.id, slot]);
  await db.exec('set role service_role');
  assert.deepEqual((await claim()).map((row) => row.schedule_id), [hourly.schedule.id]);
  const slightlyLate = await schedule(hourly.schedule.id);
  assert.ok(slightlyLate.next_run_at.getTime() - slightlyLate.last_claimed_at.getTime() < 60 * MINUTE, 'the next slot, not the one after');
  assert.equal(slightlyLate.next_run_at.getUTCMinutes(), slot);

  // Recording what became of a run.
  const dailyRun = (await schedule(daily.schedule.id)).last_run_at;
  const answered = await record(daily.schedule.id, dailyRun, 'answered');
  assert.deepEqual([answered.recorded, answered.paused, answered.failures, answered.created_by, answered.channel_id], [true, false, 0, PERSON, CHANNEL]);
  assert.deepEqual(await record(daily.schedule.id, dailyRun, 'failed'), { recorded: false, paused: false }, 'once per run');
  assert.deepEqual(await record(daily.schedule.id, '2026-01-01T00:00:00Z', 'failed'), { recorded: false, paused: false }, 'only the latest run');
  await assert.rejects(record(daily.schedule.id, dailyRun, 'exploded'), /invalid_result/);
  assert.equal((await schedule(daily.schedule.id)).last_result, 'answered');
  // Three failures in a row pause it, once.
  for (const attempt of [1, 2, 3]) {
    await makeDue(daily.schedule.id, 1);
    const [run] = await claim();
    const result = await record(daily.schedule.id, run.run_at, attempt === 2 ? 'skipped' : 'failed', { reason: attempt === 2 ? 'monthly_cap' : 'failed' });
    assert.equal(result.failures, attempt);
    assert.equal(result.paused, attempt === 3, `paused after the third (${attempt})`);
  }
  const failed = await schedule(daily.schedule.id);
  assert.deepEqual([failed.status, failed.pause_reason, failed.last_result, failed.failures], ['paused', 'failures', 'failed', 3]);
  await makeDue(daily.schedule.id, 1);
  assert.deepEqual(await claim(), [], 'a paused schedule is not claimed');
  // An answer in between starts the count again.
  await makeDue(hourly.schedule.id, 1);
  let [run] = await claim();
  assert.equal((await record(hourly.schedule.id, run.run_at, 'failed')).failures, 1);
  await makeDue(hourly.schedule.id, 1);
  [run] = await claim();
  assert.equal((await record(hourly.schedule.id, run.run_at, 'answered')).failures, 0);
  // Pausing at once, with the reason.
  await makeDue(hourly.schedule.id, 1);
  [run] = await claim();
  const notInChannel = await record(hourly.schedule.id, run.run_at, 'skipped', { reason: 'not_in_channel', pause: true });
  assert.deepEqual([notInChannel.paused, notInChannel.pause_reason], [true, 'not_in_channel']);
  assert.equal((await schedule(hourly.schedule.id)).status, 'paused');

  // Settings: pause and resume.
  const resumed = await setStatus(daily.schedule.id, 'active');
  assert.deepEqual([resumed.status, resumed.pause_reason, resumed.failures], ['active', null, 0]);
  assert.ok(Date.parse(resumed.next_run_at) > Date.now(), 'resumed from now');
  assert.ok(Date.parse(resumed.next_run_at) >= failed.last_run_at.getTime() + 59 * MINUTE);
  const paused = await setStatus(weekly.schedule.id, 'paused');
  assert.deepEqual([paused.status, paused.pause_reason], ['paused', 'admin']);
  assert.equal((await setStatus(hourly.schedule.id, 'paused')).pause_reason, 'not_in_channel', 'pausing a paused one keeps its reason');
  assert.equal(await setStatus(weekly.schedule.id, 'active', otherId), null, 'not another installation\'s');
  await assert.rejects(setStatus(weekly.schedule.id, 'deleted'), /invalid_status/);
  await setStatus(weekly.schedule.id, 'active');

  // Recurring tasks turned off: due runs are skipped, nothing is paused, and nothing runs to catch up.
  await db.exec('reset role');
  await rows('update public.slack_installations set schedules_enabled = false where id = $1', [installationId]);
  await db.exec('set role service_role');
  await makeDue(weekly.schedule.id, 1);
  assert.deepEqual(await claim(), []);
  const skipped = await schedule(weekly.schedule.id);
  assert.deepEqual([skipped.status, skipped.last_result, skipped.last_result_reason, skipped.failures], ['active', 'skipped', 'schedules_off', 0]);
  assert.ok(skipped.next_run_at.getTime() > Date.now());
  await db.exec('reset role');
  await rows('update public.slack_installations set schedules_enabled = true where id = $1', [installationId]);

  // A paused installation (or one with a charge unpaid): its due runs are skipped with that reason. The
  // schedules stay active, keep their failures in a row and move on to their next time.
  await db.exec('set role service_role');
  await makeDue(weekly.schedule.id, 1);
  [run] = await claim();
  assert.equal((await record(weekly.schedule.id, run.run_at, 'failed')).failures, 1);
  for (const [status, reason] of [['paused', 'installation_paused'], ['payment_due', 'payment_due']]) {
    await setInstallationStatus(installationId, status);
    const dueAt = await makeDue(weekly.schedule.id, 1);
    await makeDue(daily.schedule.id, 1);
    assert.deepEqual(await claim(), [], `nothing runs while ${status}`);
    for (const [id, failures] of [[weekly.schedule.id, 1], [daily.schedule.id, 0]]) {
      const row = await schedule(id);
      assert.deepEqual([row.status, row.pause_reason, row.last_result, row.last_result_reason, row.failures], ['active', null, 'skipped', reason, failures]);
      assert.ok(row.next_run_at.getTime() > Date.now(), 'and it moves on to its next time');
    }
    assert.equal((await schedule(weekly.schedule.id)).last_run_at.getTime(), dueAt.getTime());
  }
  // The Worker skips a run it claimed when it finds the installation paused (or a bill due) before it starts,
  // also in its Workflow: that neither pauses the schedule nor counts, even from a Worker that asks to pause.
  await setInstallationStatus(installationId, 'active');
  await makeDue(weekly.schedule.id, 1);
  [run] = await claim();
  assert.equal((await record(weekly.schedule.id, run.run_at, 'failed')).failures, 2);
  for (const [reason, pause] of [['installation_paused', false], ['payment_due', false], ['installation_paused', true]]) {
    await makeDue(weekly.schedule.id, 1);
    [run] = await claim();
    const skippedRun = await record(weekly.schedule.id, run.run_at, 'skipped', { reason, pause });
    assert.deepEqual([skippedRun.recorded, skippedRun.paused, skippedRun.pause_reason, skippedRun.failures], [true, false, null, 2], `${reason} skipped`);
  }
  const carriedOn = await schedule(weekly.schedule.id);
  assert.deepEqual([carriedOn.status, carriedOn.pause_reason, carriedOn.last_result, carriedOn.last_result_reason, carriedOn.failures], ['active', null, 'skipped', 'installation_paused', 2]);
  // Back on, the next runs happen on time with no admin action.
  await makeDue(weekly.schedule.id, 1);
  await makeDue(daily.schedule.id, 1);
  const backOn = await claim();
  assert.deepEqual(backOn.map((row) => row.schedule_id).sort(), [weekly.schedule.id, daily.schedule.id].sort());
  assert.equal((await record(weekly.schedule.id, backOn.find((row) => row.schedule_id === weekly.schedule.id).run_at, 'answered')).failures, 0);
  // Losing the creator's access still pauses a schedule at once.
  const lostAccess = await record(daily.schedule.id, backOn.find((row) => row.schedule_id === daily.schedule.id).run_at, 'skipped', { reason: 'creator_access', pause: true });
  assert.deepEqual([lostAccess.paused, lostAccess.pause_reason, lostAccess.failures], [true, 'creator_access', 1]);
  const lost = await schedule(daily.schedule.id);
  assert.deepEqual([lost.status, lost.pause_reason], ['paused', 'creator_access']);

  // Cancelling from Slack: the creator, or someone linked to a workspace owner or admin.
  const cancel = async (id, by, installation = installationId) =>
    (await rows('select public.cancel_slack_agent_schedule($1, $2, $3) as result', [installation, id, by]))[0].result;
  const linked = (await rows('select id from public.slack_agent_schedules where title = $1', ['Linked']))[0].id;
  assert.equal(await cancel(daily.schedule.id, OTHER_PERSON), 'not_allowed', 'a linked member can\'t cancel someone else\'s');
  assert.equal(await cancel(daily.schedule.id, 'U0STRANGER'), 'not_allowed');
  assert.equal(await cancel(daily.schedule.id, PERSON, otherId), 'not_found', 'nor through another installation');
  assert.equal(await cancel(linked, OTHER_PERSON), 'deleted', 'the creator can');
  assert.equal(await cancel(linked, OTHER_PERSON), 'not_found');
  await db.exec('reset role');
  await rows('insert into public.slack_user_links (installation_id, slack_user_id, user_id) values ($1, $2, $3), ($1, $4, $5)',
    [installationId, 'U0ADMIN001', ADMIN, 'U0OWNER001', OWNER]);
  await db.exec('set role service_role');
  assert.equal(await cancel(daily.schedule.id, 'U0ADMIN001'), 'deleted', 'a workspace admin can');
  assert.equal(await cancel(hourly.schedule.id, 'U0OWNER001'), 'deleted', 'so can its owner');
  assert.equal(await count(), 1);

  // The service role lists and deletes (Settings > Slack), but can't change a schedule directly.
  await assert.rejects(rows(`update public.slack_agent_schedules set next_run_at = now() where id = $1`, [weekly.schedule.id]), /permission denied/);

  // Uninstalling deletes the installation's schedules, from Slack or from Phaseo settings.
  assert.equal((await rows('select public.uninstall_slack_agent_from_slack($1, $2, $3)', [installationId, 'app_uninstalled', '2026-10-21T10:00:00Z'])).length, 1);
  await db.exec('reset role');
  assert.equal(await count(), 0);
  assert.equal(await count(otherId), 2, 'and nothing else\'s');
  await db.exec('set role service_role');
  assert.deepEqual(await save(), { status: 'not_installed' });
  await rows(`update public.slack_installations set status = 'uninstalled', uninstalled_at = now() where id = $1`, [otherId]);
  assert.equal(await count(otherId), 0);
  await db.exec('reset role');

  console.log('slack-agent-schedules: all assertions passed');
} finally {
  await db.close();
}
