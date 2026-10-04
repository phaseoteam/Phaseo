CREATE OR REPLACE FUNCTION public.sync_v2_request_edge_geography()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.edge_country := case
    when nullif(new.safe_metadata->>'edge_country', '') ~ '^[A-Za-z]{2}$'
      then upper(new.safe_metadata->>'edge_country')
    else null
  end;
  new.edge_continent := case
    when nullif(new.safe_metadata->>'edge_continent', '') ~ '^[A-Za-z]{2}$'
      then upper(new.safe_metadata->>'edge_continent')
    else null
  end;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sync_v2_request_edge_geography"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_v2_request_edge_geography"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_v2_request_edge_geography"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_v2_request_edge_geography"() FROM PUBLIC, "anon", "authenticated";
