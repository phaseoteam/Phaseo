CREATE OR REPLACE FUNCTION public.enqueue_public_model_release_push()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  v_lab_name text;
  v_was_public boolean;
  v_is_public boolean;
begin
  v_was_public := tg_op = 'UPDATE'
    and old.status = 'active'
    and old.hidden = false
    and coalesce(old.released_at, now()) <= now();
  v_is_public := new.status = 'active'
    and new.hidden = false
    and coalesce(new.released_at, now()) <= now();

  if v_is_public and not v_was_public then
    select name into v_lab_name from public.v2_labs where lab_slug = new.lab_slug;
    insert into public.model_release_push_events (model_slug, model_name, lab_name, released_at)
    values (new.model_slug, new.name, coalesce(v_lab_name, new.lab_slug), new.released_at)
    on conflict (model_slug) do nothing;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enqueue_public_model_release_push"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_public_model_release_push"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_public_model_release_push"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_public_model_release_push"() FROM PUBLIC, "anon", "authenticated";
