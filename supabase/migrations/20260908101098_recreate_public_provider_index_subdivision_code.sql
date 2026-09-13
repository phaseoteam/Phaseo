-- phaseo:allow-production-history-backfill reason: Recreate the pending provider index with its widened return type before immutable history runs.
-- The following two migrations use CREATE OR REPLACE FUNCTION, but adding an
-- OUT column changes the function return type and PostgreSQL requires the
-- existing function to be dropped first.
do $$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('public.get_public_provider_index()'::regprocedure)
    into v_definition;
  v_original := v_definition;

  if position('subdivision_code' in v_definition) > 0 then
    return;
  end if;

  v_definition := replace(
    v_definition,
    $old$country_code text,$old$,
    $new$country_code text,
  subdivision_code text,$new$
  );
  v_definition := replace(
    v_definition,
    $old$      provider.country_code,$old$,
    $new$      provider.country_code,
      provider.subdivision_code,$new$
  );
  v_definition := replace(
    v_definition,
    $old$    coalesce(provider.country_code, ''),$old$,
    $new$    coalesce(provider.country_code, ''),
    provider.subdivision_code,$new$
  );

  if v_definition = v_original
     or position('subdivision_code text' in v_definition) = 0
     or position('subdivision_code' in v_definition) = 0 then
    raise exception 'public provider index did not contain the expected location clauses';
  end if;

  execute 'drop function if exists public.get_public_provider_index()';
  execute v_definition;
  revoke all on function public.get_public_provider_index() from public;
  grant execute on function public.get_public_provider_index() to service_role;
  comment on function public.get_public_provider_index() is
    'Returns provider coverage rows, boolean ZDR, and execution/data residency arrays for the cached public Web API provider index.';
end $$;

notify pgrst, 'reload schema';
