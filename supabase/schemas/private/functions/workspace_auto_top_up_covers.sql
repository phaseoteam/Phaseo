CREATE OR REPLACE FUNCTION private.workspace_auto_top_up_covers (
  p_workspace_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Whether the workspace's auto top-up is on and working, so a low balance refills by itself and
  -- a drop is recorded without an alert. The one test the low-balance push sweep
  -- (sweep_low_balance_pushes), the low-balance email sweep (sweep_low_balance_emails) and
  -- balance spend rules (evaluate_workspace_spend_rules) share, so they agree.
  -- Working means: enabled with at least $1 to add (smaller amounts are skipped without an alert),
  -- a trigger above $0 (a $0 trigger never fires), failure alerts on (a failed top-up has its own
  -- email and push), and no failed top-up since the last card payment. No wallet: false.
  select coalesce((
    select w.auto_top_up_enabled
      and w.auto_top_up_amount >= 1000000000
      and w.low_balance_threshold > 0
      and s.auto_top_up_failure_email_enabled is distinct from false
      and not exists (
        select 1
        from (
          select f.occurred_at
          from public.workspace_notification_events f
          where f.workspace_id = w.workspace_id and f.kind = 'auto_top_up_failed'
          order by f.occurred_at desc
          limit 1
        ) failed
        where not exists (
          select 1
          from public.credit_ledger l
          where l.workspace_id = w.workspace_id
            and l.ref_type = 'Stripe_Payment_Intent'
            and l.amount_nanos > 0
            and l.created_at > failed.occurred_at
        )
      )
    from public.wallets w
    left join public.workspace_settings s on s.workspace_id = w.workspace_id
    where w.workspace_id = p_workspace_id
  ), false);
$function$;

COMMENT ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) IS 'True while the workspace''s auto top-up is on and working (enabled, at least $1 to add, a trigger above $0, failure alerts on, no failed top-up since the last card payment). Low-balance pushes, low-balance emails and balance spend rules record a drop without alerting while it is.';

REVOKE ALL ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) TO "service_role";
