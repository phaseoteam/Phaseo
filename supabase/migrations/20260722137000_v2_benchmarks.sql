-- Benchmark catalogue and model results are first-class v2 data, keyed by model slug.
create table if not exists public.v2_benchmarks (
  benchmark_id text primary key,
  name text not null,
  category text,
  link text,
  total_models integer,
  ascending_order boolean not null default false,
  benchmark_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_benchmark_results (
  result_id uuid primary key default gen_random_uuid(),
  model_slug text not null references public.v2_models(model_slug) on delete cascade,
  benchmark_id text not null references public.v2_benchmarks(benchmark_id) on delete cascade,
  score text,
  score_numeric numeric,
  is_self_reported boolean not null default false,
  other_info text,
  source_link text,
  rank integer,
  occur_idx integer,
  variant text,
  result_key text,
  created_at timestamptz,
  updated_at timestamptz
);

create index if not exists v2_benchmark_results_model_idx on public.v2_benchmark_results(model_slug, benchmark_id);
create index if not exists v2_benchmark_results_rank_idx on public.v2_benchmark_results(benchmark_id, rank, model_slug);

insert into public.v2_benchmarks (benchmark_id, name, category, link, total_models, ascending_order, benchmark_type, created_at, updated_at)
select id, name, category, link, total_models, coalesce(ascending_order, false), type, created_at, updated_at
from public.data_benchmarks
on conflict (benchmark_id) do update set name = excluded.name, category = excluded.category, link = excluded.link,
  total_models = excluded.total_models, ascending_order = excluded.ascending_order, benchmark_type = excluded.benchmark_type,
  updated_at = excluded.updated_at;

insert into public.v2_benchmark_results (result_id, model_slug, benchmark_id, score, score_numeric, is_self_reported, other_info, source_link, rank, occur_idx, variant, result_key, created_at, updated_at)
select result.id, result.model_id, result.benchmark_id, result.score, result.score_numeric, coalesce(result.is_self_reported, false),
  result.other_info, result.source_link, result.rank, result.occur_idx, result.variant, result.result_key, result.created_at, result.updated_at
from public.data_benchmark_results result
join public.v2_models model on model.model_slug = result.model_id
join public.v2_benchmarks benchmark on benchmark.benchmark_id = result.benchmark_id
on conflict (result_id) do update set score = excluded.score, score_numeric = excluded.score_numeric, rank = excluded.rank,
  updated_at = excluded.updated_at;

alter table public.v2_benchmarks enable row level security;
alter table public.v2_benchmark_results enable row level security;
drop policy if exists v2_benchmarks_public_select on public.v2_benchmarks;
create policy v2_benchmarks_public_select on public.v2_benchmarks for select to anon, authenticated using (true);
drop policy if exists v2_benchmark_results_public_select on public.v2_benchmark_results;
create policy v2_benchmark_results_public_select on public.v2_benchmark_results for select to anon, authenticated using (true);
grant select on public.v2_benchmarks, public.v2_benchmark_results to anon, authenticated;
grant insert, update, delete on public.v2_benchmarks, public.v2_benchmark_results to service_role;

create or replace function public.get_v2_model_benchmarks(p_model_slug text)
returns table (
  result_id uuid, benchmark_id text, score text, score_numeric numeric, is_self_reported boolean,
  other_info text, source_link text, result_rank integer, occur_idx integer, variant text, result_key text,
  benchmark_name text, category text, link text, total_models integer, ascending_order boolean, benchmark_type text,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security invoker set search_path = public
as $$
  select result.result_id, result.benchmark_id, result.score, result.score_numeric, result.is_self_reported,
    result.other_info, result.source_link, result.rank, result.occur_idx, result.variant, result.result_key,
    benchmark.name, benchmark.category, benchmark.link, benchmark.total_models, benchmark.ascending_order,
    benchmark.benchmark_type, result.created_at, result.updated_at
  from public.v2_benchmark_results result
  join public.v2_benchmarks benchmark on benchmark.benchmark_id = result.benchmark_id
  where result.model_slug = lower(trim(p_model_slug))
  order by benchmark.name, result.rank nulls last, result.created_at desc;
$$;
grant execute on function public.get_v2_model_benchmarks(text) to anon, authenticated, service_role;
