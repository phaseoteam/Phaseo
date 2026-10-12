CREATE OR REPLACE FUNCTION public.prune_otel_export_outbox (
  p_limit integer DEFAULT 5000
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '10s'
  SET lock_timeout TO '500ms'
  AS $function$
declare
  v_deleted integer;
begin
  -- Delivered rows only back the (destination_id, event_id) dedupe on enqueue,
  -- so they are kept for a day. Failed rows keep their last error for a week,
  -- and rows still pending after a week are past any useful delivery window.
  with expired as (
    select id
    from public.otel_export_outbox
    where created_at < now() - interval '1 day'
      and (status = 'delivered' or created_at < now() - interval '7 days')
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5000), 5000))
  )
  delete from public.otel_export_outbox outbox
  using expired
  where outbox.id = expired.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prune_otel_export_outbox"(integer) TO "service_role";

COMMENT ON FUNCTION "public"."prune_otel_export_outbox"(integer) IS 'Deletes a bounded batch of expired Broadcast export outbox rows: delivered after one day, everything else after seven days.';

REVOKE ALL ON FUNCTION "public"."prune_otel_export_outbox"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prune_otel_export_outbox"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."prune_otel_export_outbox"(integer) FROM PUBLIC, "anon", "authenticated";
