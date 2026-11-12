CREATE OR REPLACE FUNCTION public.update_mobile_notification_categories (
  p_user_id    uuid,
  p_categories jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Merges category switches into the user's mobile push settings in one statement, creating
-- them if needed, so two devices changing different categories at once both keep their change.
-- Only known categories set to true or false are stored. Returns the stored switches.
declare
  v_patch jsonb;
  v_categories jsonb;
begin
  if p_user_id is null or jsonb_typeof(p_categories) is distinct from 'object' then
    raise exception 'invalid_mobile_notification_categories';
  end if;

  select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb) into v_patch
  from jsonb_each(p_categories) as c
  where c.key in ('new-models', 'prices-providers', 'deprecations', 'money', 'traffic', 'security', 'jobs', 'account', 'digest')
    and jsonb_typeof(c.value) = 'boolean';

  insert into public.mobile_notification_preferences as p (user_id, categories)
  values (p_user_id, v_patch)
  on conflict (user_id) do update
    set categories = p.categories || excluded.categories, updated_at = now()
  returning p.categories into v_categories;

  return v_categories;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_mobile_notification_categories"(uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_mobile_notification_categories"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_mobile_notification_categories"(uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_mobile_notification_categories"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";
