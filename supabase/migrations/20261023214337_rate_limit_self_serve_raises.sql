SET local check_function_bodies = off;

-- Self-serve customer rate limit raises: a workspace owner can move the
-- workspace one trust-ladder tier up for a limited time. The tier publisher's
-- inputs function returns the active raise, and can be limited to one workspace.

CREATE TABLE "public"."workspace_rate_limit_raises" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "from_tier"      text                     NOT NULL,
  "to_tier"        text                     NOT NULL,
  "requested_by"   uuid,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"     timestamp with time zone NOT NULL,
  "revoked_at"     timestamp with time zone,
  "revoked_reason" text,
  CONSTRAINT "workspace_rate_limit_raises_expiry_check" CHECK ((expires_at > created_at)),
  CONSTRAINT "workspace_rate_limit_raises_from_tier_check" CHECK ((from_tier = ANY (ARRAY['new'::text, 'standard'::text]))),
  CONSTRAINT "workspace_rate_limit_raises_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_rate_limit_raises_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_rate_limit_raises_to_tier_check" CHECK ((to_tier = ANY (ARRAY['standard'::text, 'trusted'::text]))),
  CONSTRAINT "workspace_rate_limit_raises_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_rate_limit_raises"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_rate_limit_raises_requested_by_idx ON public.workspace_rate_limit_raises USING btree (requested_by);

CREATE INDEX workspace_rate_limit_raises_workspace_id_created_at_idx ON public.workspace_rate_limit_raises USING btree (workspace_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_rate_limit_raises"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_rate_limit_raises" IS 'Self-serve customer rate limit raises: a workspace owner moves the workspace one trust-ladder tier up for a limited time. A raise stops applying when it expires, when revoked_at is set (operators revoke by setting it as service_role), or when a Stripe refund succeeds after it was requested. Operator overrides in workspace_rate_limit_overrides still win.';

REVOKE ALL ON TABLE "public"."workspace_rate_limit_raises" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_rate_limit_raises" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_rate_limit_raises" FROM "anon", "authenticated";

-- The return columns change, so the old signature is dropped first.
DROP FUNCTION IF EXISTS public.gateway_customer_rate_limit_inputs(uuid, integer);

CREATE OR REPLACE FUNCTION public.gateway_customer_rate_limit_inputs (
  p_after        uuid    DEFAULT NULL::uuid,
  p_limit        integer DEFAULT 500,
  p_workspace_id uuid    DEFAULT NULL::uuid
)
  RETURNS TABLE (
    workspace_id                   uuid,
    created_at                     timestamp with time zone,
    billing_mode                   text,
    has_paid_top_up                boolean,
    lifetime_paid_spend_nanos      bigint,
    override_requests_per_minute   integer,
    override_free_requests_per_day integer,
    override_expires_at            timestamp with time zone,
    raise_tier                     text,
    raise_expires_at               timestamp with time zone
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
  -- * Self-serve raise: the newest raise that is unexpired, not revoked, and
  --   not followed by a succeeded Stripe refund (a refund revokes it). A refund
  --   row is created when Stripe reports it and its event_time is set again when
  --   its status changes, so a refund pending before the raise that succeeds
  --   after it still counts.
  -- p_workspace_id limits the page to one workspace, for the raise endpoint.
  with page as (
    select w.id, w.created_at, w.billing_mode
    from public.workspaces w
    where (p_after is null or w.id > p_after)
      and (p_workspace_id is null or w.id = p_workspace_id)
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
    o.expires_at,
    raise.to_tier,
    raise.expires_at
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
  left join lateral (
    select r.to_tier, r.expires_at
    from public.workspace_rate_limit_raises r
    where r.workspace_id = p.id
      and r.revoked_at is null
      and r.expires_at > now()
      and not exists (
        select 1
        from public.credit_ledger cl
        where cl.workspace_id = p.id
          and cl.ref_type = 'Stripe_Refund'
          and lower(coalesce(cl.status, '')) = 'succeeded'
          and greatest(cl.created_at, cl.event_time) >= r.created_at
      )
    order by r.created_at desc
    limit 1
  ) raise on true
  order by p.id
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer, uuid) IS 'Keyset-paginated (by workspace id) trust-ladder inputs for the gateway customer rate-limit tier publisher.';

REVOKE ALL ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_customer_rate_limit_inputs"(uuid, integer, uuid) FROM PUBLIC, "anon", "authenticated";
