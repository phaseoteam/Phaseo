CREATE OR REPLACE FUNCTION public.gateway_set_async_operation_status (
  p_workspace_id          uuid,
  p_kind                  text,
  p_internal_id           text,
  p_status                text                     DEFAULT NULL::text,
  p_meta_patch            jsonb                    DEFAULT '{}'::jsonb,
  p_update_next_reconcile boolean                  DEFAULT false,
  p_next_reconcile_at     timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if p_kind not in ('video', 'batch') then
    raise exception 'invalid async operation kind';
  end if;

  update public.gateway_async_operations
  set
    status = case
      when p_status is null then status
      when lower(coalesce(status, '')) in ('completed', 'failed', 'cancelled', 'canceled', 'expired') then status
      when (
        case lower(p_status)
          when 'queued' then 1 when 'pending' then 1
          when 'in_progress' then 2 when 'processing' then 2 when 'running' then 2
          when 'completed' then 3 when 'failed' then 3 when 'cancelled' then 3 when 'canceled' then 3 when 'expired' then 3
          else 0
        end
      ) < (
        case lower(coalesce(status, ''))
          when 'queued' then 1 when 'pending' then 1
          when 'in_progress' then 2 when 'processing' then 2 when 'running' then 2
          when 'completed' then 3 when 'failed' then 3 when 'cancelled' then 3 when 'canceled' then 3 when 'expired' then 3
          else 0
        end
      ) then status
      else p_status
    end,
    meta = coalesce(meta, '{}'::jsonb) || coalesce(p_meta_patch, '{}'::jsonb),
    next_reconcile_at = case
      when p_update_next_reconcile then p_next_reconcile_at
      else next_reconcile_at
    end,
    updated_at = now()
  where workspace_id = p_workspace_id
    and kind = p_kind
    and internal_id = p_internal_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_set_async_operation_status"(uuid, text, text, text, jsonb, boolean, timestamp WITH time zone) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_set_async_operation_status"(uuid, text, text, text, jsonb, boolean, timestamp with time zone) IS 'Service-role-only atomic metadata merge with monotonic async lifecycle transitions.';

REVOKE ALL ON FUNCTION "public"."gateway_set_async_operation_status"(uuid, text, text, text, jsonb, boolean, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_set_async_operation_status"(uuid, text, text, text, jsonb, boolean, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_set_async_operation_status"(uuid, text, text, text, jsonb, boolean, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
