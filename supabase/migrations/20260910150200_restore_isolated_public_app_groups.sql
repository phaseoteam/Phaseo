-- Reassert the post-hardening definition after the recovered, older-version
-- migration has run in environments whose migration ledger lacked it.
create or replace function public.api_app_public_slug(p_title text, p_url text, p_app_id text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select public.api_app_slug_base(p_title) || '--' || left(md5(coalesce(p_app_id, '')), 12);
$$;

create or replace function public.get_public_app_groups(p_references text[])
returns table (
  reference text, app_id text, app_name text, app_url text, app_image_url text,
  app_category text, app_is_active boolean, app_is_public boolean,
  app_last_seen timestamptz, app_created_at timestamptz,
  app_updated_at timestamptz, member_ids text[], public_slug text
)
language sql stable set search_path = public, pg_temp as $$
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
$$;

revoke all on function public.api_app_public_slug(text, text, text) from public;
revoke all on function public.get_public_app_groups(text[]) from public;
grant execute on function public.api_app_public_slug(text, text, text) to service_role;
grant execute on function public.get_public_app_groups(text[]) to service_role;
