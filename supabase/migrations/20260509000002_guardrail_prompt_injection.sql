alter table public.workspace_guardrails
  add column if not exists prompt_injection_enabled boolean not null default false;

alter table public.workspace_guardrails
  add column if not exists prompt_injection_action text not null default 'flag';

alter table public.workspace_guardrails
  drop constraint if exists workspace_guardrails_prompt_injection_action_check;

alter table public.workspace_guardrails
  add constraint workspace_guardrails_prompt_injection_action_check
  check (prompt_injection_action in ('flag', 'redact', 'block'));
