alter table public.workspace_guardrails
  add column if not exists model_restriction_mode text not null default 'none';

alter table public.workspace_guardrails
  drop constraint if exists workspace_guardrails_model_restriction_mode_check;

alter table public.workspace_guardrails
  add constraint workspace_guardrails_model_restriction_mode_check
  check (model_restriction_mode in ('none', 'allowlist', 'blocklist'));
