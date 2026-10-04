CREATE OR REPLACE FUNCTION public.gateway_claim_batch_file_upload (
  p_workspace_id uuid,
  p_upload_id    text,
  p_bytes        bigint
)
  RETURNS TABLE (
    ok     boolean,
    reason text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_hour_count bigint;
  v_day_bytes bigint;
begin
  if p_workspace_id is null or coalesce(trim(p_upload_id), '') = '' or p_bytes is null or p_bytes <= 0 then
    raise exception 'invalid_batch_file_upload_claim';
  end if;
  if p_bytes > 20971520 then
    return query select false, 'batch_file_too_large'::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('batch-file:' || p_workspace_id::text, 0));
  if not exists (
    select 1 from public.wallets
    where workspace_id = p_workspace_id
      and coalesce(balance_nanos, 0) - coalesce(reserved_nanos, 0) > 0
  ) then
    return query select false, 'insufficient_funds'::text;
    return;
  end if;
  select count(*) into v_hour_count
  from public.gateway_batch_file_uploads
  where workspace_id = p_workspace_id and created_at >= now() - interval '1 hour';
  if v_hour_count >= 20 then
    return query select false, 'batch_file_hourly_quota_exceeded'::text;
    return;
  end if;
  select coalesce(sum(bytes), 0) into v_day_bytes
  from public.gateway_batch_file_uploads
  where workspace_id = p_workspace_id and created_at >= now() - interval '24 hours';
  if v_day_bytes + p_bytes > 104857600 then
    return query select false, 'batch_file_daily_bytes_exceeded'::text;
    return;
  end if;
  insert into public.gateway_batch_file_uploads (workspace_id, upload_id, bytes, status)
  values (p_workspace_id, p_upload_id, p_bytes, 'claimed')
  on conflict (workspace_id, upload_id) do nothing;
  if not found then
    return query select false, 'batch_file_upload_already_claimed'::text;
    return;
  end if;
  return query select true, null::text;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_claim_batch_file_upload"(uuid, text, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_claim_batch_file_upload"(uuid, text, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_claim_batch_file_upload"(uuid, text, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_claim_batch_file_upload"(uuid, text, bigint) FROM PUBLIC, "anon", "authenticated";
