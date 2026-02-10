alter table public.credit_ledger
    add column if not exists source_ref_type text,
    add column if not exists source_ref_id text;
create index if not exists credit_ledger_source_ref_idx
    on public.credit_ledger (source_ref_type, source_ref_id);
