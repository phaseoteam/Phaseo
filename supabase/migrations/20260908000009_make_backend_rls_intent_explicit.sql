-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- phaseo:allow-production-history-backfill reason: Version 20260908000009 is already applied in production; restore its recorded SQL without replaying it.
-- Original version and SQL are retained; this migration is already applied in production.

-- These backend/RPC tables already use RLS default-deny and have no client grants.
-- A restrictive policy documents and preserves that boundary even if a future
-- permissive policy is added. Owners and BYPASSRLS backend roles are unaffected.
CREATE POLICY deny_direct_client_access ON public.account_deletion_jobs
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.checkout_rate_limits
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.email_delivery_suppressions
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.gateway_billing_alert_config
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.gateway_billing_alerts
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.gateway_requests_2026_10
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.gateway_upstream_requests_2026_10
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.machine_payment_authorizations
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.machine_payment_challenges
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.machine_payment_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.machine_payment_protocol_store
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.machine_payment_settlements
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.mobile_notification_preferences
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.mobile_push_devices
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.model_discovery_pricing_pages
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.model_release_push_attempts
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.model_release_push_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.notification_delivery_attempts
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.notification_destinations
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.notification_event_destinations
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.notification_routed_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.payment_method_mutation_leases
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_account_links
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_catalog_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_catalog_model_capabilities
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_catalog_models
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_catalog_review_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_catalog_route_candidates
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_catalog_sources
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_catalog_sync_model_capabilities
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_catalog_sync_models
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_catalog_sync_runs
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_claim_challenges
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_onboarding_submission_reservations
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_onboarding_submissions
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.provider_rate_limits
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.public_model_workspace_usage_weekly
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.resend_contact_identities
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.resend_webhook_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.scim_audit_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.scim_endpoints
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.scim_group_mappings
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.scim_group_members
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.scim_groups
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.scim_idempotency_keys
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.scim_tokens
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.scim_users
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.v2_catalogue_row_history
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_access_grants
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_addon_subscriptions
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_addon_usage_monthly
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_audit_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_department_grants
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_departments
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_directory_audit_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_enterprise_member_overages
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_enterprise_quotes
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_member_effective_entitlements
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_member_entitlement_history
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_member_overrides
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_private_models
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_sso_monthly_active_users
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.workspace_top_up_fee_decisions
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- The discovery Worker reads and upserts pricing pages through service_role.
-- Preserve all other existing ACLs, including append-only and RPC-only tables.
GRANT SELECT, INSERT, UPDATE ON public.model_discovery_pricing_pages TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_gateway_requests_partitions(months_ahead integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_cur_month timestamptz;
  v_last_month timestamptz;
  v_partition_name text;
  v_parent_name text;
BEGIN
  IF months_ahead IS NULL OR months_ahead < 0 THEN
    RAISE EXCEPTION 'months_ahead must be >= 0';
  END IF;
  v_cur_month := date_trunc('month', now());
  v_last_month := v_cur_month + make_interval(months => months_ahead);
  WHILE v_cur_month <= v_last_month LOOP
    FOREACH v_parent_name IN ARRAY ARRAY['gateway_requests', 'gateway_upstream_requests'] LOOP
      v_partition_name := format('%s_%s', v_parent_name, to_char(v_cur_month, 'YYYY_MM'));
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        v_partition_name, v_parent_name, v_cur_month, v_cur_month + interval '1 month'
      );
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy
        WHERE polrelid = to_regclass(format('public.%I', v_partition_name))
          AND polname = 'deny_direct_client_access'
      ) THEN
        EXECUTE format(
          'CREATE POLICY deny_direct_client_access ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
          v_partition_name
        );
      END IF;
    END LOOP;
    v_cur_month := v_cur_month + interval '1 month';
  END LOOP;
END;
$function$;
