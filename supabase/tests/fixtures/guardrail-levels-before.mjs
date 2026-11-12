// The tables, as they are before the guardrail levels migration, that guardrail assignment tests need,
// cut down to the columns the migration and its functions read. Loads the real
// private.spend_scope_departments and public.protect_slack_agent_guardrail. Gateway publication
// intents are recorded in private.test_publications instead of the real outbox.
import { readFile } from 'node:fs/promises';

const schema = (path) => readFile(new URL(`../../schemas/${path}`, import.meta.url), 'utf8');

export async function createGuardrailLevelsBase(db) {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private;
    grant usage on schema private to service_role;
    create table public.workspaces (id uuid primary key);
    create table public.users (user_id uuid primary key);
    create table public.workspace_settings (
      workspace_id uuid primary key references public.workspaces(id) on delete cascade,
      department_spend_attribution text not null default 'all');
    create table public.workspace_departments (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      unique (id, workspace_id));
    create table public.workspace_department_grants (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      user_id uuid not null,
      department_id uuid not null,
      source_type text not null default 'manual',
      source_id uuid not null default gen_random_uuid(),
      position text not null default 'member',
      is_primary boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (workspace_id, user_id, department_id, source_type, source_id),
      foreign key (department_id, workspace_id) references public.workspace_departments(id, workspace_id) on delete cascade);
    create table public.workspace_member_overrides (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      user_id uuid not null,
      department_override_enabled boolean not null default false,
      department_id uuid,
      updated_at timestamptz not null default now(),
      primary key (workspace_id, user_id),
      foreign key (department_id, workspace_id) references public.workspace_departments(id, workspace_id) on delete restrict);
    create table public.keys (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id),
      created_by uuid not null,
      oauth_user_id uuid,
      key_kind text not null default 'standard',
      department_id uuid,
      name text,
      foreign key (department_id, workspace_id) references public.workspace_departments(id, workspace_id) on delete set null (department_id));
    create table public.workspace_guardrails (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      enabled boolean not null default true,
      privacy_enable_paid_may_train boolean not null default true,
      privacy_enable_free_may_train boolean not null default true,
      privacy_enable_free_may_publish_prompts boolean not null default true,
      privacy_enable_input_output_logging boolean not null default true,
      privacy_zdr_only boolean not null default false,
      provider_restriction_mode text not null default 'none',
      provider_restriction_enforce_allowed boolean not null default false,
      model_restriction_mode text not null default 'none',
      prompt_injection_enabled boolean not null default false,
      sensitive_info_enabled boolean not null default false);
    create table public.key_guardrails (
      key_id uuid not null references public.keys(id) on delete cascade,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (key_id, guardrail_id));
    create table public.workspace_member_guardrails (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      user_id uuid not null references public.users(user_id) on delete cascade,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (workspace_id, user_id, guardrail_id));
    create table public.slack_installations (key_id uuid, guardrail_id uuid, status text not null default 'active');

    create table private.test_publications (table_name text not null, workspace_id uuid);
    create function private.capture_gateway_workspace_publication() returns trigger language plpgsql as $$
    begin
      insert into private.test_publications
      values (tg_table_name, coalesce(to_jsonb(new)->>'workspace_id', to_jsonb(old)->>'workspace_id')::uuid);
      return null;
    end $$;
  `);
  await db.exec(await schema('private/functions/spend_scope_departments.sql'));
  await db.exec(await schema('public/functions/protect_slack_agent_guardrail.sql'));
  await db.exec(`
    create trigger protect_slack_agent_guardrail before delete or update on public.key_guardrails
      for each row execute function public.protect_slack_agent_guardrail();
  `);
}
