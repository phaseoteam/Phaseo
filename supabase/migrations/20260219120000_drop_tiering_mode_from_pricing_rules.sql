-- Remove legacy tiering mode: pricing is now entirely rule/condition based.
alter table if exists public.data_api_pricing_rules
  drop column if exists tiering_mode;
