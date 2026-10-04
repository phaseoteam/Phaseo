CREATE OR REPLACE FUNCTION public.upsert_api_app (
  p_team_id uuid,
  p_title   text,
  p_url     text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
    v_app_key text;
    v_id uuid;
BEGIN
    -- Derive app_key from title (assuming title is X-Title)
    v_app_key := p_title;

    -- Try to find existing app
    SELECT id INTO v_id FROM public.api_apps WHERE team_id = p_team_id AND app_key = v_app_key;

    IF v_id IS NOT NULL THEN
        -- Update last_seen and meta
        UPDATE public.api_apps SET
            last_seen = now(),
            updated_at = now(),
            meta = jsonb_build_object('referer', p_url, 'appTitle', p_title)
        WHERE id = v_id;
        RETURN v_id;
    ELSE
        -- Insert new app
        INSERT INTO public.api_apps (team_id, app_key, title, url, meta) VALUES (
            p_team_id,
            v_app_key,
            p_title,
            p_url,
            jsonb_build_object('referer', p_url, 'appTitle', p_title)
        ) RETURNING id INTO v_id;
        RETURN v_id;
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."upsert_api_app"(uuid, text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."upsert_api_app"(uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."upsert_api_app"(uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."upsert_api_app"(uuid, text, text) TO "postgres";
