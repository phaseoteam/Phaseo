-- Supabase grants function execution to API roles through default privileges.
-- Realtime wallet lifecycle RPCs are server-owned and must remain service-only.

begin;

revoke all on function public.gateway_realtime_create_with_hold(
  uuid, text, uuid, text, text, text, text, text, text, timestamptz,
  text, text, bigint, text, jsonb, integer, integer, integer, integer
) from public, anon, authenticated;

revoke all on function public.gateway_realtime_claim_connection(text, text)
  from public, anon, authenticated;

revoke all on function public.gateway_realtime_extend_hold_once(
  uuid, text, text, bigint, bigint
) from public, anon, authenticated;

revoke all on function public.gateway_realtime_mark_billing_unresolved(
  uuid, text, jsonb, text
) from public, anon, authenticated;

revoke all on function public.gateway_realtime_settle_once(
  uuid, text, bigint, jsonb, jsonb, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.gateway_realtime_create_with_hold(
  uuid, text, uuid, text, text, text, text, text, text, timestamptz,
  text, text, bigint, text, jsonb, integer, integer, integer, integer
) to service_role;

grant execute on function public.gateway_realtime_claim_connection(text, text)
  to service_role;

grant execute on function public.gateway_realtime_extend_hold_once(
  uuid, text, text, bigint, bigint
) to service_role;

grant execute on function public.gateway_realtime_mark_billing_unresolved(
  uuid, text, jsonb, text
) to service_role;

grant execute on function public.gateway_realtime_settle_once(
  uuid, text, bigint, jsonb, jsonb, text, text, text, text
) to service_role;

commit;

