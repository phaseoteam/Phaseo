CREATE OR REPLACE FUNCTION public.consume_checkout_rate_limit (
  p_workspace_id uuid,
  p_user_id      uuid,
  p_limit        integer DEFAULT 10
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  accepted integer;
  bucket timestamptz := date_trunc('minute', now());
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_checkout_rate_limit';
  end if;
  delete from public.checkout_rate_limits target
  using (
    select workspace_id, user_id, bucket_start
    from public.checkout_rate_limits
    where bucket_start < now() - interval '1 day'
    order by bucket_start
    limit 100
  ) expired
  where target.workspace_id = expired.workspace_id
    and target.user_id = expired.user_id
    and target.bucket_start = expired.bucket_start;
  insert into public.checkout_rate_limits (workspace_id, user_id, bucket_start, request_count)
  values (p_workspace_id, p_user_id, bucket, 1)
  on conflict (workspace_id, user_id, bucket_start) do update
    set request_count = public.checkout_rate_limits.request_count + 1
    where public.checkout_rate_limits.request_count < p_limit
  returning request_count into accepted;
  return accepted is not null;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."consume_checkout_rate_limit"(uuid, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."consume_checkout_rate_limit"(uuid, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_checkout_rate_limit"(uuid, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."consume_checkout_rate_limit"(uuid, uuid, integer) FROM PUBLIC, "anon", "authenticated";
