CREATE OR REPLACE FUNCTION public.bump_web_cache_generation (
  p_scope         text,
  p_actor_user_id uuid DEFAULT NULL::uuid
)
  RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into public.web_cache_generations (scope, generation, updated_at, updated_by)
  values (p_scope, 2, now(), p_actor_user_id)
  on conflict (scope) do update
    set generation = public.web_cache_generations.generation + 1,
        updated_at = now(),
        updated_by = excluded.updated_by
  returning generation;
$function$;

GRANT EXECUTE ON FUNCTION "public"."bump_web_cache_generation"(text, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."bump_web_cache_generation"(text, uuid) IS 'Atomically advances a browser-visible cache generation after an administrative cache purge.';

REVOKE ALL ON FUNCTION "public"."bump_web_cache_generation"(text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."bump_web_cache_generation"(text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."bump_web_cache_generation"(text, uuid) FROM PUBLIC, "anon", "authenticated";
