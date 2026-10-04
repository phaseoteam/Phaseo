CREATE OR REPLACE FUNCTION public.claim_model_discovery_public_announcements (
  p_run_id        uuid,
  p_model_slugs   text[],
  p_now           timestamp with time zone,
  p_lease_seconds integer                  DEFAULT 300
)
  RETURNS TABLE (
    model_slug    text,
    attempt_count integer
  )
  LANGUAGE sql
  SET search_path TO 'public'
  AS $function$
  update public.model_discovery_public_announcements
  set
    claim_run_id = p_run_id,
    claim_expires_at = coalesce(p_now, now()) + make_interval(secs => greatest(coalesce(p_lease_seconds, 300), 1)),
    last_run_id = p_run_id,
    updated_at = coalesce(p_now, now())
  where model_slug = any(coalesce(p_model_slugs, array[]::text[]))
    and status = 'pending'
    and (
      claim_run_id is null
      or claim_expires_at <= coalesce(p_now, now())
      or claim_run_id = p_run_id
    )
  returning model_slug, attempt_count;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_model_discovery_public_announcements"(uuid, text[], timestamp WITH time zone, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_model_discovery_public_announcements"(uuid, text[], timestamp WITH time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_model_discovery_public_announcements"(uuid, text[], timestamp WITH time zone, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_model_discovery_public_announcements"(uuid, text[], timestamp WITH time zone, integer) FROM PUBLIC, "anon", "authenticated";
