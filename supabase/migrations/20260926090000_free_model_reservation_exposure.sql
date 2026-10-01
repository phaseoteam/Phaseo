-- A free-model overage is a single inference hold, not a batch submission.
-- Reuse the existing key limits, workspace budgets and wallet lock rather than
-- bypassing them with a keyless hold or masquerading as a video request.
-- No historical rows, balances, grants or feature flags are changed.
do $$
declare
  definition text;
  exposure_predicate constant text := $old$r.reservation_id like 'video_hold:%'$old$;
  audit_predicate constant text := $old$p_reservation_id not like 'video_hold:%'$old$;
begin
  select pg_get_functiondef(
    'public.gateway_wallet_reserve_once_without_workspace_budget(uuid,text,bigint,text,uuid,integer)'::regprocedure
  ) into definition;
  -- Fail the migration rather than silently missing a changed prerequisite.
  if (length(definition) - length(replace(definition, exposure_predicate, ''))) / length(exposure_predicate) <> 1
    or (length(definition) - length(replace(definition, audit_predicate, ''))) / length(audit_predicate) <> 1 then
    raise exception 'free_model_reservation_prerequisite_changed';
  end if;
  definition := replace(definition, exposure_predicate,
    $new$(r.reservation_id like 'video_hold:%' or r.reservation_id like 'free_model_hold:%')$new$);
  definition := replace(definition, audit_predicate,
    $new$p_reservation_id not like 'video_hold:%' and p_reservation_id not like 'free_model_hold:%'$new$);
  execute definition;
end;
$$;

-- Keep free-model holds visible to workspace budgets across window boundaries,
-- and bridge capture -> request-audit persistence without counting a fee twice.
-- Other reservation kinds retain their existing accounting contract.
do $$
declare
  definition text;
  old_sum constant text := $old$coalesce(sum(greatest(
        reservation.amount_nanos
          - coalesce(reservation.captured_nanos, 0)
          - coalesce(reservation.released_nanos, 0),
        0
      )) filter (
        where reservation.status = 'reserved'
          and (configured.window_start is null or reservation.created_at >= configured.window_start)
      ), 0)::bigint as held_nanos$old$;
  old_join constant text := $old$on reservation.workspace_id = configured.workspace_id
    group by configured.id$old$;
begin
  select pg_get_functiondef('public.gateway_workspace_budget_status(uuid,bigint)'::regprocedure) into definition;
  if strpos(definition, old_sum) = 0 or strpos(definition, old_join) = 0 then
    raise exception 'free_model_workspace_budget_prerequisite_changed';
  end if;
  definition := replace(definition, old_sum, $new$coalesce(sum(case
        when reservation.reservation_id like 'free_model_hold:%' then
          case when reservation.status in ('held', 'reserved') or
            (reservation.status = 'captured' and (configured.window_start is null or reservation.created_at >= configured.window_start))
          then greatest(0, (case when reservation.status = 'captured'
            then coalesce(reservation.settled_amount_nanos, reservation.amount_nanos)
            else reservation.amount_nanos end) - coalesce(free_audit.cost, 0))
          else 0 end
        when reservation.status = 'reserved' and
          (configured.window_start is null or reservation.created_at >= configured.window_start)
        then greatest(0, reservation.amount_nanos - coalesce(reservation.captured_nanos, 0) - coalesce(reservation.released_nanos, 0))
        else 0 end), 0)::bigint as held_nanos$new$);
  definition := replace(definition, old_join, $new$on reservation.workspace_id = configured.workspace_id
    left join lateral (
      select sum(request.cost_nanos) as cost from public.gateway_requests request
      where reservation.reservation_id like 'free_model_hold:%'
        and request.workspace_id = reservation.workspace_id
        and request.key_id = reservation.key_id
        and request.request_id = reservation.hold_ref_id and request.success is true
    ) free_audit on true
    group by configured.id$new$);
  execute definition;
end;
$$;
