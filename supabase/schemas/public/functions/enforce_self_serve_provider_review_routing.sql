CREATE OR REPLACE FUNCTION public.enforce_self_serve_provider_review_routing()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  review_status text;
begin
  if coalesce(new.metadata, '{}'::jsonb) ? 'self_serve' then
    review_status := new.metadata -> 'self_serve' ->> 'provider_review_status';
    if review_status is distinct from 'approved' then
      new.routable := false;
      new.routing_enabled := false;
      if new.status in ('active', 'degraded', 'beta') then
        new.status := 'not_ready';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_self_serve_provider_review_routing"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_self_serve_provider_review_routing"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_self_serve_provider_review_routing"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_self_serve_provider_review_routing"() FROM PUBLIC, "anon", "authenticated";
