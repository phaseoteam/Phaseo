CREATE OR REPLACE FUNCTION public.is_provider_country_allowed (
  p_provider_slug text,
  p_country_code  text,
  p_at            timestamp with time zone DEFAULT now()
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select not exists (
    select 1
    from public.v2_provider_country_restrictions r
    where r.provider_slug = p_provider_slug
      and r.country_code = upper(p_country_code)
      and r.enabled
      and r.effective_at <= p_at
      and (r.expires_at is null or r.expires_at > p_at)
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_provider_country_allowed"(text, text, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_provider_country_allowed"(text, text, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_provider_country_allowed"(text, text, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."is_provider_country_allowed"(text, text, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
