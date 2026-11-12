CREATE OR REPLACE FUNCTION public.get_latest_provider_onboarding_review_page (
  p_before_created_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id         uuid                     DEFAULT NULL::uuid,
  p_limit             integer                  DEFAULT 101
)
  RETURNS TABLE (
    id                     uuid,
    provider_slug          text,
    submitted_by           uuid,
    provider_name          text,
    website_url            text,
    catalog_url            text,
    catalog_mode           text,
    application_type       text,
    model_count            integer,
    validation_summary     jsonb,
    submitted_at           timestamp with time zone,
    created_at             timestamp with time zone,
    provider_review_status text,
    provider_review_reason text
  )
  LANGUAGE sql
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
  with latest_submissions as (
    select distinct on (submission.provider_slug)
      submission.id,
      submission.provider_slug,
      submission.submitted_by,
      submission.provider_name,
      submission.website_url,
      submission.catalog_url,
      submission.catalog_mode,
      submission.application_type,
      submission.model_count,
      submission.validation_summary,
      submission.submitted_at,
      submission.created_at,
      submission.provider_review_status,
      submission.provider_review_reason
    from public.provider_onboarding_submissions submission
    order by submission.provider_slug, submission.created_at desc, submission.id desc
  )
  select latest.*
  from latest_submissions latest
  where (
      p_before_created_at is null and p_before_id is null
    ) or (
      p_before_created_at is not null and p_before_id is not null
      and (latest.created_at, latest.id) < (p_before_created_at, p_before_id)
    )
  order by latest.created_at desc, latest.id desc
  limit least(greatest(coalesce(p_limit, 101), 1), 101)
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_latest_provider_onboarding_review_page"(timestamp WITH time zone, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_latest_provider_onboarding_review_page"(timestamp WITH time zone, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_latest_provider_onboarding_review_page"(timestamp WITH time zone, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_latest_provider_onboarding_review_page"(timestamp WITH time zone, uuid, integer) FROM PUBLIC, "anon", "authenticated";
