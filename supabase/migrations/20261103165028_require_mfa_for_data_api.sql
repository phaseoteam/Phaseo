-- Security review 2026-11-03: MFA could be bypassed through the Data API.
-- The website and web-api require an aal2 session from anyone with a verified second factor, but no
-- RLS policy checked it. With only the password, an attacker could sign in through the Auth API with
-- the public anon key, get an aal1 token, and call /rest/v1 directly as the account owner: invite
-- themselves, change keys, management keys and BYOK keys, delete workspaces.
--
-- Supabase's documented fix: a RESTRICTIVE policy for the authenticated role on every table that
-- signed-in users can read or write, requiring an aal2 session when the user has a verified factor.
-- Users without MFA are unaffected. anon (public catalogue reads) and service_role are unaffected, as
-- the policies only apply to authenticated. Tables that already deny anon and authenticated, and the
-- public catalogue tables (readable by anon anyway, not writable by signed-in users), are left alone.

CREATE OR REPLACE FUNCTION public.mfa_satisfied ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = auth.uid()
        and f.status = 'verified'
    );
$function$;

COMMENT ON FUNCTION "public"."mfa_satisfied"() IS 'True when the signed-in session has passed MFA (aal2), or the user has no verified second factor. Restrictive RLS policies use it so a password-only session of an MFA-protected account cannot use the Data API.';

REVOKE ALL ON FUNCTION "public"."mfa_satisfied"() FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."mfa_satisfied"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."mfa_satisfied"() TO "service_role";

CREATE POLICY "mfa_required_when_enrolled" ON "public"."api_apps"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."broadcast_destination_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."broadcast_destination_rule_groups"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."broadcast_destination_rules"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."byok_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."credit_grant_redemptions"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."credit_grants"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."credit_ledger"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_async_operations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_batch_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_dynamic_route_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_dynamic_route_versions"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_dynamic_routes"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_feedback"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_observability_events"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_preset_test_run_items"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_preset_test_runs"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_wallet_reservations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_webhook_endpoints"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."key_guardrails"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."management_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."oauth_app_metadata"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."oauth_authorizations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."presets"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."users"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_credit_ledger"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_credit_reservations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_private_usage_daily"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_private_usage_daily_meters"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_artifacts"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_attempts"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_facts"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_feedback"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_pricing_lines"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_routing_decisions"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_routing_traces"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_usage"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."wallets"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_broadcast_destinations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_budgets"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_department_budgets"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_guardrails"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_invites"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_join_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_member_guardrails"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_members"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_settings"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_spend_blocks"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_spend_rule_destinations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_spend_rule_state"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_spend_rules"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspaces"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
