-- The project applies default EXECUTE grants for anon/authenticated when a
-- function is created. Remove those explicit grants after creation.

revoke all on function public.gateway_wallet_settle_once(uuid, text, bigint, text)
  from public, anon, authenticated;
revoke all on function public.gateway_wallet_release_stale_orphan_batch_reservations(integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_gateway_async_webhook_delivery(uuid, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_gateway_async_webhook_delivery(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.release_gateway_async_webhook_delivery_claim(uuid, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.gateway_wallet_settle_once(uuid, text, bigint, text) to service_role;
grant execute on function public.gateway_wallet_release_stale_orphan_batch_reservations(integer, integer) to service_role;
grant execute on function public.claim_gateway_async_webhook_delivery(uuid, text, text, text, text, integer) to service_role;
grant execute on function public.complete_gateway_async_webhook_delivery(uuid, text, text, text, text) to service_role;
grant execute on function public.release_gateway_async_webhook_delivery_claim(uuid, text, text, text, text) to service_role;
