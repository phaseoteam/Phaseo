CREATE OR REPLACE FUNCTION public.consume_spend_rule_test_send (
  p_workspace_id uuid,
  p_limit        integer DEFAULT 5
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Takes one spend rule test send from the workspace's allowance for the current minute (5 by
-- default, the same on every plan): true if allowed, false once the minute's allowance is used.
-- The same fixed-window counter as public.consume_checkout_rate_limit, keyed by workspace so the
-- control API and the settings page share it.
declare
  v_accepted integer;
  v_bucket timestamptz := date_trunc('minute', now());
begin
  if p_workspace_id is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_spend_rule_test_send_limit' using errcode = '22023';
  end if;
  delete from public.workspace_spend_rule_test_sends target
  using (
    select expired.workspace_id, expired.bucket_start
    from public.workspace_spend_rule_test_sends expired
    where expired.bucket_start < now() - interval '1 day'
    order by expired.bucket_start
    limit 100
  ) old
  where target.workspace_id = old.workspace_id
    and target.bucket_start = old.bucket_start;
  insert into public.workspace_spend_rule_test_sends as sends (workspace_id, bucket_start, request_count)
  values (p_workspace_id, v_bucket, 1)
  on conflict (workspace_id, bucket_start) do update
    set request_count = sends.request_count + 1
    where sends.request_count < p_limit
  returning sends.request_count into v_accepted;
  return v_accepted is not null;
end;
$function$;

COMMENT ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) IS 'Fixed-window limiter for spend rule test sends: true while the workspace has sent fewer than p_limit (default 5) this minute. Service role only.';

REVOKE ALL ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) FROM "anon", "authenticated";
