create index if not exists email_outbox_workspace_id_idx
  on public.email_outbox (workspace_id);

create index if not exists email_outbox_user_id_idx
  on public.email_outbox (user_id);
