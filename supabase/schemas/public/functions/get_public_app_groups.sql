CREATE OR REPLACE FUNCTION public.get_public_app_groups (
  p_references text[]
)
  RETURNS TABLE (
    reference      text,
    app_id         text,
    app_name       text,
    app_url        text,
    app_image_url  text,
    app_category   text,
    app_is_active  boolean,
    app_is_public  boolean,
    app_last_seen  timestamp with time zone,
    app_created_at timestamp with time zone,
    app_updated_at timestamp with time zone,
    member_ids     text[],
    public_slug    text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with groups as (
    select aa.*, array[aa.id::text] as member_ids,
      public.api_app_public_slug(aa.title, aa.url, aa.id::text) as public_slug
    from public.api_apps aa
    where aa.is_public = true and aa.is_active = true
  ), requested as (
    select unnest(coalesce(p_references, array[]::text[])) as reference
  )
  select requested.reference, groups.id::text, groups.title, groups.url,
    groups.image_url, groups.category, groups.is_active, groups.is_public,
    groups.last_seen, groups.created_at, groups.updated_at, groups.member_ids,
    groups.public_slug
  from requested
  join groups on requested.reference = groups.public_slug
    or requested.reference = groups.id::text;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_app_groups"(text[]) TO "service_role";

COMMENT ON FUNCTION "public"."get_public_app_groups"(text[]) IS 'Resolves public app IDs or stable slugs to canonical URL groups for the service API.';

REVOKE ALL ON FUNCTION "public"."get_public_app_groups"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_app_groups"(text[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_app_groups"(text[]) FROM PUBLIC, "anon", "authenticated";
