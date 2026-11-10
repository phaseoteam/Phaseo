SET LOCAL lock_timeout = '10s';

-- Functions only: no table is locked here.
--
-- Realtime session spend counts when its money moved. Budgets, key limits and spend guardrails
-- counted a session through its summary gateway_requests row, which is dated when the session
-- started, so a session that crossed a UTC day, week or month boundary counted wholly in the
-- earlier period and the new period missed it. private.unbilled_spend now counts each
-- realtime_session ledger debit at its time, plus what the summary row's cost exceeds the
-- session's captured debits by (its uncollected part) when the session ended; the request
-- readers leave the summary row's cost out, and key limits still count it as one request.

CREATE OR REPLACE FUNCTION private.unbilled_spend (
  p_workspace_id        uuid,
  p_since               timestamp with time zone,
  p_key_ids             uuid[] DEFAULT NULL::uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_exclude_charge_ids  text[] DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    kind               text,
    billing_request_id text,
    key_id             uuid,
    at                 timestamp with time zone,
    nanos              bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Spend that budgets and key caps count from money movements rather than from a request row's
  -- cost, one row per movement, by billing request id. p_key_ids limits the rows to those keys
  -- (NULL: the whole workspace); p_since (NULL: all time) is the earliest window the caller counts.
  --
  -- Money movements win: a request's spend is its movements, each at its own time, and its audit
  -- cost_nanos only when it has none. The request readers (private.budget_spend_items,
  -- private.key_spend_items) leave out the cost of the rows these movements replace:
  --   (a) a request charged in steps (adjustment ledger rows from gateway_charge_request_total);
  --   (b) a row pending reconciliation whose gateway_request_charges row was applied. Pending:
  --       expected_cost_nanos is set, or, for a row written before the deploy's marker
  --       (private.pending_json_cutoff(), set when this release's migrations ran, plus the time
  --       old Workers take to drain), detail_metadata.accounting_finalization.billing_status is
  --       'pending_reconciliation'. Older gateway code flagged pending rows only in that JSON; the
  --       gateway now always sets expected_cost_nanos on them. The marker is read once per
  --       statement, and created_at is compared before the JSON, so newer rows never read
  --       detail_metadata.
  --   (c) a batch's batch_usage rows once the batch is debited, and its batch_hold_usage
  --       placeholders once its hold has settled.
  --   (d) a realtime session's summary row (gateway_requests.realtime_session_id), always.
  --
  -- The SpendLimit Durable Object counts an admission it still holds from memory and lists both
  -- its ids: p_exclude_charge_ids leaves out charge rows by billing request id
  -- (gateway_request_charges.request_id), p_exclude_request_ids request rows by request id.
  -- Unmatched charges before 2026-11-04 00:00 UTC are left out: request rows recorded
  -- billing_request_id only from 2026-11-03 14:43 UTC, so an older charge's request row cannot be
  -- matched and already counts. A charge matched by billing id counts at any date: for a pending
  -- audit row the request readers leave that row's cost out (rule b), so the charge is its only
  -- count; for failure rows that under-record it (below), only the shortfall counts.
  --
  -- A charge is attributed to gateway_request_charges.key_id, or, when that is NULL (charges written
  -- before the column, and by older gateway code during a deploy, which does not pass p_key_id), to
  -- the key on its request row (by billing request id) or, for a batch capture, to the batch job's
  -- meta.apiKeyId (gateway_async_operations). A charge with no key anywhere counts toward the
  -- workspace only. The stepped and batch lookups run only for a charge without a key.
  --
  -- * 'stepped': every adjustment ledger row of a request charged in steps (rule a), debits and
  --   refunds, at its time.
  -- * 'charge': a one-off charge (no adjustment rows) at its time: whole while its request row has
  --   not landed or one is pending reconciliation (rule b); otherwise, when none of its rows
  --   succeeded, what its rows' cost (which the request readers count) falls short of it. A Worker
  --   older than the lost-charge fix wrote a failure after a confirmed debit with no cost, and
  --   that stored row would otherwise hide the debit. Its rows are read once per charge, by
  --   #3633's (workspace_id, billing_request_id) index, including held ones, whose cost the
  --   coordinator counts from memory.
  -- * 'batch': a batch's debit, whole, at its time (rule c): a batch_capture:<batch> charge, or a
  --   reserved batch's async_job_charge ledger row (gateway_wallet_settle_once).
  -- * 'video': a reserved video's async_job_charge debit, whole, at its time (settled or captured
  --   from its video_hold reservation): its captured hold and its audit row's cost stop counting,
  --   so the spend is dated when the money moved, not when the video was submitted.
  -- Batch and video debits are matched by batch or reservation id, not billing id, so the
  -- 2026-11-04 cut-off for charge rows does not apply to them.
  -- * 'realtime': a realtime session's realtime_session ledger debits, each at its time (the
  --   confirmed part captured at billing review, <session>:confirmed:<n>, and the charge at
  --   settlement), to the session's key; and, when the session ended (settlement sets ended_at),
  --   what its summary row's cost (the full priced cost, any uncollected part included) exceeds the
  --   session's captured_nanos, the sum of those debits. The summary row is dated when the session
  --   started, so counting it whole put a session that crossed a period boundary in the earlier
  --   period. The request readers leave its cost out (rule d), so a session counts
  --   greatest(summary cost, debits), once. While a session runs its holds count instead
  --   (private.budget_spend_items). The summary row is found by its unique
  --   (realtime_session_id, created_at) index.
  -- * 'unpaid': what a delivered request with an expected bill (expected_cost_nanos) has not had
  --   counted yet, per billing request id, at the time of its row with the largest expected
  --   amount: greatest(max(expected_cost_nanos) - counted, 0). Counted is its applied charge (one-off
  --   or stepped total) when it has one, whose rows the request readers then leave out (rule b);
  --   otherwise its rows' own cost, which they count. So a delivered request whose charge never
  --   applied still counts its expected bill, the audit cost is never counted twice, and a bill of 0
  --   counts 0. Rows without a billing request id stand alone, by request id.
  select 'stepped'::text, charge.request_id, coalesce(charge.key_id, audited.key_id), movement.created_at, -movement.amount_nanos
  from public.credit_ledger movement
  join public.gateway_request_charges charge
    on charge.workspace_id = movement.workspace_id
    and charge.request_id = movement.source_ref_id
  left join lateral (
    select request.key_id
    from public.gateway_requests request
    where charge.key_id is null
      and request.workspace_id = charge.workspace_id
      and request.billing_request_id = charge.request_id
      and request.key_id is not null
    limit 1
  ) audited on true
  where movement.workspace_id = p_workspace_id
    and movement.ref_type = 'gateway_request_charge'
    and movement.source_ref_type = 'gateway_request'
    and movement.status = 'applied'
    and movement.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and (p_key_ids is null or coalesce(charge.key_id, audited.key_id) = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select 'charge'::text, charge.request_id, coalesce(charge.key_id, audit.key_id), charge.created_at,
    case when audit.found and not audit.pending then charge.cost_nanos - audit.row_cost else charge.cost_nanos end
  from public.gateway_request_charges charge
  left join lateral (
    select count(*) > 0 as found,
      coalesce(bool_or(request.success is true), false) as succeeded,
      coalesce(bool_or(request.expected_cost_nanos is not null
        or (request.created_at < (select private.pending_json_cutoff())
            and coalesce(request.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false))), false) as pending,
      coalesce(sum(greatest(coalesce(request.cost_nanos, 0), 0)), 0) as row_cost,
      (array_agg(request.key_id) filter (where request.key_id is not null))[1] as key_id
    from public.gateway_requests request
    where request.workspace_id = charge.workspace_id
      and request.billing_request_id = charge.request_id
  ) audit on true
  left join lateral (
    select 1 as found
    from public.credit_ledger movement
    where movement.source_ref_type = 'gateway_request'
      and movement.source_ref_id = charge.request_id
      and movement.workspace_id = charge.workspace_id
      and movement.ref_type = 'gateway_request_charge'
    limit 1
  ) stepped on true
  where charge.workspace_id = p_workspace_id
    and charge.status = 'applied'
    and charge.cost_nanos > 0
    and charge.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and (charge.created_at >= '2026-11-04 00:00:00+00'::timestamptz or audit.found)
    and not starts_with(charge.request_id, 'batch_capture:')
    and (not audit.found or audit.pending or (not audit.succeeded and charge.cost_nanos > audit.row_cost))
    and stepped.found is null
    and (p_key_ids is null or coalesce(charge.key_id, audit.key_id) = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select 'batch'::text, charge.request_id, coalesce(charge.key_id, job.key_id), charge.created_at, charge.cost_nanos
  from public.gateway_request_charges charge
  left join lateral (
    select case when job.meta ->> 'apiKeyId' ~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
      then (job.meta ->> 'apiKeyId')::uuid end as key_id
    from public.gateway_async_operations job
    where charge.key_id is null
      and job.workspace_id = charge.workspace_id
      and job.kind = 'batch'
      and job.internal_id = substr(charge.request_id, 15)
    limit 1
  ) job on true
  where charge.workspace_id = p_workspace_id
    and starts_with(charge.request_id, 'batch_capture:')
    and charge.status = 'applied'
    and charge.cost_nanos > 0
    and charge.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and (p_key_ids is null or coalesce(charge.key_id, job.key_id) = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select case when starts_with(debit.ref_id, p_workspace_id::text || ':video_hold:') then 'video' else 'batch' end,
    debit.ref_id, hold.key_id, debit.created_at, -debit.amount_nanos
  from public.credit_ledger debit
  join public.gateway_wallet_reservations hold
    on hold.workspace_id = debit.workspace_id
    and hold.reservation_id = substr(debit.ref_id, length(debit.workspace_id::text) + 2)
  where debit.workspace_id = p_workspace_id
    and debit.ref_type = 'async_job_charge'
    and (starts_with(debit.ref_id, p_workspace_id::text || ':batch_hold:')
      or starts_with(debit.ref_id, p_workspace_id::text || ':video_hold:'))
    and debit.amount_nanos < 0
    and debit.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and (p_key_ids is null or hold.key_id = any (p_key_ids))
  union all
  select 'realtime'::text, debit.ref_id, session.key_id, debit.created_at, -debit.amount_nanos
  from public.credit_ledger debit
  left join public.gateway_realtime_sessions session
    on session.session_id = case when strpos(debit.ref_id, ':confirmed:') > 0
      then left(debit.ref_id, strpos(debit.ref_id, ':confirmed:') - 1) else debit.ref_id end
  where debit.workspace_id = p_workspace_id
    and debit.ref_type = 'realtime_session'
    and debit.amount_nanos < 0
    and debit.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and (p_key_ids is null or session.key_id = any (p_key_ids))
  union all
  select 'realtime'::text, session.session_id, coalesce(summary.key_id, session.key_id),
    coalesce(session.ended_at, session.started_at), summary.cost_nanos - coalesce(session.captured_nanos, 0)
  from public.gateway_realtime_sessions session
  join public.gateway_requests summary
    on summary.realtime_session_id = session.session_id
    and summary.created_at = session.started_at
  where session.workspace_id = p_workspace_id
    and coalesce(session.ended_at, session.started_at) >= coalesce(p_since, '-infinity'::timestamptz)
    and summary.workspace_id = p_workspace_id
    and summary.cost_nanos > coalesce(session.captured_nanos, 0)
    and (p_key_ids is null or coalesce(summary.key_id, session.key_id) = any (p_key_ids))
  union all
  select 'unpaid'::text, owed.billing_request_id, owed.key_id, owed.at, owed.nanos
  from (
    select pending.billing_request_id, pending.key_id, pending.at,
      pending.expected - coalesce(charge.cost_nanos, pending.row_cost) as nanos
    from (
      select coalesce(request.billing_request_id, request.request_id) as billing_request_id,
        bool_or(request.billing_request_id is not null) as has_billing_id,
        (array_agg(request.key_id order by request.expected_cost_nanos desc, request.created_at))[1] as key_id,
        (array_agg(request.created_at order by request.expected_cost_nanos desc, request.created_at))[1] as at,
        max(request.expected_cost_nanos) as expected,
        sum(greatest(coalesce(request.cost_nanos, 0), 0)) as row_cost
      from public.gateway_requests request
      where request.workspace_id = p_workspace_id
        and request.expected_cost_nanos is not null
        and (p_key_ids is null or request.key_id = any (p_key_ids))
        and request.created_at >= coalesce(p_since, '-infinity'::timestamptz)
        and not (request.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
      group by coalesce(request.billing_request_id, request.request_id)
    ) pending
    left join public.gateway_request_charges charge
      on pending.has_billing_id
      and charge.workspace_id = p_workspace_id
      and charge.request_id = pending.billing_request_id
      and charge.status = 'applied'
  ) owed
  where owed.nanos > 0;
$function$;

COMMENT ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) IS 'Spend counted toward budgets and key caps from money movements, each at its time: adjustment ledger rows of requests charged in steps, one-off charges whose request row has not landed or is pending reconciliation (or what failure rows that under-record a charge fall short of it), batch debits, realtime session debits (and what a session''s summary cost exceeds them by, at the summary row''s time), and what a delivered request with an expected bill has not had counted (its applied charge, or else the cost of its own rows). Charge rows the SpendLimit Durable Object holds are excluded by billing request id, request rows by request id.';

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "postgres";

-- private.gateway_context_access runs as its caller (service_role, through
-- gateway_fetch_request_context_bundle) and reads this.
GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "service_role";

CREATE OR REPLACE FUNCTION private.key_spend_items (
  p_workspace_id        uuid,
  p_since               timestamp with time zone,
  p_key_ids             uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_exclude_charge_ids  text[] DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    key_id uuid,
    at     timestamp with time zone,
    served boolean,
    nanos  bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- What API key limits count for p_key_ids since p_since (NULL: all time), one row per item: the
  -- one key usage calculation behind both request-context key checks, hold admission, the
  -- spend-limit seed and the 80% warnings. Request limits count served rows; cost limits sum nanos.
  -- The SpendLimit Durable Object lists the ids of admissions it holds (see private.unbilled_spend).
  --
  -- * Successful requests: a request each, and their cost unless money movements replace it.
  -- * Charged requests that did not succeed: cost only, unless movements replace it.
  -- Movements replace a row charged in steps, a row pending reconciliation with an applied charge,
  -- a debited batch's batch_usage rows, a settled hold's placeholders and a realtime session's
  -- summary row, which still counts as its request (private.unbilled_spend).
  -- * Money movements (private.unbilled_spend), cost only, each at its time.
  -- The replacement checks are the same as private.budget_spend_items', per row through index
  -- lookups.
  select served.key_id, served.created_at, true,
    case when (served.billing_request_id is not null and (
        exists (
          select 1 from public.credit_ledger movement
          where movement.source_ref_type = 'gateway_request'
            and movement.source_ref_id = served.billing_request_id
            and movement.workspace_id = served.workspace_id
            and movement.ref_type = 'gateway_request_charge')
        or ((served.expected_cost_nanos is not null
            or (served.created_at < (select private.pending_json_cutoff())
            and coalesce(served.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false)))
          and exists (
            select 1 from public.gateway_request_charges charge
            where charge.workspace_id = served.workspace_id
              and charge.request_id = served.billing_request_id
              and charge.status = 'applied'))))
      or (starts_with(served.request_id, 'batch_usage:') and (
        exists (
          select 1 from public.gateway_request_charges capture
          where capture.workspace_id = served.workspace_id
            and capture.request_id = 'batch_capture:' || split_part(served.request_id, ':', 2)
            and capture.status = 'applied')
        or exists (
          select 1 from public.credit_ledger debit
          where debit.source_ref_type = 'async_job'
            and debit.source_ref_id = split_part(served.request_id, ':', 2)
            and debit.workspace_id = served.workspace_id
            and debit.ref_type = 'async_job_charge')))
      or (served.endpoint = 'video.generation' and exists (
        select 1 from public.credit_ledger debit
        where debit.ref_type = 'async_job_charge'
          and debit.ref_id = served.workspace_id::text || ':video_hold:' || served.request_id))
      or (starts_with(served.request_id, 'batch_hold_usage:') and exists (
        select 1 from public.gateway_wallet_reservations hold
        where hold.workspace_id = served.workspace_id
          and hold.reservation_id = regexp_replace(substr(served.request_id, 18), ':[^:]*$', '')
          and hold.status not in ('held', 'reserved')))
      -- A realtime session's summary row: its debits count, each at its time.
      or served.realtime_session_id is not null
    then 0 else coalesce(served.cost_nanos, 0) end
  from public.gateway_requests served
  where served.key_id = any (p_key_ids)
    and served.workspace_id = p_workspace_id
    and served.success is true
    and served.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and not (served.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
  union all
  select charged.key_id, charged.created_at, false, charged.cost_nanos
  from public.gateway_requests charged
  where charged.workspace_id = p_workspace_id
    and charged.key_id = any (p_key_ids)
    and charged.success is not true
    and charged.cost_nanos > 0
    and charged.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and not (charged.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
    and charged.realtime_session_id is null
    and not (charged.endpoint = 'video.generation' and exists (
        select 1 from public.credit_ledger debit
        where debit.ref_type = 'async_job_charge'
          and debit.ref_id = charged.workspace_id::text || ':video_hold:' || charged.request_id))
    and not (charged.billing_request_id is not null and (
      exists (
        select 1 from public.credit_ledger movement
        where movement.source_ref_type = 'gateway_request'
          and movement.source_ref_id = charged.billing_request_id
          and movement.workspace_id = charged.workspace_id
          and movement.ref_type = 'gateway_request_charge')
      or ((charged.expected_cost_nanos is not null
          or (charged.created_at < (select private.pending_json_cutoff())
            and coalesce(charged.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false)))
        and exists (
          select 1 from public.gateway_request_charges charge
          where charge.workspace_id = charged.workspace_id
            and charge.request_id = charged.billing_request_id
            and charge.status = 'applied'))))
  union all
  select unbilled.key_id, unbilled.at, false, unbilled.nanos
  from private.unbilled_spend(p_workspace_id, p_since, p_key_ids, p_exclude_request_ids, p_exclude_charge_ids) unbilled;
$function$;

COMMENT ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) IS 'What API key limits count: successful requests (a request each, and their cost unless money movements replace it), charged requests that did not succeed (cost only, unless replaced), and private.unbilled_spend (money movements, each at its time). Shared by the request-context key checks, hold admission, the spend-limit seed and the 80% warnings.';

REVOKE ALL ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "postgres";

-- private.gateway_context_access runs as its caller (service_role, through
-- gateway_fetch_request_context_bundle) and reads this.
GRANT EXECUTE ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "service_role";

CREATE OR REPLACE FUNCTION private.budget_spend_items (
  p_workspace_id        uuid,
  p_since               timestamp with time zone,
  p_key_ids             uuid[] DEFAULT NULL::uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_exclude_charge_ids  text[] DEFAULT '{}'::text[]
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
  -- gateway_workspace_budget_status and private.department_budget_usage (and so the spend-limit
  -- seed). A budget's usage is the sum of nanos over rows that are active or at/after its period
  -- start. p_key_ids limits the rows to those keys (NULL: the whole workspace). p_since (NULL: all
  -- time) bounds the history read, written as created_at >= coalesce(...) so partitions of
  -- gateway_requests are pruned under generic plans; active holds are returned whenever they were
  -- made. The SpendLimit Durable Object counts an admission it holds from memory and lists both
  -- its ids: p_exclude_request_ids leaves out request rows by request id, p_exclude_charge_ids
  -- charge rows by billing request id.
  --
  -- * Requests: every gateway_requests row with a positive cost, whether or not it succeeded (a
  --   cancelled or failed request can still be charged), read as two disjoint parts so each uses
  --   its partial index, except excluded request ids, the batch_hold_usage rows of a hold that
  --   is still active, which the hold itself counts, and rows whose money movements replace them
  --   (private.unbilled_spend counts the movements): a request charged in steps, a failure row
  --   pending reconciliation whose charge was applied, a debited batch's batch_usage rows, a
  --   settled hold's placeholders and a realtime session's summary row. Each is decided per row with index lookups
  --   (credit_ledger_source_ref_idx, the gateway_request_charges and reservation primary keys),
  --   with no assumption about when the row landed.
  -- * Active holds (held or reserved), in every period until they end: video and free-model
  --   holds less the cost already audited for them, other holds (batch, realtime) less what was
  --   captured or released. Realtime holds carry no key; their session does.
  -- * Captured video and free-model holds made in the period, less the cost audited for them, so
  --   a capture counts before (or without) its request row and once after it lands.
  -- * Money movements (private.unbilled_spend), each at its time: stepped charges, one-off charges
  --   whose request row has not landed or is pending reconciliation, batch debits, and the
  --   uncollected part of delivered requests pending reconciliation.
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
    -- A realtime session's summary row: its debits count, each at its time (private.unbilled_spend).
    and request.realtime_session_id is null
    and not (request.request_id like 'batch_hold_usage:%' and exists (
      select 1 from public.gateway_wallet_reservations hold
      where hold.workspace_id = request.workspace_id
        and hold.key_id is not distinct from request.key_id
        and hold.status in ('held', 'reserved')
        and starts_with(request.request_id, 'batch_hold_usage:' || hold.reservation_id || ':')
    ))
    -- Charged in steps, or pending reconciliation with an applied charge.
    and not (request.billing_request_id is not null and (
      exists (
        select 1 from public.credit_ledger movement
        where movement.source_ref_type = 'gateway_request'
          and movement.source_ref_id = request.billing_request_id
          and movement.workspace_id = request.workspace_id
          and movement.ref_type = 'gateway_request_charge')
      or ((request.expected_cost_nanos is not null
          or (request.created_at < (select private.pending_json_cutoff())
            and coalesce(request.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false)))
        and exists (
          select 1 from public.gateway_request_charges charge
          where charge.workspace_id = request.workspace_id
            and charge.request_id = request.billing_request_id
            and charge.status = 'applied'))))
    -- A debited batch's rows.
    and not (starts_with(request.request_id, 'batch_usage:') and (
      exists (
        select 1 from public.gateway_request_charges capture
        where capture.workspace_id = request.workspace_id
          and capture.request_id = 'batch_capture:' || split_part(request.request_id, ':', 2)
          and capture.status = 'applied')
      or exists (
        select 1 from public.credit_ledger debit
        where debit.source_ref_type = 'async_job'
          and debit.source_ref_id = split_part(request.request_id, ':', 2)
          and debit.workspace_id = request.workspace_id
          and debit.ref_type = 'async_job_charge')))
    -- A debited video's audit row (its debit counts, at its time).
    and not (request.endpoint = 'video.generation' and exists (
        select 1 from public.credit_ledger debit
        where debit.ref_type = 'async_job_charge'
          and debit.ref_id = request.workspace_id::text || ':video_hold:' || request.request_id))
    -- A settled hold's placeholders (batch_hold_usage:<reservation>:<n>).
    and not (starts_with(request.request_id, 'batch_hold_usage:') and exists (
      select 1 from public.gateway_wallet_reservations hold
      where hold.workspace_id = request.workspace_id
        and hold.reservation_id = regexp_replace(substr(request.request_id, 18), ':[^:]*$', '')
        and hold.status not in ('held', 'reserved')))
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
    and request.realtime_session_id is null
    -- A debited video's audit row.
    and not (request.endpoint = 'video.generation' and exists (
        select 1 from public.credit_ledger debit
        where debit.ref_type = 'async_job_charge'
          and debit.ref_id = request.workspace_id::text || ':video_hold:' || request.request_id))
    -- Charged in steps, or pending reconciliation with an applied charge.
    and not (request.billing_request_id is not null and (
      exists (
        select 1 from public.credit_ledger movement
        where movement.source_ref_type = 'gateway_request'
          and movement.source_ref_id = request.billing_request_id
          and movement.workspace_id = request.workspace_id
          and movement.ref_type = 'gateway_request_charge')
      or ((request.expected_cost_nanos is not null
          or (request.created_at < (select private.pending_json_cutoff())
            and coalesce(request.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false)))
        and exists (
          select 1 from public.gateway_request_charges charge
          where charge.workspace_id = request.workspace_id
            and charge.request_id = request.billing_request_id
            and charge.status = 'applied'))))
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
        and reservation.created_at >= coalesce(p_since, '-infinity'::timestamptz)
        -- A video hold whose debit is recorded counts through the debit (private.unbilled_spend).
        and not exists (
          select 1 from public.credit_ledger debit
          where debit.ref_type = 'async_job_charge'
            and debit.ref_id = reservation.workspace_id::text || ':' || reservation.reservation_id)))
  union all
  select unbilled.key_id, unbilled.at, false, unbilled.nanos
  from private.unbilled_spend(p_workspace_id, p_since, p_key_ids, p_exclude_request_ids, p_exclude_charge_ids) unbilled;
$function$;

COMMENT ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) IS 'Spend items counted toward workspace and department budgets: positive-cost requests except those whose money movements replace them, active holds in every period, captured video and free-model holds less their audited cost (each hold''s batch_hold_usage rows counted once), and private.unbilled_spend (money movements, each at its time).';

REVOKE ALL ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "postgres";
