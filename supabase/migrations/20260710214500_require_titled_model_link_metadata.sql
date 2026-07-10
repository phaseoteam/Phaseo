-- Match the canonical schema after all existing link rows have been backfilled.
alter table public.data_model_links
  alter column kind set not null,
  alter column title set not null;

notify pgrst, 'reload schema';
