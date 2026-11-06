-- Tokens the auth provider's OAuth server issues to apps carry the app's client_id. That includes the Phaseo CLI
-- and desktop app, whose client IDs are public. The management API and web-api refuse their writes by default;
-- this closes the Data API (/rest/v1) the same way. Every public table where authenticated holds a write grant
-- gets restrictive INSERT, UPDATE and DELETE policies that refuse a client_id token (no table is exempt).
-- The person's own session has no client_id, Phaseo's servers write with the service role, and reads are
-- unaffected.
-- SECURITY DEFINER functions bypass RLS, so the ones signed-in users can call that change membership refuse
-- such a token themselves. The others read data, are policy helpers, or only add to the caller's own counters
-- or credit (refuse-oauth-client-writes.test.mjs lists each one with its reason).

CREATE OR REPLACE FUNCTION public.request_is_oauth_client ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select (auth.jwt() ->> 'client_id') is not null;
$function$;

COMMENT ON FUNCTION "public"."request_is_oauth_client"() IS 'True when the request carries a token the OAuth server issued to an app (it has a top-level client_id). Restrictive RLS policies and SECURITY DEFINER functions use it to refuse writes from app tokens, including the public CLI and desktop clients.';

GRANT EXECUTE ON FUNCTION "public"."request_is_oauth_client"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."request_is_oauth_client"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."request_is_oauth_client"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."request_is_oauth_client"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."request_is_oauth_client"() FROM PUBLIC, "anon";

CREATE POLICY "api_apps_no_oauth_client_insert" ON "public"."api_apps"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "api_apps_no_oauth_client_update" ON "public"."api_apps"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "api_apps_no_oauth_client_delete" ON "public"."api_apps"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "broadcast_destination_keys_no_oauth_client_insert" ON "public"."broadcast_destination_keys"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "broadcast_destination_keys_no_oauth_client_update" ON "public"."broadcast_destination_keys"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "broadcast_destination_keys_no_oauth_client_delete" ON "public"."broadcast_destination_keys"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "broadcast_destination_rule_groups_no_oauth_client_insert" ON "public"."broadcast_destination_rule_groups"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "broadcast_destination_rule_groups_no_oauth_client_update" ON "public"."broadcast_destination_rule_groups"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "broadcast_destination_rule_groups_no_oauth_client_delete" ON "public"."broadcast_destination_rule_groups"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "broadcast_destination_rules_no_oauth_client_insert" ON "public"."broadcast_destination_rules"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "broadcast_destination_rules_no_oauth_client_update" ON "public"."broadcast_destination_rules"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "broadcast_destination_rules_no_oauth_client_delete" ON "public"."broadcast_destination_rules"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "byok_keys_no_oauth_client_insert" ON "public"."byok_keys"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "byok_keys_no_oauth_client_update" ON "public"."byok_keys"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "byok_keys_no_oauth_client_delete" ON "public"."byok_keys"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "credit_grant_redemptions_no_oauth_client_insert" ON "public"."credit_grant_redemptions"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "credit_grant_redemptions_no_oauth_client_update" ON "public"."credit_grant_redemptions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "credit_grant_redemptions_no_oauth_client_delete" ON "public"."credit_grant_redemptions"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "credit_grants_no_oauth_client_insert" ON "public"."credit_grants"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "credit_grants_no_oauth_client_update" ON "public"."credit_grants"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "credit_grants_no_oauth_client_delete" ON "public"."credit_grants"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_async_operations_no_oauth_client_insert" ON "public"."gateway_async_operations"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_async_operations_no_oauth_client_update" ON "public"."gateway_async_operations"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_async_operations_no_oauth_client_delete" ON "public"."gateway_async_operations"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_batch_requests_no_oauth_client_insert" ON "public"."gateway_batch_requests"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_batch_requests_no_oauth_client_update" ON "public"."gateway_batch_requests"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_batch_requests_no_oauth_client_delete" ON "public"."gateway_batch_requests"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_dynamic_route_keys_no_oauth_client_insert" ON "public"."gateway_dynamic_route_keys"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_dynamic_route_keys_no_oauth_client_update" ON "public"."gateway_dynamic_route_keys"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_dynamic_route_keys_no_oauth_client_delete" ON "public"."gateway_dynamic_route_keys"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_dynamic_route_versions_no_oauth_client_insert" ON "public"."gateway_dynamic_route_versions"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_dynamic_route_versions_no_oauth_client_update" ON "public"."gateway_dynamic_route_versions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_dynamic_route_versions_no_oauth_client_delete" ON "public"."gateway_dynamic_route_versions"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_dynamic_routes_no_oauth_client_insert" ON "public"."gateway_dynamic_routes"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_dynamic_routes_no_oauth_client_update" ON "public"."gateway_dynamic_routes"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_dynamic_routes_no_oauth_client_delete" ON "public"."gateway_dynamic_routes"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_feedback_no_oauth_client_insert" ON "public"."gateway_feedback"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_feedback_no_oauth_client_update" ON "public"."gateway_feedback"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_feedback_no_oauth_client_delete" ON "public"."gateway_feedback"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_observability_events_no_oauth_client_insert" ON "public"."gateway_observability_events"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_observability_events_no_oauth_client_update" ON "public"."gateway_observability_events"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_observability_events_no_oauth_client_delete" ON "public"."gateway_observability_events"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_preset_test_run_items_no_oauth_client_insert" ON "public"."gateway_preset_test_run_items"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_preset_test_run_items_no_oauth_client_update" ON "public"."gateway_preset_test_run_items"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_preset_test_run_items_no_oauth_client_delete" ON "public"."gateway_preset_test_run_items"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_preset_test_runs_no_oauth_client_insert" ON "public"."gateway_preset_test_runs"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_preset_test_runs_no_oauth_client_update" ON "public"."gateway_preset_test_runs"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_preset_test_runs_no_oauth_client_delete" ON "public"."gateway_preset_test_runs"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_realtime_sessions_no_oauth_client_insert" ON "public"."gateway_realtime_sessions"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_realtime_sessions_no_oauth_client_update" ON "public"."gateway_realtime_sessions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_realtime_sessions_no_oauth_client_delete" ON "public"."gateway_realtime_sessions"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_wallet_reservations_no_oauth_client_insert" ON "public"."gateway_wallet_reservations"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_wallet_reservations_no_oauth_client_update" ON "public"."gateway_wallet_reservations"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_wallet_reservations_no_oauth_client_delete" ON "public"."gateway_wallet_reservations"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_webhook_endpoints_no_oauth_client_insert" ON "public"."gateway_webhook_endpoints"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_webhook_endpoints_no_oauth_client_update" ON "public"."gateway_webhook_endpoints"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_webhook_endpoints_no_oauth_client_delete" ON "public"."gateway_webhook_endpoints"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "key_guardrails_no_oauth_client_insert" ON "public"."key_guardrails"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "key_guardrails_no_oauth_client_update" ON "public"."key_guardrails"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "key_guardrails_no_oauth_client_delete" ON "public"."key_guardrails"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "oauth_authorizations_no_oauth_client_insert" ON "public"."oauth_authorizations"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "oauth_authorizations_no_oauth_client_update" ON "public"."oauth_authorizations"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "oauth_authorizations_no_oauth_client_delete" ON "public"."oauth_authorizations"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "preset_version_labels_no_oauth_client_insert" ON "public"."preset_version_labels"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "preset_version_labels_no_oauth_client_update" ON "public"."preset_version_labels"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "preset_version_labels_no_oauth_client_delete" ON "public"."preset_version_labels"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "preset_versions_no_oauth_client_insert" ON "public"."preset_versions"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "preset_versions_no_oauth_client_update" ON "public"."preset_versions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "preset_versions_no_oauth_client_delete" ON "public"."preset_versions"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "presets_no_oauth_client_insert" ON "public"."presets"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "presets_no_oauth_client_update" ON "public"."presets"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "presets_no_oauth_client_delete" ON "public"."presets"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "updates_no_oauth_client_insert" ON "public"."updates"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "updates_no_oauth_client_update" ON "public"."updates"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "updates_no_oauth_client_delete" ON "public"."updates"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "users_no_oauth_client_insert" ON "public"."users"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "users_no_oauth_client_update" ON "public"."users"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "users_no_oauth_client_delete" ON "public"."users"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_benchmark_results_no_oauth_client_insert" ON "public"."v2_benchmark_results"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_benchmark_results_no_oauth_client_update" ON "public"."v2_benchmark_results"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_benchmark_results_no_oauth_client_delete" ON "public"."v2_benchmark_results"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_benchmarks_no_oauth_client_insert" ON "public"."v2_benchmarks"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_benchmarks_no_oauth_client_update" ON "public"."v2_benchmarks"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_benchmarks_no_oauth_client_delete" ON "public"."v2_benchmarks"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_lab_links_no_oauth_client_insert" ON "public"."v2_lab_links"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_lab_links_no_oauth_client_update" ON "public"."v2_lab_links"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_lab_links_no_oauth_client_delete" ON "public"."v2_lab_links"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_labs_no_oauth_client_insert" ON "public"."v2_labs"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_labs_no_oauth_client_update" ON "public"."v2_labs"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_labs_no_oauth_client_delete" ON "public"."v2_labs"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_meter_definitions_no_oauth_client_insert" ON "public"."v2_meter_definitions"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_meter_definitions_no_oauth_client_update" ON "public"."v2_meter_definitions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_meter_definitions_no_oauth_client_delete" ON "public"."v2_meter_definitions"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_aliases_no_oauth_client_insert" ON "public"."v2_model_aliases"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_aliases_no_oauth_client_update" ON "public"."v2_model_aliases"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_aliases_no_oauth_client_delete" ON "public"."v2_model_aliases"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_details_no_oauth_client_insert" ON "public"."v2_model_details"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_details_no_oauth_client_update" ON "public"."v2_model_details"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_details_no_oauth_client_delete" ON "public"."v2_model_details"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_families_no_oauth_client_insert" ON "public"."v2_model_families"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_families_no_oauth_client_update" ON "public"."v2_model_families"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_families_no_oauth_client_delete" ON "public"."v2_model_families"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_links_no_oauth_client_insert" ON "public"."v2_model_links"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_links_no_oauth_client_update" ON "public"."v2_model_links"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_links_no_oauth_client_delete" ON "public"."v2_model_links"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_page_notices_no_oauth_client_insert" ON "public"."v2_model_page_notices"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_page_notices_no_oauth_client_update" ON "public"."v2_model_page_notices"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_page_notices_no_oauth_client_delete" ON "public"."v2_model_page_notices"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_provider_routes_no_oauth_client_insert" ON "public"."v2_model_provider_routes"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_provider_routes_no_oauth_client_update" ON "public"."v2_model_provider_routes"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_model_provider_routes_no_oauth_client_delete" ON "public"."v2_model_provider_routes"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_models_no_oauth_client_insert" ON "public"."v2_models"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_models_no_oauth_client_update" ON "public"."v2_models"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_models_no_oauth_client_delete" ON "public"."v2_models"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_pricing_sku_meters_no_oauth_client_insert" ON "public"."v2_pricing_sku_meters"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_pricing_sku_meters_no_oauth_client_update" ON "public"."v2_pricing_sku_meters"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_pricing_sku_meters_no_oauth_client_delete" ON "public"."v2_pricing_sku_meters"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_pricing_skus_no_oauth_client_insert" ON "public"."v2_pricing_skus"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_pricing_skus_no_oauth_client_update" ON "public"."v2_pricing_skus"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_pricing_skus_no_oauth_client_delete" ON "public"."v2_pricing_skus"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_private_usage_daily_no_oauth_client_insert" ON "public"."v2_private_usage_daily"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_private_usage_daily_no_oauth_client_update" ON "public"."v2_private_usage_daily"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_private_usage_daily_no_oauth_client_delete" ON "public"."v2_private_usage_daily"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_private_usage_daily_meters_no_oauth_client_insert" ON "public"."v2_private_usage_daily_meters"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_private_usage_daily_meters_no_oauth_client_update" ON "public"."v2_private_usage_daily_meters"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_private_usage_daily_meters_no_oauth_client_delete" ON "public"."v2_private_usage_daily_meters"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_provider_regions_no_oauth_client_insert" ON "public"."v2_provider_regions"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_provider_regions_no_oauth_client_update" ON "public"."v2_provider_regions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_provider_regions_no_oauth_client_delete" ON "public"."v2_provider_regions"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_providers_no_oauth_client_insert" ON "public"."v2_providers"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_providers_no_oauth_client_update" ON "public"."v2_providers"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_providers_no_oauth_client_delete" ON "public"."v2_providers"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_provider_health_daily_no_oauth_client_insert" ON "public"."v2_public_provider_health_daily"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_provider_health_daily_no_oauth_client_update" ON "public"."v2_public_provider_health_daily"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_provider_health_daily_no_oauth_client_delete" ON "public"."v2_public_provider_health_daily"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_daily_no_oauth_client_insert" ON "public"."v2_public_usage_daily"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_daily_no_oauth_client_update" ON "public"."v2_public_usage_daily"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_daily_no_oauth_client_delete" ON "public"."v2_public_usage_daily"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_daily_meters_no_oauth_client_insert" ON "public"."v2_public_usage_daily_meters"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_daily_meters_no_oauth_client_update" ON "public"."v2_public_usage_daily_meters"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_daily_meters_no_oauth_client_delete" ON "public"."v2_public_usage_daily_meters"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_hourly_no_oauth_client_insert" ON "public"."v2_public_usage_hourly"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_hourly_no_oauth_client_update" ON "public"."v2_public_usage_hourly"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_hourly_no_oauth_client_delete" ON "public"."v2_public_usage_hourly"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_hourly_meters_no_oauth_client_insert" ON "public"."v2_public_usage_hourly_meters"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_hourly_meters_no_oauth_client_update" ON "public"."v2_public_usage_hourly_meters"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_public_usage_hourly_meters_no_oauth_client_delete" ON "public"."v2_public_usage_hourly_meters"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_attempts_no_oauth_client_insert" ON "public"."v2_request_attempts"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_attempts_no_oauth_client_update" ON "public"."v2_request_attempts"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_attempts_no_oauth_client_delete" ON "public"."v2_request_attempts"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_facts_no_oauth_client_insert" ON "public"."v2_request_facts"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_facts_no_oauth_client_update" ON "public"."v2_request_facts"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_facts_no_oauth_client_delete" ON "public"."v2_request_facts"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_pricing_lines_no_oauth_client_insert" ON "public"."v2_request_pricing_lines"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_pricing_lines_no_oauth_client_update" ON "public"."v2_request_pricing_lines"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_pricing_lines_no_oauth_client_delete" ON "public"."v2_request_pricing_lines"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_routing_decisions_no_oauth_client_insert" ON "public"."v2_request_routing_decisions"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_routing_decisions_no_oauth_client_update" ON "public"."v2_request_routing_decisions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_routing_decisions_no_oauth_client_delete" ON "public"."v2_request_routing_decisions"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_usage_no_oauth_client_insert" ON "public"."v2_request_usage"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_usage_no_oauth_client_update" ON "public"."v2_request_usage"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_usage_no_oauth_client_delete" ON "public"."v2_request_usage"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_route_capabilities_no_oauth_client_insert" ON "public"."v2_route_capabilities"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_route_capabilities_no_oauth_client_update" ON "public"."v2_route_capabilities"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_route_capabilities_no_oauth_client_delete" ON "public"."v2_route_capabilities"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_route_variants_no_oauth_client_insert" ON "public"."v2_route_variants"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_route_variants_no_oauth_client_update" ON "public"."v2_route_variants"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_route_variants_no_oauth_client_delete" ON "public"."v2_route_variants"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_service_tiers_no_oauth_client_insert" ON "public"."v2_service_tiers"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_service_tiers_no_oauth_client_update" ON "public"."v2_service_tiers"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_service_tiers_no_oauth_client_delete" ON "public"."v2_service_tiers"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_subscription_plan_features_no_oauth_client_insert" ON "public"."v2_subscription_plan_features"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_subscription_plan_features_no_oauth_client_update" ON "public"."v2_subscription_plan_features"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_subscription_plan_features_no_oauth_client_delete" ON "public"."v2_subscription_plan_features"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_subscription_plan_models_no_oauth_client_insert" ON "public"."v2_subscription_plan_models"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_subscription_plan_models_no_oauth_client_update" ON "public"."v2_subscription_plan_models"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_subscription_plan_models_no_oauth_client_delete" ON "public"."v2_subscription_plan_models"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_subscription_plans_no_oauth_client_insert" ON "public"."v2_subscription_plans"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_subscription_plans_no_oauth_client_update" ON "public"."v2_subscription_plans"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_subscription_plans_no_oauth_client_delete" ON "public"."v2_subscription_plans"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "wallets_no_oauth_client_insert" ON "public"."wallets"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "wallets_no_oauth_client_update" ON "public"."wallets"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "wallets_no_oauth_client_delete" ON "public"."wallets"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_broadcast_destinations_no_oauth_client_insert" ON "public"."workspace_broadcast_destinations"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_broadcast_destinations_no_oauth_client_update" ON "public"."workspace_broadcast_destinations"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_broadcast_destinations_no_oauth_client_delete" ON "public"."workspace_broadcast_destinations"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_guardrails_no_oauth_client_insert" ON "public"."workspace_guardrails"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_guardrails_no_oauth_client_update" ON "public"."workspace_guardrails"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_guardrails_no_oauth_client_delete" ON "public"."workspace_guardrails"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_invites_no_oauth_client_insert" ON "public"."workspace_invites"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_invites_no_oauth_client_update" ON "public"."workspace_invites"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_invites_no_oauth_client_delete" ON "public"."workspace_invites"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_join_requests_no_oauth_client_insert" ON "public"."workspace_join_requests"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_join_requests_no_oauth_client_update" ON "public"."workspace_join_requests"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_join_requests_no_oauth_client_delete" ON "public"."workspace_join_requests"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_member_guardrails_no_oauth_client_insert" ON "public"."workspace_member_guardrails"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_member_guardrails_no_oauth_client_update" ON "public"."workspace_member_guardrails"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_member_guardrails_no_oauth_client_delete" ON "public"."workspace_member_guardrails"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_members_no_oauth_client_insert" ON "public"."workspace_members"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_members_no_oauth_client_update" ON "public"."workspace_members"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_members_no_oauth_client_delete" ON "public"."workspace_members"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_settings_no_oauth_client_insert" ON "public"."workspace_settings"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_settings_no_oauth_client_update" ON "public"."workspace_settings"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_settings_no_oauth_client_delete" ON "public"."workspace_settings"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspaces_no_oauth_client_insert" ON "public"."workspaces"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspaces_no_oauth_client_update" ON "public"."workspaces"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspaces_no_oauth_client_delete" ON "public"."workspaces"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE OR REPLACE FUNCTION public.approve_workspace_join_request (
  p_request_id uuid
)
  RETURNS TABLE (
    id                uuid,
    workspace_id      uuid,
    requester_user_id uuid,
    invite_id         uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_req public.workspace_join_requests%rowtype;
  v_role public.workspace_role := 'member'::public.workspace_role;
begin
  if not public.mfa_satisfied() then
    raise exception using errcode = '42501', message = 'mfa_required';
  end if;

  -- A token issued to an OAuth client (the CLI and desktop app too) cannot change membership.
  if public.request_is_oauth_client() then
    raise exception using errcode = '42501', message = 'oauth_client_refused';
  end if;

  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Unauthorized';
  end if;

  select *
    into v_req
  from public.workspace_join_requests
  where workspace_join_requests.id = p_request_id
    and public.is_workspace_admin(workspace_join_requests.workspace_id)
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Join request not found or not authorized';
  end if;

  if v_req.status <> 'pending'::public.join_request_status then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;

  if not public.is_workspace_admin(v_req.workspace_id) then
    raise exception using errcode = '42501', message = 'Only owners or admins may approve join requests.';
  end if;

  if v_req.invite_id is not null then
    update public.workspace_invites ti
      set uses_count = coalesce(ti.uses_count, 0) + 1
    where ti.id = v_req.invite_id
      and ti.workspace_id = v_req.workspace_id
      and (ti.expires_at is null or ti.expires_at > now())
      and (ti.max_uses is null or coalesce(ti.uses_count, 0) < ti.max_uses)
    returning ti.role into v_role;

    if not found then
      raise exception using errcode = '23514', message = 'Invite is invalid for this request';
    end if;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_req.workspace_id, v_req.requester_user_id, v_role)
  on conflict on constraint workspace_members_pkey do nothing;

  return query
  update public.workspace_join_requests r
     set status = 'approved'::public.join_request_status,
         decided_by = v_user_id,
         decided_at = now()
   where r.id = v_req.id
     and r.status = 'pending'::public.join_request_status
  returning r.id, r.workspace_id, r.requester_user_id, r.invite_id;

  if not found then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_workspace_join_request (
  p_request_id uuid
)
  RETURNS TABLE (
    id           uuid,
    workspace_id uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_req public.workspace_join_requests%rowtype;
begin
  if not public.mfa_satisfied() then
    raise exception using errcode = '42501', message = 'mfa_required';
  end if;

  -- A token issued to an OAuth client (the CLI and desktop app too) cannot change membership.
  if public.request_is_oauth_client() then
    raise exception using errcode = '42501', message = 'oauth_client_refused';
  end if;

  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Unauthorized';
  end if;

  select *
    into v_req
  from public.workspace_join_requests
  where workspace_join_requests.id = p_request_id
    and public.is_workspace_admin(workspace_join_requests.workspace_id)
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Join request not found or not authorized';
  end if;

  if v_req.status <> 'pending'::public.join_request_status then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;

  if not public.is_workspace_admin(v_req.workspace_id) then
    raise exception using errcode = '42501', message = 'Only owners or admins may reject join requests.';
  end if;

  return query
  update public.workspace_join_requests r
     set status = 'denied'::public.join_request_status,
         decided_by = v_user_id,
         decided_at = now()
   where r.id = v_req.id
     and r.status = 'pending'::public.join_request_status
  returning r.id, r.workspace_id;

  if not found then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;
end;
$function$;
