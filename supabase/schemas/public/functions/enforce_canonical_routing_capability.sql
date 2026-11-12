create or replace function public.enforce_canonical_routing_capability()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare canonical text;
begin
  if tg_table_name = 'v2_route_capabilities' and tg_op = 'UPDATE' then
    if old.status = 'disabled' and old.effective_to is not null and old.effective_to <= now()
      and old.capability_id is distinct from public.canonical_routing_capability_id(old.capability_id)
    then
      if to_jsonb(new) is distinct from to_jsonb(old) then
        raise exception 'Historical capability aliases cannot be changed' using errcode='23514';
      end if;
      return new;
    end if;
  end if;
  canonical := public.canonical_routing_capability_id(new.capability_id);
  if canonical is null then raise exception 'Unsupported routing capability: %',new.capability_id using errcode='23514'; end if;
  new.capability_id := canonical;
  return new;
end $$;

GRANT EXECUTE ON FUNCTION "public"."enforce_canonical_routing_capability"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_canonical_routing_capability"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_canonical_routing_capability"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_canonical_routing_capability"() FROM PUBLIC, "anon", "authenticated";
