CREATE OR REPLACE FUNCTION public.enforce_provider_catalog_source_owner_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.created_by is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.created_by::text, 918273));
  if (
    select count(*)
    from public.provider_catalog_sources source
    where source.created_by = new.created_by
  ) >= 5 then
    raise exception using
      errcode = '23514',
      message = 'provider_catalog_source_owner_limit';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."enforce_provider_catalog_source_owner_limit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_provider_catalog_source_owner_limit"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_provider_catalog_source_owner_limit"() FROM PUBLIC, "anon", "authenticated", "service_role";
