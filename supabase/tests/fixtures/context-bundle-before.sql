-- Schema-only fixtures from the deployed context dependencies; no customer data.
create role anon; create role authenticated; create role service_role;
create schema private;
create table public.gateway_requests (
  id uuid,
  created_at timestamp with time zone,
  workspace_id uuid,
  request_id text,
  app_id uuid,
  endpoint text,
  model_id text,
  provider text,
  native_response_id text,
  stream boolean,
  byok boolean,
  status_code integer,
  success boolean,
  error_code text,
  error_message text,
  latency_ms integer,
  generation_ms integer,
  usage jsonb,
  cost_nanos bigint,
  currency text,
  pricing_lines jsonb,
  key_id uuid,
  throughput numeric,
  location text,
  auth_method text,
  oauth_client_id text,
  oauth_user_id uuid,
  finish_reason text,
  end_user_id text,
  session_id text,
  trace_data jsonb,
  canonical_model_id text,
  provider_attempts jsonb,
  error_payload jsonb,
  requested_model_id text,
  routed_model_id text,
  usage_total_tokens bigint,
  usage_input_tokens bigint,
  usage_output_tokens bigint,
  usage_reasoning_tokens bigint,
  usage_input_text_tokens bigint,
  usage_output_text_tokens bigint,
  usage_input_image_tokens bigint,
  usage_output_image_tokens bigint,
  usage_input_audio_tokens bigint,
  usage_output_audio_tokens bigint,
  usage_input_video_tokens bigint,
  usage_output_video_tokens bigint,
  usage_image_inputs bigint,
  usage_image_outputs bigint,
  usage_audio_inputs bigint,
  usage_audio_outputs bigint,
  usage_video_inputs bigint,
  usage_video_outputs bigint,
  usage_cached_read_tokens bigint,
  usage_cached_write_tokens bigint,
  usage_cached_read_text_tokens bigint,
  usage_cached_write_text_tokens bigint,
  usage_cached_write_text_tokens_5m bigint,
  usage_cached_write_text_tokens_1h bigint,
  usage_cached_read_image_tokens bigint,
  usage_cached_write_image_tokens bigint,
  usage_cached_read_audio_tokens bigint,
  usage_cached_write_audio_tokens bigint,
  usage_cached_read_video_tokens bigint,
  usage_cached_write_video_tokens bigint,
  usage_input_quad_tokens bigint,
  usage_output_quad_tokens bigint,
  usage_total_quad_tokens bigint,
  usage_text_quad_tokens bigint,
  usage_rerank_quad_tokens bigint,
  usage_embedding_quad_tokens bigint,
  usage_moderation_quad_tokens bigint,
  usage_ocr_quad_tokens bigint,
  usage_image_megapixels numeric,
  usage_audio_seconds numeric,
  usage_video_pixel_seconds numeric,
  usage_input_characters bigint,
  usage_output_characters bigint,
  usage_total_characters bigint,
  usage_normalized_at timestamp with time zone,
  detail_metadata jsonb,
  usage_video_seconds numeric,
  usage_embedding_tokens bigint,
  api_model_id text,
  pricing_plan text,
  is_free_variant boolean,
  realtime_session_id text,
  provider_ttft_ms integer,
  gateway_ttft_ms integer,
  output_speed_tps numeric,
  tpot_ms numeric,
  itl_ms numeric,
  phaseo_overhead_ms integer,
  client_source_id text,
  client_source_name text,
  client_source_kind text,
  client_source_version text,
  client_source_detection text,
  attributed_user_id uuid,
  attributed_access_role text,
  attributed_department_id uuid,
  attributed_department_name text,
  attributed_department_color text,
  attribution_basis text
);
create table public.keys (
  id uuid,
  workspace_id uuid,
  name text,
  hash text,
  prefix text,
  status text,
  scopes text,
  created_by uuid,
  created_at timestamp with time zone,
  last_used_at timestamp with time zone,
  kid text,
  soft_blocked boolean,
  daily_limit_requests bigint,
  weekly_limit_requests bigint,
  monthly_limit_requests bigint,
  daily_limit_cost_nanos bigint,
  weekly_limit_cost_nanos bigint,
  monthly_limit_cost_nanos bigint,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_reason text,
  key_kind text,
  oauth_client_id text,
  oauth_user_id uuid,
  oauth_scopes text[],
  issued_via text,
  oauth_resource text,
  updated_at timestamp with time zone
);
create table public.presets (
  id uuid,
  workspace_id uuid,
  name text,
  description text,
  config jsonb,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  visibility text,
  source_preset_id uuid,
  slug text,
  draft_name text,
  draft_slug text,
  draft_description text,
  draft_config jsonb,
  draft_visibility text,
  active_version_id uuid,
  source_preset_version_id uuid,
  upstream_version_id uuid,
  root_preset_id uuid,
  fork_depth integer,
  versioning_method text,
  archived_at timestamp with time zone
);
create table public.v2_model_aliases (
  alias_slug text,
  model_slug text,
  alias_type text,
  enabled boolean,
  effective_from timestamp with time zone,
  effective_to timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);
create table public.v2_model_provider_routes (
  provider_model_id text,
  model_slug text,
  provider_slug text,
  provider_model_slug text,
  status text,
  routing_enabled boolean,
  input_modalities text[],
  output_modalities text[],
  regions text[],
  context_length integer,
  max_output_tokens integer,
  effective_from timestamp with time zone,
  effective_to timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  provider_availability_status text,
  phaseo_status text,
  access_scope text,
  is_stealth boolean,
  credential_mode text
);
create table public.v2_models (
  model_slug text,
  lab_slug text,
  name text,
  description text,
  status text,
  hidden boolean,
  input_modalities text[],
  output_modalities text[],
  family_slug text,
  announced_at timestamp with time zone,
  released_at timestamp with time zone,
  deprecated_at timestamp with time zone,
  retired_at timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  license text,
  license_url text,
  previous_model_slug text,
  removal_date timestamp with time zone,
  replacement_model_slug text,
  variant_kind text,
  base_model_slug text,
  catalogue_status text
);
create table public.v2_pricing_sku_meters (
  sku_meter_id uuid,
  sku_id uuid,
  meter_key text,
  modality text,
  direction text,
  unit text,
  unit_quantity numeric,
  price_nanos numeric,
  display_label text,
  display_unit text,
  billable boolean,
  meter_order integer,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);
create table public.v2_pricing_skus (
  sku_id uuid,
  provider_model_id text,
  sku_code text,
  version integer,
  operation text,
  status text,
  region text,
  display_name text,
  description text,
  currency text,
  effective_from timestamp with time zone,
  effective_to timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  service_tier_slug text,
  route_variant_id uuid
);
create table public.v2_providers (
  provider_slug text,
  lab_slug text,
  name text,
  status text,
  routing_enabled boolean,
  routable boolean,
  country_code text,
  base_url text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  provider_family_slug text,
  offer_scope text,
  offer_label text,
  residency_mode text,
  default_execution_regions text[],
  default_data_regions text[],
  zero_data_retention boolean,
  prompt_training_policy text,
  data_policy_tier text,
  data_policy_confidence text,
  data_policy_contract_mode text,
  data_policy_variant text,
  stream_cancellation_support text,
  stream_cancellation_stops_provider_billing boolean,
  stream_cancellation_usage_recovery text,
  stream_cancellation_evidence_kind text,
  stream_cancellation_source_url text,
  stream_cancellation_verified_at timestamp with time zone,
  data_retention_days integer,
  byok_available boolean,
  subdivision_code text,
  credential_mode text
);
create table public.v2_route_capabilities (
  provider_model_id text,
  capability_id text,
  status text,
  max_input_tokens integer,
  max_output_tokens integer,
  params jsonb,
  effective_from timestamp with time zone,
  effective_to timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);
create table public.wallets (
  workspace_id uuid,
  stripe_customer_id text,
  balance_nanos bigint,
  auto_top_up_enabled boolean,
  low_balance_threshold bigint,
  auto_top_up_amount bigint,
  updated_at timestamp with time zone,
  auto_top_up_account_id text,
  reserved_nanos bigint
);
create table public.workspace_publisher_handle_aliases (
  handle text,
  workspace_id uuid,
  created_at timestamp with time zone
);
create table public.workspace_settings (
  workspace_id uuid,
  routing_mode text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  byok_fallback_enabled boolean,
  beta_channel_enabled boolean,
  privacy_enable_paid_may_train boolean,
  privacy_enable_free_may_train boolean,
  privacy_enable_free_may_publish_prompts boolean,
  privacy_enable_input_output_logging boolean,
  privacy_zdr_only boolean,
  provider_restriction_mode text,
  provider_restriction_provider_ids text[],
  provider_restriction_enforce_allowed boolean,
  sso_enabled boolean,
  sso_enforced boolean,
  sso_mode text,
  sso_provider_identifier text,
  sso_domains text[],
  alpha_channel_enabled boolean,
  gateway_plugins jsonb,
  io_logging_enabled boolean,
  io_logging_retention_days integer,
  io_logging_include_provider_payloads boolean,
  io_logging_updated_at timestamp with time zone,
  data_contribution_enabled boolean,
  data_contribution_policy_version text,
  data_contribution_consented_at timestamp with time zone,
  data_contribution_consented_by uuid,
  data_contribution_sample_rate_bps integer,
  data_contribution_classifier_sample_rate_bps integer,
  data_contribution_discount_bps integer,
  response_healing_enabled boolean,
  response_healing_locked boolean,
  response_healing_mode text,
  cache_aware_routing_enabled boolean,
  low_balance_email_enabled boolean,
  low_balance_email_threshold_nanos bigint,
  low_balance_email_last_sent_at timestamp with time zone,
  low_balance_email_last_sent_balance_nanos bigint,
  auto_top_up_failure_email_enabled boolean,
  payment_method_expiring_email_enabled boolean,
  model_restriction_mode text,
  model_restriction_model_ids text[],
  io_logging_billing_status text,
  io_logging_grace_until timestamp with time zone,
  io_logging_last_billed_at timestamp with time zone,
  io_logging_last_billing_warning_at timestamp with time zone,
  io_logging_last_billing_warning_kind text,
  io_logging_price_per_million_units_nanos bigint,
  model_deprecation_alerts_enabled boolean,
  auto_routing_allowed_patterns text[],
  auto_routing_spend_profile text,
  auto_routing_max_input_price_per_million numeric,
  auto_routing_max_output_price_per_million numeric,
  auto_routing_objective text,
  auto_routing_fallbacks_enabled boolean,
  auto_routing_revision uuid,
  auto_routing_updated_at timestamp with time zone
);
create table public.workspaces (
  id uuid,
  name text,
  slug text,
  owner_user_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  tier text,
  billing_mode text,
  publisher_handle text,
  workspace_kind text,
  logo_url text
);
create table public.byok_keys (id uuid,workspace_id uuid,provider_id text,enabled boolean,fingerprint_sha256 text,key_version integer,always_use boolean);
create table public.test_budget_status (workspace_id uuid,status jsonb);
create function public.calculate_tier_with_grace(uuid,bigint) returns text language sql as $$select 'free'::text$$;
create function public.gateway_workspace_budget_status(uuid,bigint) returns jsonb language sql as $$select coalesce((select status from public.test_budget_status where workspace_id=$1),'{"ok":true,"budgets":[]}'::jsonb)$$;
CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context_without_workspace_budget(workspace_id uuid, model text, endpoint text, api_key_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  credit_status       jsonb;
  key_status          jsonb;
  key_limit_status    jsonb;
  min_balance_nanos   bigint := 1000000000; -- 1.00 USD

  providers           jsonb;
  pricing             jsonb;
  preset_data         jsonb := null;

  -- key row fields
  v_key_active        boolean;
  v_key_team_ok       boolean;
  v_soft_blocked      boolean;

  v_day_req_limit     bigint;
  v_wk_req_limit      bigint;
  v_mo_req_limit      bigint;
  v_day_cost_limit    bigint;
  v_wk_cost_limit     bigint;
  v_mo_cost_limit     bigint;

  now_utc             timestamptz := (now() at time zone 'utc');
  day_start           timestamptz := date_trunc('day',  now_utc);
  week_start          timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start         timestamptz := date_trunc('month', now_utc);

  used_day_reqs       bigint;
  used_wk_reqs        bigint;
  used_mo_reqs        bigint;
  used_day_cost       bigint;
  used_wk_cost        bigint;
  used_mo_cost        bigint;

  within_limits       boolean := true;
  limit_reason        text := null;
  limit_window        text := null;
  limit_metric        text := null;
  current_value       bigint := null;
  limit_value         bigint := null;
  limit_reset_at      timestamptz := null;

  -- Preset handling
  is_preset           boolean := false;
  preset_name         text := null;
  preset_publisher    text := null;

  -- Resolve model from alias if exists
  resolved_model      text := gateway_fetch_request_context_without_workspace_budget.model;
  base_model          text;

  team_enrichment     jsonb;
  key_enrichment      jsonb;

  -- Team aggregates
  team_total_requests bigint;
  team_total_spend_nanos bigint;
  team_spend_24h_nanos bigint;
  team_spend_7d_nanos bigint;
  team_spend_30d_nanos bigint;
  team_requests_1h bigint;
  team_requests_24h bigint;
  team_created_at timestamptz;
  team_tier text;
  team_balance_nanos bigint;
  team_reserved_nanos bigint;

  -- Key aggregates
  key_name text;
  key_created_at timestamptz;
  key_total_requests bigint;
  key_total_spend_nanos bigint;
begin
  base_model := gateway_fetch_request_context_without_workspace_budget.model;
  -- hard requirement: key must be provided
  if gateway_fetch_request_context_without_workspace_budget.api_key_id is null then
    raise exception using errcode = '22023', message = 'missing_api_key', detail = 'api_key_id is required';
  end if;

  -- Check if model is a preset (starts with @)
  if base_model like '@%' then
    is_preset := true;
    preset_name := substring(base_model from 2); -- Remove @ prefix

    -- Fetch preset configuration. Qualified references resolve a
    -- public publisher globally; unqualified references remain workspace-local.
    if position('/' in preset_name) > 0 then
      preset_publisher := split_part(preset_name, '/', 1);
      preset_name := substring(preset_name from position('/' in preset_name) + 1);
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
        'config', p.config, 'visibility', p.visibility, 'publisher', w.publisher_handle
      ) into preset_data
      from public.presets p
      join public.workspaces w on w.id = p.workspace_id
      where p.archived_at is null and lower(p.slug) = lower(preset_name)
        and p.visibility = 'public'
        and true
        and (lower(w.publisher_handle) = lower(preset_publisher) or exists (select 1 from public.workspace_publisher_handle_aliases alias where alias.workspace_id = w.id and alias.handle = lower(preset_publisher)))
      limit 1;
    else
      select jsonb_build_object(
        'id', p.id, 'name', p.name,
        'slug', coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', '')),
        'description', p.description, 'config', p.config, 'visibility', p.visibility
      ) into preset_data
      from public.presets p
      where p.archived_at is null and lower(coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', ''))) = lower(preset_name)
        and p.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
        and (
          p.visibility in ('public', 'team')
          or p.created_by = (
            select ak.created_by from public.keys ak
            where ak.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
              and ak.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and ak.status = 'active'
          )
        )
      limit 1;
    end if;

    if preset_data is null then
      raise exception using
        errcode = '22023',
        message = 'preset_not_found',
        detail = format('Preset "%s" not found or not accessible', preset_name);
    end if;

    -- Extract model from preset config (fallback to default/default_model/model/first models entry)
    base_model := coalesce(
      preset_data->'config'->>'defaultModel',
      preset_data->'config'->>'default_model',
      preset_data->'config'->>'model',
      preset_data->'config'->'models'->>0,
      preset_data->'config'->'allowedModels'->>0,
      preset_data->'config'->'allowed_models'->>0
    );

    if base_model is null then
      raise exception using
        errcode = '22023',
        message = 'preset_no_model',
        detail = format('Preset "%s" has no model configured', preset_name);
    end if;
  end if;

  -- Resolve alias/model indirection:
  -- 1) explicit alias table (`v2_model_aliases`)
  -- 2) provider-scoped slug form (`provider/provider_model_slug`)
  resolved_model := coalesce(
    (
      select a.api_model_id
      from (select alias_slug, model_slug as api_model_id, enabled as is_enabled from public.v2_model_aliases) a
      where a.alias_slug = base_model
        and a.is_enabled = true
        and a.api_model_id is not null
      limit 1
    ),
    (
      select m.api_model_id
      from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at from public.v2_model_provider_routes) m
      where position('/' in base_model) > 0
        and m.provider_id = split_part(base_model, '/', 1)
        and m.provider_model_slug = regexp_replace(base_model, '^[^/]+/', '')
        and m.is_active_gateway
        and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
        and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
      order by coalesce(m.effective_from, to_timestamp(0)) desc, m.provider_api_model_id
      limit 1
    ),
    base_model
  );

  -- validate key row, status, and team
  select
    (k.status = 'active'),
    (k.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id),
    k.soft_blocked,
    k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
    k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos
  into
    v_key_active,
    v_key_team_ok,
    v_soft_blocked,
    v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
    v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit
  from public.keys k
  where k.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
  limit 1;

  if v_key_active is null then
    raise exception using errcode = '22023', message = 'api_key_not_found', detail = 'key id does not exist';
  end if;
  if not v_key_team_ok then
    raise exception using errcode = '22023', message = 'api_key_wrong_team', detail = 'key does not belong to provided workspace_id';
  end if;
  if not v_key_active then
    raise exception using errcode = '22023', message = 'api_key_inactive', detail = 'key status is not active';
  end if;

  key_status := jsonb_build_object('ok', true, 'mode', 'first_party');

  -- credit check
  credit_status :=
    coalesce((
      select case
        when greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0) >= min_balance_nanos then
          jsonb_build_object(
            'ok', true,
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
        else
          jsonb_build_object(
            'ok', false,
            'reason', 'insufficient_funds',
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
      end
      from public.wallets w
      where w.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
      limit 1
    ), jsonb_build_object('ok', false, 'reason', 'wallet_missing'));

  -- per-key limits (requests + cost)
  select
    count(*) filter (where gr.created_at >= day_start)                                  as used_day_reqs,
    count(*) filter (where gr.created_at >= week_start)                                 as used_wk_reqs,
    count(*) filter (where gr.created_at >= month_start)                                as used_mo_reqs,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= day_start), 0)::bigint   as used_day_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= week_start), 0)::bigint  as used_wk_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= month_start), 0)::bigint as used_mo_cost
  into
    used_day_reqs, used_wk_reqs, used_mo_reqs,
    used_day_cost, used_wk_cost, used_mo_cost
  from public.gateway_requests gr
  where gr.key_id  = gateway_fetch_request_context_without_workspace_budget.api_key_id
    and gr.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
    and gr.success is true;

  if v_soft_blocked then
    within_limits := false;
    limit_reason := 'key_limit_soft_blocked';
    limit_metric := 'soft_blocked';
  end if;
  if within_limits and v_day_req_limit > 0 and used_day_reqs >= v_day_req_limit then
    within_limits := false;
    limit_reason := 'daily_request_limit_reached';
    limit_window := 'daily';
    limit_metric := 'requests';
    current_value := used_day_reqs;
    limit_value := v_day_req_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_req_limit > 0 and used_wk_reqs >= v_wk_req_limit then
    within_limits := false;
    limit_reason := 'weekly_request_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'requests';
    current_value := used_wk_reqs;
    limit_value := v_wk_req_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_req_limit > 0 and used_mo_reqs >= v_mo_req_limit then
    within_limits := false;
    limit_reason := 'monthly_request_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'requests';
    current_value := used_mo_reqs;
    limit_value := v_mo_req_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;
  if within_limits and v_day_cost_limit > 0 and used_day_cost >= v_day_cost_limit then
    within_limits := false;
    limit_reason := 'daily_cost_limit_reached';
    limit_window := 'daily';
    limit_metric := 'cost';
    current_value := used_day_cost;
    limit_value := v_day_cost_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_cost_limit > 0 and used_wk_cost >= v_wk_cost_limit then
    within_limits := false;
    limit_reason := 'weekly_cost_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'cost';
    current_value := used_wk_cost;
    limit_value := v_wk_cost_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_cost_limit > 0 and used_mo_cost >= v_mo_cost_limit then
    within_limits := false;
    limit_reason := 'monthly_cost_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'cost';
    current_value := used_mo_cost;
    limit_value := v_mo_cost_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;

  key_limit_status :=
    jsonb_build_object(
      'ok', within_limits,
      'reason', limit_reason,
      'limit_window', limit_window,
      'limit_metric', limit_metric,
      'current_value', current_value,
      'limit_value', limit_value,
      'reset_at', to_jsonb(limit_reset_at),
      'now', to_jsonb(now_utc),
      'buckets', jsonb_build_object(
        'daily', jsonb_build_object(
          'window_start', to_jsonb(day_start),
          'requests_used', used_day_reqs,
          'requests_limit', v_day_req_limit,
          'cost_used_nanos', used_day_cost,
          'cost_limit_nanos', v_day_cost_limit
        ),
        'weekly', jsonb_build_object(
          'window_start', to_jsonb(week_start),
          'requests_used', used_wk_reqs,
          'requests_limit', v_wk_req_limit,
          'cost_used_nanos', used_wk_cost,
          'cost_limit_nanos', v_wk_cost_limit
        ),
        'monthly', jsonb_build_object(
          'window_start', to_jsonb(month_start),
          'requests_used', used_mo_reqs,
          'requests_limit', v_mo_req_limit,
          'cost_used_nanos', used_mo_cost,
          'cost_limit_nanos', v_mo_cost_limit
        )
      )
    );

  -- ============================================================================
  -- TEAM & KEY ENRICHMENT (Wide Event Context for Observability)
  -- Purpose: Gather user/team context for comprehensive logging (loggingsucks.com pattern)
  -- ============================================================================
  -- Team metadata & wallet
  select
    t.created_at,
    coalesce(t.tier, 'basic'),
    greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
    coalesce(w.reserved_nanos, 0)::bigint
  into
    team_created_at,
    team_tier,
    team_balance_nanos,
    team_reserved_nanos
  from public.workspaces t
  left join public.wallets w on w.workspace_id = t.id
  where t.id = gateway_fetch_request_context_without_workspace_budget.workspace_id
  limit 1;

  -- Team spend & request aggregates
  select
    count(*),
    coalesce(sum(gr.cost_nanos), 0)::bigint,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= now_utc - interval '24 hours'), 0)::bigint,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= now_utc - interval '7 days'), 0)::bigint,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= now_utc - interval '30 days'), 0)::bigint,
    count(*) filter (where gr.created_at >= now_utc - interval '1 hour'),
    count(*) filter (where gr.created_at >= now_utc - interval '24 hours')
  into
    team_total_requests,
    team_total_spend_nanos,
    team_spend_24h_nanos,
    team_spend_7d_nanos,
    team_spend_30d_nanos,
    team_requests_1h,
    team_requests_24h
  from public.gateway_requests gr
  where gr.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
    and gr.success is true;

  -- Calculate tier using calendar-month qualification + lock-window grace.
  -- Function maintains team tier/counters in database when state changes.
  team_tier := calculate_tier_with_grace(gateway_fetch_request_context_without_workspace_budget.workspace_id, team_spend_30d_nanos);

  team_enrichment := jsonb_build_object(
    'tier', team_tier,
    'created_at', to_jsonb(team_created_at),
    'account_age_days', extract(epoch from (now_utc - team_created_at)) / 86400,
    'balance_nanos', team_balance_nanos,
    'available_nanos', team_balance_nanos,
    'reserved_nanos', team_reserved_nanos,
    'balance_usd', round((team_balance_nanos::numeric / 1000000000.0)::numeric, 2),
    'balance_is_low', team_balance_nanos < min_balance_nanos,
    'total_requests', team_total_requests,
    'total_spend_nanos', team_total_spend_nanos,
    'total_spend_usd', round((team_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_24h_nanos', team_spend_24h_nanos,
    'spend_24h_usd', round((team_spend_24h_nanos::numeric / 1000000000.0)::numeric, 4),
    'spend_7d_nanos', team_spend_7d_nanos,
    'spend_7d_usd', round((team_spend_7d_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_30d_nanos', team_spend_30d_nanos,
    'spend_30d_usd', round((team_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_1h', team_requests_1h,
    'requests_24h', team_requests_24h
  );

  -- Key metadata & aggregates
  select
    k.name,
    k.created_at
  into
    key_name,
    key_created_at
  from public.keys k
  where k.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
  limit 1;

  select
    count(*),
    coalesce(sum(gr.cost_nanos), 0)::bigint
  into
    key_total_requests,
    key_total_spend_nanos
  from public.gateway_requests gr
  where gr.key_id = gateway_fetch_request_context_without_workspace_budget.api_key_id
    and gr.success is true;

  key_enrichment := jsonb_build_object(
    'name', key_name,
    'created_at', to_jsonb(key_created_at),
    'key_age_days', extract(epoch from (now_utc - key_created_at)) / 86400,
    'total_requests', key_total_requests,
    'total_spend_nanos', key_total_spend_nanos,
    'total_spend_usd', round((key_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_today', used_day_reqs,
    'spend_today_nanos', used_day_cost,
    'spend_today_usd', round((used_day_cost::numeric / 1000000000.0)::numeric, 4),
    'daily_limit_pct', case
      when v_day_req_limit > 0 then round((used_day_reqs::numeric / v_day_req_limit::numeric * 100)::numeric, 1)
      else null
    end
  );

  -- provider candidates (BYOK) + pricing, fully qualifying params
  with provider_rows as (
    select distinct on (m.provider_api_model_id)
      m.provider_api_model_id,
      m.provider_id,
      m.api_model_id,
      m.provider_model_slug, coalesce((select route.metadata -> 'availability' from public.v2_model_provider_routes route where route.provider_model_id = m.provider_api_model_id), p.metadata -> 'availability') as availability,
      m.routing_status as model_status,
      m.input_modalities,
      m.output_modalities,
      p.prompt_training_policy,
      p.data_policy_tier,
      p.data_policy_confidence,
      p.data_policy_contract_mode,
	  p.data_policy_variant,
      c.status as capability_status,
      c.params as capability_params,
      c.max_input_tokens,
      c.max_output_tokens
    from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at from public.v2_model_provider_routes) m
    join (select model_slug as model_id, lab_slug as organisation_id, name, description, status, hidden, announced_at as announcement_date, released_at as release_date, deprecated_at as deprecation_date, retired_at as retirement_date, previous_model_slug as previous_model_id, input_modalities as input_types, output_modalities as output_types, metadata, created_at, updated_at from public.v2_models) dm
      on dm.model_id = coalesce(m.model_id, m.api_model_id)
    join public.v2_providers p
      on p.provider_slug = m.provider_id
    join (select provider_model_id as provider_api_model_id, capability_id, status, params, max_input_tokens, max_output_tokens, effective_from, effective_to, created_at, updated_at from public.v2_route_capabilities) c
      on c.provider_api_model_id = m.provider_api_model_id
    where m.api_model_id = resolved_model
      and coalesce(dm.hidden, false) = false
      and (dm.status is null or lower(dm.status) in ('active', 'available', 'deprecated'))
      and (dm.retirement_date is null or dm.retirement_date > now() at time zone 'utc')
      and c.capability_id = gateway_fetch_request_context_without_workspace_budget.endpoint
      and c.status in ('active', 'deranked', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3')
      and m.is_active_gateway
      and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
      and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
    order by m.provider_api_model_id, coalesce(c.updated_at, c.created_at) desc
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'provider_id', pr.provider_id,
          'api_model_id', pr.api_model_id,
          'pricing_key', pr.provider_id,
          'provider_model_slug', pr.provider_model_slug, 'availability', pr.availability,
          'model_status', pr.model_status,
          'input_modalities', pr.input_modalities,
          'output_modalities', pr.output_modalities,
          'prompt_training_policy', coalesce(pr.prompt_training_policy, 'unknown'),
          'data_policy_tier', coalesce(pr.data_policy_tier, 'unknown'),
          'data_policy_confidence', coalesce(pr.data_policy_confidence, 'unknown'),
          'data_policy_contract_mode', coalesce(pr.data_policy_contract_mode, 'none'),
		  'data_policy_variant', coalesce(pr.data_policy_variant, 'standard'),
          'capability_status', pr.capability_status,
          'capability_params', coalesce(pr.capability_params, '{}'::jsonb),
          'max_input_tokens', pr.max_input_tokens,
          'max_output_tokens', pr.max_output_tokens,
          'supports_endpoint', true,
          'base_weight', 1,
          'byok_meta', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'provider_id', bk.provider_id,
                'id', bk.id,
                'name', bk.name,
                'fingerprint_sha256', bk.fingerprint_sha256,
                'key_version', bk.key_version,
                'always_use', bk.always_use
              )
            )
            from public.byok_keys bk
            where bk.workspace_id    = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and bk.provider_id = pr.provider_id
              and bk.enabled     = true
          ), '[]'::jsonb)
        )
      ), '[]'::jsonb
    ) as provider_payload,
    coalesce(
      jsonb_object_agg(
        pr.provider_id,
        (
          with rules as (
            select r.*
            from (select meter.sku_meter_id::text as rule_id, route.provider_slug as provider_id, route.model_slug as api_model_id, route.provider_slug || ':' || route.model_slug || ':' || sku.operation as model_key, sku.operation as capability_id, coalesce(sku.service_tier_slug, 'standard') as pricing_plan, meter.meter_key as meter, meter.unit, meter.unit_quantity as unit_size, meter.price_nanos / 1000000000.0 as price_per_unit, coalesce(nullif(meter.metadata->>'included_quantity', '')::numeric, nullif(sku.metadata->>'included_quantity', '')::numeric, 0) as included_quantity, sku.currency, coalesce(nullif(meter.metadata->>'priority', '')::integer, meter.meter_order, 100) as priority, sku.effective_from, sku.effective_to, coalesce(sku.metadata->'match', meter.metadata->'match', '[]'::jsonb) as match, coalesce(sku.metadata->>'billing_timestamp_basis', 'request_start') as billing_timestamp_basis, coalesce(sku.metadata->'time_windows', '[]'::jsonb) as time_windows, greatest(sku.updated_at, meter.updated_at) as updated_at from public.v2_pricing_skus sku join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id where sku.status = 'active' and meter.billable) r
            -- TODO: Redesign pricing selection to key on provider_api_model_id or
            -- explicit variant metadata so provider-only SKUs (for example CrofAI
            -- precision tiers) can share a parent internal model without forcing
            -- distinct api_model_id values just to preserve pricing separation.
            where r.model_key =
              pr.provider_id || ':' || resolved_model || ':' || gateway_fetch_request_context_without_workspace_budget.endpoint
              and r.capability_id = gateway_fetch_request_context_without_workspace_budget.endpoint
              and (r.effective_from is null or r.effective_from <= now() at time zone 'utc')
              and (r.effective_to   is null or (now() at time zone 'utc') < r.effective_to)
          ),
          ordered_rules as (
            select
              jsonb_agg(
                jsonb_build_object(
                  'id', r.rule_id,
                  'pricing_plan', r.pricing_plan,
                  'meter', r.meter,
                  'unit', r.unit,
                  'unit_size', r.unit_size,
                  'price_per_unit', r.price_per_unit,
                  'included_quantity', r.included_quantity,
                  'currency', r.currency,
                  'match', r.match,
                  'priority', r.priority,
                  'billing_timestamp_basis', coalesce(r.billing_timestamp_basis, 'request_start'),
                  'time_windows', coalesce(r.time_windows, '[]'::jsonb)
                )
                order by r.priority desc, coalesce(r.effective_from, now() at time zone 'utc') desc
              ) as items,
              max(r.updated_at) as version_ts,
              min(r.effective_from) as effective_from,
              min(r.effective_to) as effective_to
            from rules r
          )
          select jsonb_build_object(
            'provider', pr.provider_id,
            'model', resolved_model,
            'endpoint', gateway_fetch_request_context_without_workspace_budget.endpoint,
            'effective_from', to_jsonb(o.effective_from),
            'effective_to',   to_jsonb(o.effective_to),
            'currency', 'USD',
            'version', to_jsonb(o.version_ts),
            'rules', coalesce(o.items, '[]'::jsonb)
          )
          from ordered_rules o
        )
      ),
      '{}'::jsonb
    ) as pricing_payload
  into providers, pricing
  from provider_rows pr;

  return jsonb_build_object(
    'workspace_id', gateway_fetch_request_context_without_workspace_budget.workspace_id,
    'resolved_model', resolved_model,
    'preset', preset_data,
    'key_ok', key_status,
    'key_limit_ok', key_limit_status,
    'credit_ok', credit_status,
    'providers', providers,
    'pricing', pricing,
    'team_enrichment', team_enrichment,
    'key_enrichment', key_enrichment
  );
end;

$function$
;
grant usage on schema public,private to service_role;
grant all on all tables in schema public to service_role;
