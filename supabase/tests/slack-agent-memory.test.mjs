import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const billing = await read('../migrations/20261021203244_slack_agent_billing.sql');
const guardrailRule = await read('../migrations/20261026223103_slack_agent_guardrail_allows_logging_providers.sql');
const uninstallFromSlack = await read('../migrations/20261022113514_slack_agent_uninstall_from_slack.sql');
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_slack_agent_memory_and_skills.sql'));
const migration = await read(`../migrations/${migrationName}`);
const declarative = [
  'tables/slack_agent_notes.sql', 'tables/slack_agent_skills.sql', 'functions/save_slack_agent_note.sql', 'functions/search_slack_agent_notes.sql',
  'functions/set_slack_agent_todo_done.sql', 'functions/forget_slack_agent_note.sql', 'functions/load_slack_agent_turn_memory.sql',
  'functions/save_slack_agent_skill.sql', 'functions/get_slack_agent_skill.sql', 'functions/delete_slack_agent_memory.sql',
];
const installationsFile = await read('../schemas/public/tables/slack_installations.sql');
const WORKSPACE = '10000000-0000-4000-8000-000000000001';
const OTHER_WORKSPACE = '10000000-0000-4000-8000-000000000002';
const THIRD_WORKSPACE = '10000000-0000-4000-8000-000000000003';
const CHANNEL = 'C0CHANNEL1';
const OTHER_CHANNEL = 'C0CHANNEL2';
const PERSON = 'U0PERSON01';

try {
  // Minimal pre-existing objects the Slack billing migration and the uninstall function use (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
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
    -- The production trigger function, so updated_at behaves as it does there.
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$
    begin
      if row(NEW.*) is distinct from row(OLD.*) and NEW.updated_at is not distinct from OLD.updated_at then NEW.updated_at := now(); end if;
      return NEW;
    end $$;
    insert into public.workspaces values ('${WORKSPACE}'), ('${OTHER_WORKSPACE}'), ('${THIRD_WORKSPACE}');
  `);
  await db.exec(billing);
  await db.exec(guardrailRule);
  await db.exec(uninstallFromSlack);
  await db.exec(migration);
  for (const file of declarative) {
    assert.ok(migration.includes(await read(`../schemas/public/${file}`)), `the migration matches ${file}`);
  }
  const trigger = installationsFile.match(/CREATE TRIGGER slack_installations_delete_agent_memory[\s\S]*?delete_slack_agent_memory\(\);/)?.[0];
  assert.ok(trigger && migration.includes(trigger), 'the migration matches the installations table trigger');
  assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /m);

  const install = async (workspaceId, teamId) => (await rows(
    `insert into public.slack_installations (workspace_id, team_id, team_name, bot_user_id, secrets_ciphertext, monthly_cap_nanos, installed_at)
     values ($1, $2, 'Test team', 'U0BOT0001', 'v1.iv.cipher', 25000000000, '2026-10-20T09:00:00Z') returning id`,
    [workspaceId, teamId],
  ))[0].id;
  const installationId = await install(WORKSPACE, 'T0TEAM0001');
  const otherId = await install(OTHER_WORKSPACE, 'T0TEAM0002');
  assert.equal((await rows('select memory_enabled from public.slack_installations where id = $1', [installationId]))[0].memory_enabled, true, 'memory is on by default');

  // Clients can neither read the tables nor call the functions.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of ['slack_agent_notes', 'slack_agent_skills']) {
      await assert.rejects(rows(`select * from public.${table}`), /permission denied/);
    }
    await assert.rejects(rows('select public.save_slack_agent_note($1, $2, $3, $4, $5, $6)', [installationId, 'note', CHANNEL, 'x', PERSON, null]), /permission denied/);
    await assert.rejects(rows('select * from public.search_slack_agent_notes($1, $2, $3, $4, $5, $6, $7)', [installationId, CHANNEL, true, null, null, null, null]), /permission denied/);
    await assert.rejects(rows('select public.load_slack_agent_turn_memory($1, $2, $3)', [installationId, CHANNEL, true]), /permission denied/);
    await assert.rejects(rows('select public.save_slack_agent_skill($1, $2, $3, $4, $5, $6)', [installationId, 'x', 'x', 'x', PERSON, false]), /permission denied/);
    await db.exec('reset role');
  }

  await db.exec('set role service_role');
  // The service role writes only through the save functions, which hold the caps.
  await assert.rejects(rows(`insert into public.slack_agent_notes (installation_id, kind, text, created_by) values ($1, 'note', 'x', $2)`, [installationId, PERSON]), /permission denied/);
  await assert.rejects(rows(`insert into public.slack_agent_skills (installation_id, name, description, instructions, created_by) values ($1, 'x', 'x', 'x', $2)`, [installationId, PERSON]), /permission denied/);

  const save = async (kind, channel, text, { installation = installationId, by = PERSON, expiresAt = null } = {}) =>
    (await rows('select public.save_slack_agent_note($1, $2, $3, $4, $5, $6) as result', [installation, kind, channel, text, by, expiresAt]))[0].result;
  // workspaceNotes: false for someone from another organisation, who sees only the conversation's.
  const search = async ({ installation = installationId, channel = CHANNEL, workspaceNotes = true, query = null, kind = null, includeDone = null, limit = null } = {}) =>
    rows('select * from public.search_slack_agent_notes($1, $2, $3, $4, $5, $6, $7)', [installation, channel, workspaceNotes, query, kind, includeDone, limit]);

  const note = await save('note', CHANNEL, '  Deploys freeze on Fridays after 3pm.  ');
  assert.equal(note.status, 'saved');
  assert.equal(note.note.text, 'Deploys freeze on Fridays after 3pm.', 'saved trimmed');
  assert.equal(note.note.channel_id, CHANNEL);
  assert.equal(note.note.created_by, PERSON);
  assert.equal(note.note.installation_id, undefined, 'the installation id is not echoed back');
  const again = await save('note', CHANNEL, 'deploys freeze on fridays after 3pm.');
  assert.deepEqual([again.status, again.note.id], ['exists', note.note.id], 'the same open note is never saved twice');
  assert.equal((await save('note', OTHER_CHANNEL, 'Deploys freeze on Fridays after 3pm.')).status, 'saved', 'another conversation keeps its own copy');
  const pin = await save('pin', null, 'Our fiscal year starts on 1 April.');
  const channelPin = await save('pin', CHANNEL, 'Release notes go out every Tuesday.');
  const todo = await save('todo', CHANNEL, 'Send the Q4 budget to finance.');
  await save('todo', OTHER_CHANNEL, 'Book the offsite venue.');
  await assert.rejects(save('reminder', CHANNEL, 'x'), /invalid_kind/);
  await assert.rejects(save('note', CHANNEL, 'x'.repeat(501)), /slack_agent_notes_text_check/);
  await assert.rejects(save('note', CHANNEL, '   '), /slack_agent_notes_text_check/);
  await assert.rejects(save('note', 'general', 'x'), /slack_agent_notes_channel_id_check/);
  await assert.rejects(save('note', CHANNEL, 'x', { by: 'someone' }), /slack_agent_notes_created_by_check/);
  assert.equal((await save('note', CHANNEL, 'Note for another workspace', { installation: '00000000-0000-4000-8000-0000000000ff' })).status, 'not_installed');

  // A conversation sees its own notes and the workspace's, never another conversation's.
  const visible = await search();
  assert.deepEqual(visible.map((row) => row.text).sort(), [
    'Deploys freeze on Fridays after 3pm.', 'Our fiscal year starts on 1 April.', 'Release notes go out every Tuesday.', 'Send the Q4 budget to finance.',
  ]);
  assert.deepEqual((await search({ installation: otherId })).map((row) => row.id), [], 'nor another installation\'s');
  assert.deepEqual((await search({ kind: 'pin' })).map((row) => row.id), [channelPin.note.id, pin.note.id], 'newest first');
  // Search words: any of them, the notes holding more first.
  assert.deepEqual((await search({ query: 'FRIDAY deploys' })).map((row) => row.id), [note.note.id]);
  assert.deepEqual((await search({ query: 'fiscal, release! nothing' })).map((row) => row.id), [channelPin.note.id, pin.note.id]);
  assert.deepEqual((await search({ query: 'release fiscal year' })).map((row) => row.id), [pin.note.id, channelPin.note.id], 'two words beat one');
  assert.deepEqual((await search({ query: 'x' })).length, 4, 'one-character words are ignored');
  assert.deepEqual((await search({ query: 'zebra' })).length, 0);
  assert.equal((await search({ limit: 1 })).length, 1);
  assert.equal((await search({ limit: 0 })).length, 1, 'at least one');

  // To-dos: done and not done again, only one the conversation can see.
  const setDone = async (id, done, channel = CHANNEL, workspaceNotes = true) =>
    rows('select * from public.set_slack_agent_todo_done($1, $2, $3, $4, $5)', [installationId, channel, workspaceNotes, id, done]);
  const [done] = await setDone(todo.note.id, true);
  assert.ok(done.done_at instanceof Date);
  assert.ok(done.updated_at >= done.created_at);
  assert.equal((await setDone(todo.note.id, true))[0].done_at.getTime(), done.done_at.getTime(), 'marking it done again keeps when it was done');
  assert.deepEqual((await search({ kind: 'todo' })).map((row) => row.id), [], 'done to-dos are left out');
  assert.deepEqual((await search({ kind: 'todo', includeDone: true })).map((row) => row.id), [todo.note.id]);
  assert.equal((await save('todo', CHANNEL, 'Send the Q4 budget to finance.')).status, 'saved', 'a done to-do can be added again');
  assert.equal((await setDone(todo.note.id, false))[0].done_at, null);
  assert.equal((await setDone(note.note.id, true)).length, 0, 'only to-dos');
  assert.equal((await setDone(todo.note.id, true, OTHER_CHANNEL)).length, 0, 'not from another conversation');

  // Forget: one note the conversation can see.
  const forget = async (id, channel = CHANNEL, installation = installationId, workspaceNotes = true) =>
    (await rows('select public.forget_slack_agent_note($1, $2, $3, $4) as removed', [installation, channel, workspaceNotes, id]))[0].removed;
  assert.equal(await forget(channelPin.note.id, OTHER_CHANNEL), false, 'not from another conversation');
  assert.equal(await forget(pin.note.id, CHANNEL, otherId), false, 'not from another installation');

  // Someone from another organisation: the conversation's notes only, never the workspace's.
  const workspaceTodo = await save('todo', null, 'Renew the company domain.');
  assert.deepEqual((await search({ workspaceNotes: false })).map((row) => row.text).sort(), [
    'Deploys freeze on Fridays after 3pm.', 'Release notes go out every Tuesday.', 'Send the Q4 budget to finance.', 'Send the Q4 budget to finance.',
  ]);
  assert.ok((await search()).some((row) => row.id === workspaceTodo.note.id), 'which everyone else sees');
  assert.deepEqual((await search({ workspaceNotes: null, kind: 'pin' })).map((row) => row.id), [channelPin.note.id], 'no flag means no workspace notes');
  assert.equal((await setDone(workspaceTodo.note.id, true, CHANNEL, false)).length, 0, 'a workspace to-do is not ticked off');
  assert.equal((await setDone(workspaceTodo.note.id, true, CHANNEL, null)).length, 0);
  assert.equal(await forget(pin.note.id, CHANNEL, installationId, false), false, 'nor a workspace note forgotten');
  assert.equal((await setDone(todo.note.id, true, CHANNEL, false)).length, 1, 'the conversation\'s still is');
  assert.equal((await setDone(todo.note.id, false, CHANNEL, false)).length, 1);
  assert.equal(await forget(workspaceTodo.note.id), true);

  assert.equal(await forget(channelPin.note.id), true);
  assert.equal(await forget(channelPin.note.id), false);

  // Expired notes are hidden, then deleted on the next turn or save.
  const expiring = await save('pin', null, 'The office is closed this week.', { expiresAt: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(expiring.status, 'saved');
  await db.exec('reset role');
  await rows(`update public.slack_agent_notes set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where id = $1`, [expiring.note.id]);
  await db.exec('set role service_role');
  assert.ok(!(await search()).some((row) => row.id === expiring.note.id), 'an expired note is hidden at once');
  const memory = async (channel = CHANNEL, installation = installationId, workspaceNotes = true) =>
    (await rows('select public.load_slack_agent_turn_memory($1, $2, $3) as memory', [installation, channel, workspaceNotes]))[0].memory;
  const turn = await memory();
  assert.deepEqual(turn.pins.map((entry) => [entry.scope, entry.text]), [['workspace', 'Our fiscal year starts on 1 April.']]);
  assert.deepEqual(Object.keys(turn.pins[0]).sort(), ['created_at', 'id', 'scope', 'text']);
  assert.deepEqual([turn.skills, turn.skills_total], [[], 0]);
  await db.exec('reset role');
  assert.equal((await rows('select count(*)::int as n from public.slack_agent_notes where id = $1', [expiring.note.id]))[0].n, 0, 'and deleted on the next turn');
  await db.exec('set role service_role');

  // Each turn: up to 10 of the conversation's pins and 10 of the workspace's, newest first.
  await db.exec('reset role');
  await rows(`insert into public.slack_agent_notes (installation_id, kind, channel_id, text, created_by, created_at)
    select $1, 'pin', case when n % 2 = 0 then $2 else null end, 'Pin ' || n, $3, now() - (n || ' minutes')::interval
    from generate_series(1, 30) as n`, [installationId, CHANNEL, PERSON]);
  await db.exec('set role service_role');
  const pinned = (await memory()).pins;
  assert.equal(pinned.filter((entry) => entry.scope === 'channel').length, 10);
  assert.equal(pinned.filter((entry) => entry.scope === 'workspace').length, 10);
  assert.deepEqual(pinned.slice(0, 3).map((entry) => entry.text), ['Pin 2', 'Pin 4', 'Pin 6'], 'the conversation\'s first, newest first');
  assert.equal(pinned[10].text, 'Our fiscal year starts on 1 April.', 'then the workspace\'s, newest first');
  assert.ok(!(await memory(OTHER_CHANNEL)).pins.some((entry) => entry.scope === 'channel' && entry.text.startsWith('Pin ')), 'another conversation sees none of them');
  const external = (await memory(CHANNEL, installationId, false)).pins;
  assert.deepEqual([external.length, new Set(external.map((entry) => entry.scope))], [10, new Set(['channel'])], 'someone from another organisation sees only the conversation\'s');
  assert.deepEqual((await memory(CHANNEL, installationId, null)).pins.filter((entry) => entry.scope === 'workspace'), []);

  // At most 500 notes an installation.
  await db.exec('reset role');
  const count = async () => (await rows('select count(*)::int as n from public.slack_agent_notes where installation_id = $1', [installationId]))[0].n;
  await rows(`insert into public.slack_agent_notes (installation_id, kind, text, created_by)
    select $1, 'note', 'Filler ' || n, $2 from generate_series(1, $3::int) as n`, [installationId, PERSON, 500 - 1 - await count()]);
  await db.exec('set role service_role');
  assert.equal((await save('note', CHANNEL, 'The 500th note.')).status, 'saved');
  assert.deepEqual(await save('note', CHANNEL, 'One too many.'), { status: 'full', limit: 500 });
  assert.equal((await save('note', CHANNEL, 'The 500th note.')).status, 'exists', 'a full memory still finds what it has');
  assert.equal(await forget(note.note.id), true);
  assert.equal((await save('note', CHANNEL, 'Room again.')).status, 'saved');

  // Skills.
  const saveSkill = async (name, { description = 'Summarise the week.', instructions = 'List what shipped, then what slipped.', replace = false, installation = installationId } = {}) =>
    (await rows('select public.save_slack_agent_skill($1, $2, $3, $4, $5, $6) as result', [installation, name, description, instructions, PERSON, replace]))[0].result;
  const getSkill = async (name, installation = installationId) => rows('select * from public.get_slack_agent_skill($1, $2)', [installation, name]);
  const weekly = await saveSkill(' Weekly report ');
  assert.equal(weekly.status, 'saved');
  assert.equal(weekly.skill.name, 'Weekly report');
  assert.equal(weekly.skill.instructions, undefined, 'instructions are not echoed back');
  assert.deepEqual(await saveSkill('WEEKLY REPORT', { description: 'Other' }), { status: 'name_taken', skill: { name: 'Weekly report', description: 'Summarise the week.' } });
  const replaced = await saveSkill('weekly report', { description: 'Summarise the week for leads.', instructions: 'Three bullets.', replace: true });
  assert.deepEqual([replaced.status, replaced.skill.id, replaced.skill.name], ['replaced', weekly.skill.id, 'weekly report']);
  const [loaded] = await getSkill('Weekly Report');
  assert.deepEqual([loaded.instructions, loaded.description, loaded.created_by], ['Three bullets.', 'Summarise the week for leads.', PERSON]);
  assert.equal((await getSkill('Weekly report', otherId)).length, 0, 'skills belong to one installation');
  assert.equal((await saveSkill('Weekly report', { installation: otherId })).status, 'saved', 'another installation can use the same name');
  await assert.rejects(saveSkill('Line\nbreak'), /slack_agent_skills_name_check/);
  await assert.rejects(saveSkill('x'.repeat(61)), /slack_agent_skills_name_check/);
  await assert.rejects(saveSkill('Long description', { description: 'x'.repeat(201) }), /slack_agent_skills_description_check/);
  await assert.rejects(saveSkill('Long instructions', { instructions: 'x'.repeat(4001) }), /slack_agent_skills_instructions_check/);
  for (let index = 2; index <= 100; index += 1) await saveSkill(`Skill ${String(index).padStart(3, '0')}`);
  assert.deepEqual(await saveSkill('One too many'), { status: 'full', limit: 100 });
  assert.equal((await saveSkill('Skill 050', { replace: true, description: 'Changed' })).status, 'replaced', 'a full list can still change a skill');
  const withSkills = await memory();
  assert.equal(withSkills.skills_total, 100);
  assert.equal(withSkills.skills.length, 20, 'the 20 changed most recently');
  assert.deepEqual(withSkills.skills[0], { name: 'Skill 050', description: 'Changed' });
  assert.deepEqual(Object.keys(withSkills.skills[0]).sort(), ['description', 'name']);

  // Memory turned off by an admin: no pins and no note functions, skills as before, and the notes kept.
  await db.exec('reset role');
  const notesBefore = await count();
  await rows('update public.slack_installations set memory_enabled = false where id = $1', [installationId]);
  await db.exec('set role service_role');
  const off = await memory();
  assert.deepEqual([off.pins, off.skills.length, off.skills_total], [[], 20, 100]);
  assert.deepEqual(await save('note', CHANNEL, 'Saved while off.'), { status: 'memory_off' });
  assert.deepEqual(await search(), []);
  assert.equal((await setDone(todo.note.id, true)).length, 0);
  assert.equal(await forget(pin.note.id), false);
  assert.equal((await getSkill('Skill 050')).length, 1, 'skills still load');
  assert.equal((await saveSkill('Skill 050', { replace: true, description: 'Changed while off' })).status, 'replaced', 'and can be saved');
  await db.exec('reset role');
  assert.equal(await count(), notesBefore, 'nothing was deleted');
  await rows('update public.slack_installations set memory_enabled = true where id = $1', [installationId]);
  await db.exec('set role service_role');
  assert.equal((await memory()).pins.length, 20, 'back on, the same pins');

  // Uninstalling in Slack deletes the installation's notes and skills, and nothing else's.
  const otherNotes = async () => (await rows('select count(*)::int as n from public.slack_agent_notes where installation_id = $1', [otherId]))[0].n;
  await save('note', CHANNEL, 'Kept by the other installation.', { installation: otherId });
  assert.equal(await rows('select public.uninstall_slack_agent_from_slack($1, $2, $3)', [installationId, 'app_uninstalled', '2026-10-21T10:00:00Z']).then((result) => result.length), 1);
  await db.exec('reset role');
  assert.equal(await count(), 0);
  assert.equal((await rows('select count(*)::int as n from public.slack_agent_skills where installation_id = $1', [installationId]))[0].n, 0);
  assert.equal(await otherNotes(), 1);
  assert.equal((await rows('select count(*)::int as n from public.slack_agent_skills where installation_id = $1', [otherId]))[0].n, 1);
  await db.exec('set role service_role');
  assert.deepEqual(await save('note', CHANNEL, 'Too late.'), { status: 'not_installed' });
  assert.deepEqual(await saveSkill('Too late'), { status: 'not_installed' });

  // Uninstalling in Phaseo settings (web-api updates the row): the same.
  await rows(`update public.slack_installations set status = 'paused' where id = $1`, [otherId]);
  assert.equal(await otherNotes(), 1, 'pausing keeps them');
  await rows(`update public.slack_installations set status = 'uninstalled', uninstalled_at = now() where id = $1`, [otherId]);
  assert.equal(await otherNotes(), 0);
  assert.equal((await rows('select count(*)::int as n from public.slack_agent_skills where installation_id = $1', [otherId]))[0].n, 0);

  // A reinstall is a new installation and starts with an empty memory.
  await db.exec('reset role');
  const reinstalled = await install(WORKSPACE, 'T0TEAM0001');
  await db.exec('set role service_role');
  assert.deepEqual(await memory(CHANNEL, reinstalled), { pins: [], skills: [], skills_total: 0 });
  await db.exec('reset role');

  console.log('slack-agent-memory: all assertions passed');
} finally {
  await db.close();
}
