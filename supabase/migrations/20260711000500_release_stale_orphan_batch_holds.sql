-- Release batch holds that were created but never linked to a durable async
-- operation, for example when a Worker terminated between reserve and insert.

create or replace function public.gateway_wallet_release_stale_orphan_batch_reservations(
  p_older_than_seconds integer default 1800,
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_released integer := 0;
begin
  for v_reservation in
    select reservation.*
    from public.gateway_wallet_reservations reservation
    where reservation.reservation_id like 'batch_hold:%'
      and reservation.status in ('held', 'reserved')
      and reservation.created_at < now() - make_interval(secs => greatest(300, p_older_than_seconds))
      and not exists (
        select 1
        from public.gateway_async_operations operation
        where operation.workspace_id = reservation.workspace_id
          and operation.kind = 'batch'
          and (
            operation.request_id = reservation.hold_ref_id
            or operation.meta ->> 'reservationId' = reservation.reservation_id
            or operation.meta ->> 'reservation_id' = reservation.reservation_id
          )
      )
    order by reservation.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
  loop
    update public.wallets
    set reserved_nanos = greatest(0, coalesce(reserved_nanos, 0) - v_reservation.amount_nanos),
        updated_at = now()
    where workspace_id = v_reservation.workspace_id
      and coalesce(reserved_nanos, 0) >= v_reservation.amount_nanos;

    if found then
      update public.gateway_wallet_reservations
      set status = 'released',
          release_ref_id = 'stale_orphan_batch_reaper',
          released_at = now(),
          updated_at = now()
      where workspace_id = v_reservation.workspace_id
        and reservation_id = v_reservation.reservation_id;
      v_released := v_released + 1;
    end if;
  end loop;
  return v_released;
end;
$$;

revoke all on function public.gateway_wallet_release_stale_orphan_batch_reservations(integer, integer) from public, anon, authenticated;
grant execute on function public.gateway_wallet_release_stale_orphan_batch_reservations(integer, integer) to service_role;
