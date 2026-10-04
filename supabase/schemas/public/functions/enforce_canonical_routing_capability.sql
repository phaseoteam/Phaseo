CREATE OR REPLACE FUNCTION public.enforce_canonical_routing_capability()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
declare canonical text;
begin
  -- Existing historical aliases are read-only records of the old identity.
  if tg_table_name = 'v2_route_capabilities' and tg_op = 'UPDATE' then
    if old.status = 'disabled' and old.effective_to is not null
      and old.effective_to <= now() and new.capability_id = old.capability_id
      and new.status = old.status and new.effective_to = old.effective_to
    then return new; end if;
  end if;
  canonical := public.canonical_routing_capability_id(new.capability_id);
  if canonical is null then
    raise exception 'Unsupported routing capability: %', new.capability_id using errcode='23514';
  end if;
  new.capability_id := canonical;
  return new;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_canonical_routing_capability"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_canonical_routing_capability"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_canonical_routing_capability"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_canonical_routing_capability"() FROM PUBLIC, "anon", "authenticated";
