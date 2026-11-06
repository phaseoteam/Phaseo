CREATE OR REPLACE FUNCTION private.budget_spend_items (
  p_workspace_id        uuid,
  p_since               timestamp with time zone,
  p_key_ids             uuid[] DEFAULT NULL::uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_include_open_charges boolean DEFAULT true
)
  RETURNS TABLE (
    key_id uuid,
    at     timestamp with time zone,
    active boolean,
    nanos  bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The spend that counts toward workspace and department budgets, one row per item, shared by
  -- private.workspace_budget_status and private.department_budget_usage (and so the spend-limit
  -- seed). A budget's usage is the sum of nanos over rows that are active or at/after its period
  -- start. p_key_ids limits the rows to those keys (NULL: the whole workspace). p_since (NULL: all
  -- time) bounds the history read, written as created_at >= coalesce(...) so partitions of
  -- gateway_requests are pruned under generic plans; active holds are returned whenever they were
  -- made. p_exclude_request_ids leaves out gateway_requests rows (by public request id) the
  -- SpendLimit Durable Object is still counting from memory. p_include_open_charges false leaves
  -- out open stepped charges, which gateway_spend_limit_seed hands to the Durable Object by billing
  -- request id instead.
  --
  -- * Requests: every gateway_requests row with a positive cost, whether or not it succeeded (a
  --   cancelled or failed request can still be charged), read as two disjoint parts so each uses
  --   its partial index, except excluded request ids and the batch_hold_usage rows of a hold that
  --   is still active, which the hold itself counts.
  -- * Active holds (held or reserved), in every period until they end: video and free-model
  --   holds less the cost already audited for them, other holds (batch, realtime) less what was
  --   captured or released. Realtime holds carry no key; their session does.
  -- * Captured video and free-model holds made in the period, less the cost audited for them, so
  --   a capture counts before (or without) its request row and once after it lands.
  -- * Open stepped stream charges (private.open_stepped_charges): active from the charge's
  --   created_at in every period until the request row lands, which then counts instead;
  --   attributed to the charge's key when it has one (keyless charges count toward workspace
  --   budgets only).
  --
  -- Holds and request rows are matched by workspace and ids; their keys are compared null-safely
  -- because deleting a key sets both key_id columns to NULL (ON DELETE SET NULL).
  select request.key_id, request.created_at, false, request.cost_nanos
  from public.gateway_requests request
  where request.workspace_id = p_workspace_id
    and (p_key_ids is null or request.key_id = any (p_key_ids))
    and request.success is true
    and request.cost_nanos > 0
    and request.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and not (request.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
    and not (request.request_id like 'batch_hold_usage:%' and exists (
      select 1 from public.gateway_wallet_reservations hold
      where hold.workspace_id = request.workspace_id
        and hold.key_id is not distinct from request.key_id
        and hold.status in ('held', 'reserved')
        and starts_with(request.request_id, 'batch_hold_usage:' || hold.reservation_id || ':')
    ))
  union all
  -- Charged requests that did not succeed (gateway_requests_charged_unsuccessful_cost_idx).
  select request.key_id, request.created_at, false, request.cost_nanos
  from public.gateway_requests request
  where request.workspace_id = p_workspace_id
    and (p_key_ids is null or request.key_id = any (p_key_ids))
    and request.success is not true
    and request.cost_nanos > 0
    and request.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and not (request.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
  union all
  select coalesce(reservation.key_id, session.key_id), reservation.created_at,
    reservation.status in ('held', 'reserved'),
    case
      when reservation.reservation_id like 'video_hold:%' or reservation.reservation_id like 'free_model_hold:%' then
        greatest(0, (case when reservation.status = 'captured'
          then coalesce(reservation.settled_amount_nanos, reservation.amount_nanos)
          else reservation.amount_nanos end) - coalesce(audit.cost, 0))
      else greatest(0, reservation.amount_nanos - coalesce(reservation.captured_nanos, 0) - coalesce(reservation.released_nanos, 0))
    end
  from public.gateway_wallet_reservations reservation
  left join public.gateway_realtime_sessions session
    on reservation.key_id is null
    and session.workspace_id = reservation.workspace_id
    and session.session_id = reservation.hold_ref_id
  left join lateral (
    select sum(request.cost_nanos) as cost
    from public.gateway_requests request
    where (reservation.reservation_id like 'video_hold:%' or reservation.reservation_id like 'free_model_hold:%')
      and request.workspace_id = reservation.workspace_id
      and request.key_id is not distinct from reservation.key_id
      and request.request_id = reservation.hold_ref_id
      and coalesce(request.cost_nanos, 0) > 0
      and (reservation.reservation_id not like 'free_model_hold:%'
        or request.detail_metadata->>'free_model_fee_request_id' = substr(reservation.reservation_id, 17))
  ) audit on true
  where reservation.workspace_id = p_workspace_id
    and (p_key_ids is null or coalesce(reservation.key_id, session.key_id) = any (p_key_ids))
    and (reservation.status in ('held', 'reserved')
      or (reservation.status = 'captured'
        and (reservation.reservation_id like 'video_hold:%' or reservation.reservation_id like 'free_model_hold:%')
        and reservation.created_at >= coalesce(p_since, '-infinity'::timestamptz)))
  union all
  select charge.key_id, charge.created_at, true, charge.cost_nanos
  from private.open_stepped_charges(p_workspace_id) charge
  where coalesce(p_include_open_charges, true)
    and (p_key_ids is null or charge.key_id = any (p_key_ids));
$function$;

COMMENT ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], boolean) IS 'Spend items counted toward workspace and department budgets: positive-cost requests, active holds in every period, captured video and free-model holds less their audited cost (each hold''s batch_hold_usage rows counted once), and applied stepped stream charges whose request row has not landed (attributed to the charge''s key when it has one).';

REVOKE ALL ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], boolean) TO "postgres";
