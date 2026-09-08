-- phaseo:allow-production-history-backfill -- Extend the cached public provider index with the primary subdivision field.
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

  -- pg_get_functiondef normalizes RETURNS TABLE columns and may place these
  -- fields on one line, so do not include indentation in the match.
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
  execute v_definition;
end $$;

notify pgrst, 'reload schema';
