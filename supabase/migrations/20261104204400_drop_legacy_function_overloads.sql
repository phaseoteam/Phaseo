-- Drop superseded overloads and broken team-era functions (DB overhaul rung 4).
--
-- None of these has a caller on main: no app, package or script code, no other function body,
-- policy, view, constraint, trigger or cron job references them (checked on prod 2026-11-04).
-- * mtd_spend_cents(uuid, text): legacy team overload that reads credit_ledger. The credits page
--   calls mtd_spend_cents(p_workspace_id), the 1-argument version, which stays.
-- * get_gateway_request_facets(uuid, timestamptz, timestamptz): the settings usage route always
--   passes p_filters, so it uses the 4-argument version, which stays.
-- * consume_oauth_code_and_issue_managed_key (both overloads): the OAuth flow uses
--   consume_oauth_code_and_issue_delegated_grant.
-- * create_workload_identity_policy 8-argument version (before p_pinned_claim): the gateway has
--   called the 9-argument version since #3441 (2026-11-03), and every gateway Worker deployed
--   since then runs that code.
-- * update_workspace_tier, calculate_workspace_previous_month_spend, upsert_api_app,
--   tg_system_settings_audit (no trigger uses it) and is_admin (is_admin_user is the live check):
--   team-era leftovers; update_workspace_tier reads tables that no longer exist.

DROP FUNCTION IF EXISTS public.mtd_spend_cents(uuid, text);
DROP FUNCTION IF EXISTS public.get_gateway_request_facets(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.consume_oauth_code_and_issue_managed_key(uuid, text, text, text, text, uuid, uuid, text, text[]);
DROP FUNCTION IF EXISTS public.consume_oauth_code_and_issue_managed_key(uuid, text, text, text, text, uuid, uuid, text, text[], text);
DROP FUNCTION IF EXISTS public.create_workload_identity_policy(uuid, uuid, text, text, text, text, jsonb, integer);
DROP FUNCTION IF EXISTS public.update_workspace_tier(uuid);
DROP FUNCTION IF EXISTS public.calculate_workspace_previous_month_spend(uuid);
DROP FUNCTION IF EXISTS public.upsert_api_app(uuid, text, text);
DROP FUNCTION IF EXISTS public.tg_system_settings_audit();
DROP FUNCTION IF EXISTS public.is_admin();
