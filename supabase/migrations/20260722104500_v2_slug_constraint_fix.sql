-- Model identifiers may contain provider-supported '+' and '@' characters.

alter table public.v2_models drop constraint if exists v2_models_slug_check;
alter table public.v2_models
  add constraint v2_models_slug_check
  check (model_slug = lower(model_slug) and model_slug ~ '^[a-z0-9][a-z0-9._:/+@-]*$');

alter table public.v2_model_aliases drop constraint if exists v2_model_aliases_slug_check;
alter table public.v2_model_aliases
  add constraint v2_model_aliases_slug_check
  check (alias_slug = lower(alias_slug) and alias_slug ~ '^[a-z0-9][a-z0-9._:/+@-]*$');
