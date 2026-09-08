-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

-- Cover ownership/deletion relationships for account, workspace and
-- department cleanup. Leave the already-covered reversed-order FK alone.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE INDEX byok_keys_created_by_idx ON public.byok_keys (created_by);
CREATE INDEX checkout_rate_limits_user_id_idx ON public.checkout_rate_limits (user_id);
CREATE INDEX credit_grants_created_by_idx ON public.credit_grants (created_by);
CREATE INDEX gateway_dynamic_route_keys_attached_by_idx ON public.gateway_dynamic_route_keys (attached_by);
CREATE INDEX gateway_dynamic_route_versions_created_by_idx ON public.gateway_dynamic_route_versions (created_by);
CREATE INDEX gateway_dynamic_routes_created_by_idx ON public.gateway_dynamic_routes (created_by);
CREATE INDEX gateway_webhook_endpoints_created_by_idx ON public.gateway_webhook_endpoints (created_by);
CREATE INDEX management_keys_created_by_idx ON public.management_keys (created_by);
CREATE INDEX notification_delivery_attempts_workspace_id_idx ON public.notification_delivery_attempts (workspace_id);
CREATE INDEX notification_destinations_created_by_idx ON public.notification_destinations (created_by);
CREATE INDEX oauth_authorization_codes_workspace_id_idx ON public.oauth_authorization_codes (workspace_id);
CREATE INDEX oauth_device_codes_workspace_id_idx ON public.oauth_device_codes (workspace_id);
CREATE INDEX otel_export_outbox_workspace_id_idx ON public.otel_export_outbox (workspace_id);
CREATE INDEX preset_versions_created_by_idx ON public.preset_versions (created_by);
CREATE INDEX provider_account_links_linked_by_idx ON public.provider_account_links (linked_by);
CREATE INDEX provider_catalog_review_events_actor_user_id_idx ON public.provider_catalog_review_events (actor_user_id);
CREATE INDEX provider_catalog_route_candidates_probed_by_idx ON public.provider_catalog_route_candidates (probed_by);
CREATE INDEX provider_catalog_sources_created_by_idx ON public.provider_catalog_sources (created_by);
CREATE INDEX provider_catalog_sync_models_reviewed_by_idx ON public.provider_catalog_sync_models (reviewed_by);
CREATE INDEX provider_catalog_sync_runs_reviewed_by_idx ON public.provider_catalog_sync_runs (reviewed_by);
CREATE INDEX scim_group_mappings_created_by_idx ON public.scim_group_mappings (created_by);
CREATE INDEX scim_group_mappings_department_id_workspace_id_idx ON public.scim_group_mappings (department_id, workspace_id);
CREATE INDEX scim_group_members_workspace_id_idx ON public.scim_group_members (workspace_id);
CREATE INDEX scim_tokens_created_by_idx ON public.scim_tokens (created_by);
CREATE INDEX scim_users_auth_user_id_idx ON public.scim_users (auth_user_id);
CREATE INDEX security_key_reports_action_taken_by_idx ON public.security_key_reports (action_taken_by);
CREATE INDEX v2_catalogue_source_overrides_actor_user_id_idx ON public.v2_catalogue_source_overrides (actor_user_id);
CREATE INDEX v2_control_plane_releases_created_by_idx ON public.v2_control_plane_releases (created_by);
CREATE INDEX v2_control_plane_releases_published_by_idx ON public.v2_control_plane_releases (published_by);
CREATE INDEX v2_control_plane_releases_reviewed_by_idx ON public.v2_control_plane_releases (reviewed_by);
CREATE INDEX web_cache_generations_updated_by_idx ON public.web_cache_generations (updated_by);
CREATE INDEX web_cache_purge_events_actor_user_id_idx ON public.web_cache_purge_events (actor_user_id);
CREATE INDEX workspace_access_grants_user_id_idx ON public.workspace_access_grants (user_id);
CREATE INDEX workspace_budgets_created_by_idx ON public.workspace_budgets (created_by);
CREATE INDEX workspace_department_grants_user_id_idx ON public.workspace_department_grants (user_id);
CREATE INDEX workspace_directory_audit_events_actor_user_id_idx ON public.workspace_directory_audit_events (actor_user_id);
CREATE INDEX workspace_enterprise_member_overages_user_id_idx ON public.workspace_enterprise_member_overages (user_id);
CREATE INDEX workspace_invites_inviter_user_id_idx ON public.workspace_invites (creator_user_id);
CREATE INDEX workspace_join_requests_decided_by_idx ON public.workspace_join_requests (decided_by);
CREATE INDEX workspace_member_effective_enti_department_id_workspace_id_idx ON public.workspace_member_effective_entitlements (department_id, workspace_id);
CREATE INDEX workspace_member_effective_entitlements_user_id_idx ON public.workspace_member_effective_entitlements (user_id);
CREATE INDEX workspace_member_entitlement_history_changed_by_idx ON public.workspace_member_entitlement_history (changed_by);
CREATE INDEX workspace_member_entitlement_history_user_id_idx ON public.workspace_member_entitlement_history (user_id);
CREATE INDEX workspace_member_overrides_department_id_workspace_id_idx ON public.workspace_member_overrides (department_id, workspace_id);
CREATE INDEX workspace_member_overrides_updated_by_idx ON public.workspace_member_overrides (updated_by);
CREATE INDEX workspace_member_overrides_user_id_idx ON public.workspace_member_overrides (user_id);
CREATE INDEX workspace_private_models_created_by_idx ON public.workspace_private_models (created_by);
CREATE INDEX workspace_sso_monthly_active_users_auth_user_id_idx ON public.workspace_sso_monthly_active_users (auth_user_id);

