alter table public.workspace_guardrails
  add column if not exists sensitive_info_enabled boolean not null default false;

alter table public.workspace_guardrails
  add column if not exists sensitive_info_default_action text not null default 'redact';

alter table public.workspace_guardrails
  add column if not exists sensitive_info_rules jsonb not null default '[]'::jsonb;

alter table public.workspace_guardrails
  drop constraint if exists workspace_guardrails_sensitive_info_default_action_check;

alter table public.workspace_guardrails
  add constraint workspace_guardrails_sensitive_info_default_action_check
  check (sensitive_info_default_action in ('flag', 'redact', 'block'));
