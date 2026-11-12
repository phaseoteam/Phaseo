CREATE OR REPLACE FUNCTION public.enforce_self_serve_provider_approval()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  is_self_serve boolean := false;
  review_status text;
begin
  select coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve',
    provider.metadata -> 'self_serve' ->> 'provider_review_status'
    into is_self_serve, review_status
  from public.v2_providers provider
  where provider.provider_slug = new.provider_slug;

  if is_self_serve and review_status is distinct from 'approved' then
    new.routing_enabled := false;
    new.access_scope := 'internal';
    new.phaseo_status := 'testing';
    if new.status in ('active', 'degraded') then new.status := 'disabled'; end if;
    if new.provider_availability_status in ('available', 'preview') then
      new.provider_availability_status := 'coming_soon';
    end if;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."enforce_self_serve_provider_approval"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_self_serve_provider_approval"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_self_serve_provider_approval"() FROM PUBLIC, "anon", "authenticated", "service_role";
