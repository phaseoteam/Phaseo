CREATE OR REPLACE FUNCTION public.request_workspace_rate_limit_raise (
  p_workspace_id      uuid,
  p_from_tier         text,
  p_to_tier           text,
  p_requested_by      uuid,
  p_expires_at        timestamp with time zone,
  p_last_requested_at timestamp with time zone
)
  RETURNS TABLE (id uuid, from_tier text, to_tier text, expires_at timestamp with time zone)
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  -- The caller checked eligibility against the newest raise it saw. Under a
  -- per-workspace lock, insert only if that is still the newest raise, so two
  -- concurrent requests cannot both pass the check; the loser gets no row.
  perform pg_advisory_xact_lock(hashtextextended('workspace_rate_limit_raise:' || p_workspace_id::text, 0));
  if (select max(r.created_at) from public.workspace_rate_limit_raises r where r.workspace_id = p_workspace_id)
      is distinct from p_last_requested_at then
    return;
  end if;
  return query
  insert into public.workspace_rate_limit_raises as r (workspace_id, from_tier, to_tier, requested_by, expires_at)
  values (p_workspace_id, p_from_tier, p_to_tier, p_requested_by, p_expires_at)
  returning r.id, r.from_tier, r.to_tier, r.expires_at;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."request_workspace_rate_limit_raise"(uuid, text, text, uuid, timestamp with time zone, timestamp with time zone) TO "service_role";

COMMENT ON FUNCTION "public"."request_workspace_rate_limit_raise"(uuid, text, text, uuid, timestamp with time zone, timestamp with time zone) IS 'Records a self-serve rate limit raise only if p_last_requested_at is still the workspace''s newest raise (null when it has none), so concurrent requests cannot both pass the eligibility check. Returns no row when another request won.';

REVOKE ALL ON FUNCTION "public"."request_workspace_rate_limit_raise"(uuid, text, text, uuid, timestamp with time zone, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."request_workspace_rate_limit_raise"(uuid, text, text, uuid, timestamp with time zone, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."request_workspace_rate_limit_raise"(uuid, text, text, uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
