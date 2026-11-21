-- phaseo:allow-destructive-migration reason: Replaces the statement-level DELETE guard on v2_benchmark_results with a row-level one that still blocks hand-entered results and TRUNCATE; no rows are removed.
-- Scraped benchmark sources: one row per public leaderboard we read on a schedule.
-- Their results live in v2_benchmark_results tagged with source_id. They update in place,
-- are removed when the leaderboard drops them, and stay out of catalogue row history: the
-- daily archive in storage (benchmark-source-archive) is their history.

SET local check_function_bodies = off;

create table public.v2_benchmark_sources (
  source_id text primary key check (source_id ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null,
  publisher text,
  url text not null,
  attribution text,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_status text check (last_status in ('ok','failed','refused','empty')),
  last_error text,
  last_row_count integer,
  last_matched_count integer,
  unmatched_labels jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.v2_benchmark_sources enable row level security;
create policy v2_benchmark_sources_public_select on public.v2_benchmark_sources for select to anon,authenticated using (true);
grant select on public.v2_benchmark_sources to anon,authenticated;
grant select,insert,update on public.v2_benchmark_sources to service_role;

-- Manual identity pins: a source's label (normalised) for one catalogue model, or ignored.
-- source_id null pins the label for every source.
create table public.v2_benchmark_source_model_pins (
  pin_id uuid primary key default gen_random_uuid(),
  source_id text references public.v2_benchmark_sources(source_id) on delete cascade,
  label text not null check (label = lower(btrim(label)) and label <> ''),
  model_slug text references public.v2_models(model_slug) on delete cascade,
  effort text,
  ignored boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  check (ignored or model_slug is not null)
);
create unique index v2_benchmark_source_model_pins_label_idx on public.v2_benchmark_source_model_pins(coalesce(source_id, ''), label);
alter table public.v2_benchmark_source_model_pins enable row level security;
grant select,insert,update,delete on public.v2_benchmark_source_model_pins to service_role;

alter table public.v2_benchmarks
  add column source_id text references public.v2_benchmark_sources(source_id),
  add column description text,
  add column unit text;
create index v2_benchmarks_source_idx on public.v2_benchmarks(source_id) where source_id is not null;

alter table public.v2_benchmark_results
  add column source_id text references public.v2_benchmark_sources(source_id),
  add column source_model_label text,
  add column effort text,
  add column harness text,
  add column ci_low numeric,
  add column ci_high numeric,
  add column cost_usd numeric,
  add column duration_seconds numeric,
  add column output_tokens bigint,
  add column observed_on date;
create index v2_benchmark_results_source_idx on public.v2_benchmark_results(source_id, benchmark_id) where source_id is not null;

CREATE OR REPLACE FUNCTION public.prevent_curated_benchmark_result_removal()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  -- Scraped results follow their leaderboard and may be removed; hand-entered results keep the end-date rule.
  if TG_OP = 'DELETE' and OLD.source_id is not null then return OLD; end if;
  raise exception 'saved catalogue records cannot be deleted; set an end date instead';
end $function$;

REVOKE ALL ON FUNCTION "public"."prevent_curated_benchmark_result_removal"() FROM PUBLIC, "anon", "authenticated", "service_role";

drop trigger catalogue_no_removal on public.v2_benchmark_results;
create trigger catalogue_no_removal before delete on public.v2_benchmark_results for each row execute function public.prevent_curated_benchmark_result_removal();
create trigger catalogue_no_truncate before truncate on public.v2_benchmark_results for each statement execute function public.prevent_catalogue_removal();

drop trigger catalogue_row_history on public.v2_benchmark_results;
create trigger catalogue_row_history after insert or update on public.v2_benchmark_results for each row when (NEW.source_id is null) execute function catalogue_private.record_row_history();
create trigger catalogue_row_history_delete after delete on public.v2_benchmark_results for each row when (OLD.source_id is null) execute function catalogue_private.record_row_history();

insert into storage.buckets (id, name, public) values ('benchmark-source-archive', 'benchmark-source-archive', false) on conflict (id) do nothing;
