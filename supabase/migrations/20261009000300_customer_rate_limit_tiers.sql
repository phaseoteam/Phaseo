SET local check_function_bodies = off;

-- Trust-ladder inputs for customer rate limits (see apps/api/src/core/customer-rate-limit-ladder.ts).

CREATE TABLE "public"."workspace_rate_limit_overrides" (
  "workspace_id"          uuid                     NOT NULL,
  "requests_per_minute"   integer,
  "free_requests_per_day" integer,
  "reason"                text,
  "set_by"                uuid,
  "expires_at"            timestamp with time zone,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_rate_limit_overrides_free_requests_per_day_check" CHECK (((free_requests_per_day IS NULL) OR (free_requests_per_day > 0))),
  CONSTRAINT "workspace_rate_limit_overrides_limit_present_check" CHECK (((requests_per_minute IS NOT NULL) OR (free_requests_per_day IS NOT NULL))),
  CONSTRAINT "workspace_rate_limit_overrides_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "workspace_rate_limit_overrides_requests_per_minute_check" CHECK (((requests_per_minute IS NULL) OR (requests_per_minute > 0))),
  CONSTRAINT "workspace_rate_limit_overrides_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_rate_limit_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER workspace_rate_limit_overrides_set_updated_at
  BEFORE UPDATE ON public.workspace_rate_limit_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_rate_limit_overrides"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_rate_limit_overrides" IS 'Operator-managed customer rate limits. An unexpired row always wins over the automatic trust ladder; NULL limit columns keep the ladder value. Manage by inserting/updating rows as service_role; the gateway tier publisher applies changes within about five minutes.';

REVOKE ALL ON TABLE "public"."workspace_rate_limit_overrides" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_rate_limit_overrides" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_rate_limit_overrides" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_customer_rate_limit_inputs (
  p_after uuid    DEFAULT NULL::uuid,
  p_limit integer DEFAULT 500
)
  RETURNS TABLE (
    workspace_id                   uuid,
    created_at                     timestamp with time zone,
    billing_mode                   text,
    has_paid_top_up                boolean,
    lifetime_paid_spend_nanos      bigint,
    override_requests_per_minute   integer,
    override_free_requests_per_day integer,
    override_expires_at            timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Signals:
  -- * Paid top-up: a settled Stripe payment-intent credit of a top-up kind
  --   (the same rule the dashboard uses for paid workspaces). Promo/credit
  --   code grants are written with kind 'promo_code' and are excluded.
  -- * Lifetime paid spend: settled Stripe top-ups net of succeeded Stripe
  --   refunds, i.e. money the customer actually paid. Usage rollups mix in
  --   spending of granted credits, and gateway_requests is too large to scan.
  --   credit_ledger holds payments, grants and async-job charges but no
  --   per-request usage, so the per-workspace index lookup stays small.
  -- Overrides are returned with their expiry; callers ignore expired rows.
  with page as (
    select w.id, w.created_at, w.billing_mode
    from public.workspaces w
    where p_after is null or w.id > p_after
    order by w.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  )
  select
    p.id,
    p.created_at,
    p.billing_mode,
    coalesce(pay.paid_nanos > 0, false),
    greatest(coalesce(pay.paid_nanos, 0) + coalesce(pay.refunded_nanos, 0), 0)::bigint,
    o.requests_per_minute,
    o.free_requests_per_day,
    o.expires_at
  from page p
  left join lateral (
    select
      sum(cl.amount_nanos) filter (where cl.ref_type = 'Stripe_Payment_Intent') as paid_nanos,
      sum(cl.amount_nanos) filter (where cl.ref_type = 'Stripe_Refund') as refunded_nanos
    from public.credit_ledger cl
    where cl.workspace_id = p.id
      and (
        (cl.ref_type = 'Stripe_Payment_Intent'
          and cl.kind in ('top_up', 'top_up_one_off', 'auto_top_up')
          and lower(coalesce(cl.status, '')) in ('paid', 'succeeded')
          and cl.amount_nanos > 0)
        or (cl.ref_type = 'Stripe_Refund'
          and lower(coalesce(cl.status, '')) = 'succeeded'
          and cl.amount_nanos < 0)
      )
  ) pay on true
  left join public.workspace_rate_limit_overrides o on o.workspace_id = p.id
  order by p.id
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer) IS 'Keyset-paginated (by workspace id) trust-ladder inputs for the gateway customer rate-limit tier publisher.';

REVOKE ALL ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer) FROM PUBLIC, "anon", "authenticated";
