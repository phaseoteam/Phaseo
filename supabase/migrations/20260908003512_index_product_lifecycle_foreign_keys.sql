-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

-- Support lifecycle deletions/updates for preset, notification, SCIM and
-- provider/catalogue relationships. The provider-model execution-plan FK
-- is covered by the longer provider-model/capability index below.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE INDEX catalogue_game_results_puzzle_id_idx ON public.catalogue_game_results (puzzle_id);
CREATE INDEX email_delivery_suppressions_source_event_id_idx ON public.email_delivery_suppressions (source_event_id);
CREATE INDEX gateway_batch_key_usage_records_key_id_idx ON public.gateway_batch_key_usage_records (key_id);
CREATE INDEX gateway_billing_alert_config_destination_id_idx ON public.gateway_billing_alert_config (destination_id);
CREATE INDEX gateway_billing_alerts_event_id_idx ON public.gateway_billing_alerts (event_id);
CREATE INDEX gateway_feedback_preset_id_idx ON public.gateway_feedback (preset_id);
CREATE INDEX gateway_feedback_test_run_id_idx ON public.gateway_feedback (test_run_id);
CREATE INDEX gateway_observability_events_preset_id_idx ON public.gateway_observability_events (preset_id);
CREATE INDEX gateway_observability_events_test_run_id_idx ON public.gateway_observability_events (test_run_id);
CREATE INDEX gateway_preset_test_run_items_feedback_id_idx ON public.gateway_preset_test_run_items (feedback_id);
CREATE INDEX gateway_preset_test_run_items_preset_id_idx ON public.gateway_preset_test_run_items (preset_id);
CREATE INDEX gateway_preset_test_run_items_test_run_id_idx ON public.gateway_preset_test_run_items (test_run_id);
CREATE INDEX gateway_preset_test_runs_baseline_preset_id_idx ON public.gateway_preset_test_runs (baseline_preset_id);
CREATE INDEX gateway_preset_test_runs_preset_id_idx ON public.gateway_preset_test_runs (preset_id);
CREATE INDEX machine_payment_authorizations_challenge_id_idx ON public.machine_payment_authorizations (challenge_id);
CREATE INDEX machine_payment_events_challenge_id_idx ON public.machine_payment_events (challenge_id);
CREATE INDEX model_release_push_attempts_device_id_idx ON public.model_release_push_attempts (device_id);
CREATE INDEX notification_delivery_attempts_destination_id_idx ON public.notification_delivery_attempts (destination_id);
CREATE INDEX presets_active_version_idx ON public.presets (active_version_id);
CREATE INDEX presets_root_preset_idx ON public.presets (root_preset_id);
CREATE INDEX presets_source_version_idx ON public.presets (source_preset_version_id);
CREATE INDEX presets_upstream_version_idx ON public.presets (upstream_version_id);
CREATE INDEX provider_catalog_events_provider_slug_idx ON public.provider_catalog_events (provider_slug);
CREATE INDEX provider_catalog_events_run_id_idx ON public.provider_catalog_events (run_id);
CREATE INDEX provider_catalog_model_capabilities_source_run_id_idx ON public.provider_catalog_model_capabilities (source_run_id);
CREATE INDEX provider_catalog_models_canonical_model_slug_idx ON public.provider_catalog_models (canonical_model_slug);
CREATE INDEX provider_catalog_models_source_run_id_idx ON public.provider_catalog_models (source_run_id);
CREATE INDEX provider_catalog_route_candidates_canonical_model_slug_idx ON public.provider_catalog_route_candidates (canonical_model_slug);
CREATE INDEX provider_catalog_route_candidates_provider_slug_idx ON public.provider_catalog_route_candidates (provider_slug);
CREATE INDEX provider_catalog_sync_models_canonical_model_slug_idx ON public.provider_catalog_sync_models (canonical_model_slug);
CREATE INDEX provider_claim_challenges_provider_slug_idx ON public.provider_claim_challenges (provider_slug);
CREATE INDEX scim_group_mappings_scim_group_id_workspace_id_idx ON public.scim_group_mappings (scim_group_id, workspace_id);
CREATE INDEX scim_group_members_group_workspace_idx ON public.scim_group_members (group_id, workspace_id);
CREATE INDEX scim_group_members_user_workspace_idx ON public.scim_group_members (user_id, workspace_id);
CREATE INDEX scim_users_manager_workspace_idx ON public.scim_users (manager_scim_user_id, workspace_id);
CREATE INDEX v2_capability_constraints_provider_model_id_idx ON public.v2_capability_constraints (provider_model_id);
CREATE INDEX v2_capability_evidence_provider_model_id_idx ON public.v2_capability_evidence (provider_model_id);
CREATE INDEX v2_execution_plans_provider_model_id_capability_id_idx ON public.v2_execution_plans (provider_model_id, capability_id);
CREATE INDEX v2_execution_plans_provider_model_id_route_variant_id_idx ON public.v2_execution_plans (provider_model_id, route_variant_id);
CREATE INDEX v2_provider_auth_profiles_auth_primitive_key_idx ON public.v2_provider_auth_profiles (auth_primitive_key);
CREATE INDEX v2_provider_capability_adapte_capability_id_capability_ada_idx ON public.v2_provider_capability_adapters (capability_id, capability_adapter_id);
CREATE INDEX v2_provider_capability_adapte_provider_slug_capability_id__idx ON public.v2_provider_capability_adapters (provider_slug, capability_id, provider_endpoint_id);
CREATE INDEX v2_provider_endpoints_provider_slug_auth_profile_id_idx ON public.v2_provider_endpoints (provider_slug, auth_profile_id);
CREATE INDEX v2_provider_endpoints_service_tier_slug_idx ON public.v2_provider_endpoints (service_tier_slug);
CREATE INDEX workspace_addon_subscriptions_quote_id_idx ON public.workspace_addon_subscriptions (quote_id);
CREATE INDEX workspace_join_requests_invite_id_idx ON public.workspace_join_requests (invite_id);

