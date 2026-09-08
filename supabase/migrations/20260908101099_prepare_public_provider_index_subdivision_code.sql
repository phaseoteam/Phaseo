-- phaseo:allow-production-history-backfill reason: Repair the pending provider index before the immutable follow-up migration runs.
-- PostgreSQL canonicalizes pg_get_functiondef() return columns onto one line,
-- while the following migration was written against the source formatting.
-- Apply the same change with a whitespace-independent return-column match so
-- that the following migration sees an already-updated function and exits.
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
  execute v_definition;
end $$;

notify pgrst, 'reload schema';
