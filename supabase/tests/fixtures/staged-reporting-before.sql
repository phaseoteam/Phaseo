-- Isolated PostgreSQL regression fixture: schema shapes and deployed reporting
-- writers only. Contains no production data. Load before the two migrations.
create schema if not exists private;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
set check_function_bodies = false;
-- Identity normalization is outside this regression's scope; test models are
-- already canonical and never exercise aliases or free variants.
create function public.resolve_public_model_id(p_model_id text,p_provider text)
returns text language sql immutable as $$ select p_model_id $$;
create table public.v2_catalogue_admin_changes (change_id uuid default gen_random_uuid(),actor_user_id uuid,resource_type text,resource_id text,action text,before_state jsonb,after_state jsonb,created_at timestamp with time zone);
create table public.v2_catalogue_source_overrides (source_type text,source_key text,disposition text,actor_user_id uuid,resource_id text,updated_at timestamp with time zone);
create table public.v2_pricing_sku_meters (sku_meter_id uuid default gen_random_uuid(),sku_id uuid,meter_key text,modality text,direction text,unit text,unit_quantity numeric(30,12),price_nanos numeric(30,12),display_label text,display_unit text,billable boolean,meter_order integer,metadata jsonb,created_at timestamp with time zone,updated_at timestamp with time zone);
create table public.v2_providers (provider_slug text,lab_slug text,name text,status text,routing_enabled boolean,routable boolean,country_code text,base_url text,metadata jsonb,created_at timestamp with time zone,updated_at timestamp with time zone,provider_family_slug text,offer_scope text,offer_label text,residency_mode text,default_execution_regions text[],default_data_regions text[],zero_data_retention boolean,prompt_training_policy text,data_policy_tier text,data_policy_confidence text,data_policy_contract_mode text,data_policy_variant text,stream_cancellation_support text,stream_cancellation_stops_provider_billing boolean,stream_cancellation_usage_recovery text,stream_cancellation_evidence_kind text,stream_cancellation_source_url text,stream_cancellation_verified_at timestamp with time zone,data_retention_days integer,byok_available boolean,subdivision_code text,credential_mode text);
alter table public.v2_catalogue_source_overrides add primary key(source_type,source_key);
create table private.provider_health_refresh_queue (usage_date date,model_slug text,provider_model_id text,generation bigint,requested_at timestamp with time zone,retry_after timestamp with time zone,last_error_code text);
create table private.v2_analytics_previous_grains (grain_id uuid default gen_random_uuid(),workspace_id uuid,occurred_at timestamp with time zone,app_id uuid,model_slug text,provider_model_id text,cloudflare_colo text,queued_at timestamp with time zone,transaction_id bigint);
create table public.data_contributions (id uuid,workspace_id uuid,request_id text,occurred_at timestamp with time zone,endpoint text,model_slug text,provider_slug text,object_key text,object_bytes integer,object_sha256 text,retention_until timestamp with time zone,consent_policy_version text,sample_rate_bps integer,classifier_sample_rate_bps integer,sample_bucket integer,redaction_version text,redaction_count integer,discount_bps integer,discount_nanos bigint,input_tokens bigint,output_tokens bigint,status text,attempt_count integer,available_at timestamp with time zone,lease_expires_at timestamp with time zone,last_error text,completed_at timestamp with time zone,created_at timestamp with time zone,updated_at timestamp with time zone);
create table public.gateway_requests (id uuid,created_at timestamp with time zone,workspace_id uuid,request_id text,app_id uuid,endpoint text,model_id text,provider text,native_response_id text,stream boolean,byok boolean,status_code integer,success boolean,error_code text,error_message text,latency_ms integer,generation_ms integer,usage jsonb,cost_nanos bigint,currency text,pricing_lines jsonb,key_id uuid,throughput numeric,location text,auth_method text,oauth_client_id text,oauth_user_id uuid,finish_reason text,end_user_id text,session_id text,trace_data jsonb,canonical_model_id text,provider_attempts jsonb,error_payload jsonb,requested_model_id text,routed_model_id text,usage_total_tokens bigint,usage_input_tokens bigint,usage_output_tokens bigint,usage_reasoning_tokens bigint,usage_input_text_tokens bigint,usage_output_text_tokens bigint,usage_input_image_tokens bigint,usage_output_image_tokens bigint,usage_input_audio_tokens bigint,usage_output_audio_tokens bigint,usage_input_video_tokens bigint,usage_output_video_tokens bigint,usage_image_inputs bigint,usage_image_outputs bigint,usage_audio_inputs bigint,usage_audio_outputs bigint,usage_video_inputs bigint,usage_video_outputs bigint,usage_cached_read_tokens bigint,usage_cached_write_tokens bigint,usage_cached_read_text_tokens bigint,usage_cached_write_text_tokens bigint,usage_cached_write_text_tokens_5m bigint,usage_cached_write_text_tokens_1h bigint,usage_cached_read_image_tokens bigint,usage_cached_write_image_tokens bigint,usage_cached_read_audio_tokens bigint,usage_cached_write_audio_tokens bigint,usage_cached_read_video_tokens bigint,usage_cached_write_video_tokens bigint,usage_input_quad_tokens bigint,usage_output_quad_tokens bigint,usage_total_quad_tokens bigint,usage_text_quad_tokens bigint,usage_rerank_quad_tokens bigint,usage_embedding_quad_tokens bigint,usage_moderation_quad_tokens bigint,usage_ocr_quad_tokens bigint,usage_image_megapixels numeric,usage_audio_seconds numeric,usage_video_pixel_seconds numeric,usage_input_characters bigint,usage_output_characters bigint,usage_total_characters bigint,usage_normalized_at timestamp with time zone,detail_metadata jsonb,usage_video_seconds numeric,usage_embedding_tokens bigint,api_model_id text,pricing_plan text,is_free_variant boolean,realtime_session_id text,provider_ttft_ms integer,gateway_ttft_ms integer,output_speed_tps numeric(30,12),tpot_ms numeric(30,12),itl_ms numeric(30,12),phaseo_overhead_ms integer,client_source_id text,client_source_name text,client_source_kind text,client_source_version text,client_source_detection text,attributed_user_id uuid,attributed_access_role text,attributed_department_id uuid,attributed_department_name text,attributed_department_color text,attribution_basis text);
create table public.public_model_task_daily (usage_date date,taxonomy_slug text,primary_category text,model_slug text,provider_slug text,workspace_count bigint,request_count bigint,input_tokens bigint,output_tokens bigint,updated_at timestamp with time zone);
create table public.public_model_user_usage_daily (day_bucket date,model_id text,provider_id text,actor_hash text,requests bigint,tokens bigint,refreshed_at timestamp with time zone);
create table public.public_model_workspace_usage_weekly (week_start date,model_id text,workspace_hash text,requests bigint,refreshed_at timestamp with time zone);
create table public.request_classification_daily (usage_date date,workspace_id uuid,classifier_id uuid,primary_category text,model_slug text,provider_slug text,request_count bigint,input_tokens bigint,output_tokens bigint,updated_at timestamp with time zone);
create table public.request_classifications (id uuid,contribution_id uuid,workspace_id uuid,classifier_id uuid,primary_category text,labels jsonb,confidence numeric(5,4),model text,service_tier text,latency_ms integer,created_at timestamp with time zone);
create table public.users (user_id uuid,display_name text,default_workspace_id uuid,obfuscate_info boolean,created_at timestamp with time zone,updated_at timestamp with time zone,role text,beta_opt_in boolean,beta_features jsonb,public_profile_enabled boolean,public_profile_slug text,onboarding_state jsonb,onboarding_completed_at timestamp with time zone,declared_country_code text,country_declared_at timestamp with time zone,display_locale text,display_date_style text,display_time_zone text,display_hour_cycle text,display_relative_time text,display_number_notation text,display_light_palette text,display_dark_palette text,display_light_accent text,display_dark_accent text,display_density text,display_code_language text,display_landing_page text);
create table public.v2_analytics_outbox (request_event_id uuid,workspace_id uuid,occurred_at timestamp with time zone,status text,attempt_count integer,available_at timestamp with time zone,last_error text,created_at timestamp with time zone,updated_at timestamp with time zone);
create table public.v2_model_provider_routes (provider_model_id text,model_slug text,provider_slug text,provider_model_slug text,status text,routing_enabled boolean,input_modalities text[],output_modalities text[],regions text[],context_length integer,max_output_tokens integer,effective_from timestamp with time zone,effective_to timestamp with time zone,metadata jsonb,created_at timestamp with time zone,updated_at timestamp with time zone,provider_availability_status text,phaseo_status text,access_scope text,is_stealth boolean,credential_mode text);
create table public.v2_models (model_slug text,lab_slug text,name text,description text,status text,hidden boolean,input_modalities text[],output_modalities text[],family_slug text,announced_at timestamp with time zone,released_at timestamp with time zone,deprecated_at timestamp with time zone,retired_at timestamp with time zone,metadata jsonb,created_at timestamp with time zone,updated_at timestamp with time zone,license text,license_url text,previous_model_slug text,removal_date timestamp with time zone,replacement_model_slug text,variant_kind text,base_model_slug text,catalogue_status text);
create table public.v2_pricing_skus (sku_id uuid,provider_model_id text,sku_code text,version integer,operation text,status text,region text,display_name text,description text,currency text,effective_from timestamp with time zone,effective_to timestamp with time zone,metadata jsonb,created_at timestamp with time zone,updated_at timestamp with time zone,service_tier_slug text,route_variant_id uuid);
create table public.v2_private_usage_daily (rollup_id uuid default gen_random_uuid(),usage_date date,workspace_id uuid,app_id uuid,model_slug text,provider_model_id text,requests bigint,successful_requests bigint,failed_requests bigint,rate_limited_requests bigint,tool_call_count bigint,structured_output_attempts bigint,structured_output_successes bigint,latency_sum_ms bigint,latency_count bigint,generation_sum_ms bigint,generation_count bigint,throughput_sum numeric(30,12),throughput_count bigint,created_at timestamp with time zone,updated_at timestamp with time zone,cloudflare_colo text,tool_call_requests bigint,tool_call_successes bigint,cached_input_tokens numeric(30,12),input_tokens numeric(30,12),gateway_total_sum_ms numeric(30,3),gateway_total_count bigint,internal_dispatch_sum_ms numeric(30,3),internal_dispatch_count bigint,upstream_attempts bigint,failed_upstream_attempts bigint,cost_nanos numeric(30,0));
create table public.v2_private_usage_daily_meters (rollup_id uuid default gen_random_uuid(),meter_key text,modality text,unit text,quantity numeric(30,12),created_at timestamp with time zone,updated_at timestamp with time zone);
create table public.v2_public_effective_pricing_daily (model_slug text,usage_date date,provider_id text,pricing_plan text,input_tokens numeric(30,12),output_tokens numeric(30,12),cached_read_tokens numeric(30,12),cached_write_tokens numeric(30,12),input_cost_nanos numeric(30,12),output_cost_nanos numeric(30,12),total_cost_nanos numeric(30,12),updated_at timestamp with time zone);
create table public.v2_public_provider_health_daily (usage_date date,model_slug text,provider_model_id text,provider_slug text,request_count bigint,successful_request_count bigint,attempt_count bigint,successful_attempts bigint,failed_attempts bigint,fallback_attempts bigint,latency_sum_ms bigint,latency_count bigint,updated_at timestamp with time zone);
create table public.v2_public_usage_daily (rollup_id uuid default gen_random_uuid(),usage_date date,app_id uuid,model_slug text,provider_model_id text,requests bigint,successful_requests bigint,failed_requests bigint,rate_limited_requests bigint,tool_call_count bigint,structured_output_attempts bigint,structured_output_successes bigint,latency_sum_ms bigint,latency_count bigint,generation_sum_ms bigint,generation_count bigint,throughput_sum numeric(30,12),throughput_count bigint,created_at timestamp with time zone,updated_at timestamp with time zone,cloudflare_colo text,tool_call_requests bigint,tool_call_successes bigint,cached_input_tokens numeric(30,12),input_tokens numeric(30,12),gateway_total_sum_ms numeric(30,3),gateway_total_count bigint,internal_dispatch_sum_ms numeric(30,3),internal_dispatch_count bigint,upstream_attempts bigint,failed_upstream_attempts bigint,cost_nanos numeric(30,0));
create table public.v2_public_usage_daily_meters (rollup_id uuid default gen_random_uuid(),meter_key text,modality text,unit text,quantity numeric(30,12),created_at timestamp with time zone,updated_at timestamp with time zone);
create table public.v2_public_usage_hourly (rollup_id uuid default gen_random_uuid(),bucket_start timestamp with time zone,app_id uuid,model_slug text,provider_model_id text,requests bigint,successful_requests bigint,failed_requests bigint,rate_limited_requests bigint,tool_call_count bigint,structured_output_attempts bigint,structured_output_successes bigint,latency_sum_ms bigint,latency_count bigint,generation_sum_ms bigint,generation_count bigint,throughput_sum numeric(30,12),throughput_count bigint,created_at timestamp with time zone,updated_at timestamp with time zone,cloudflare_colo text,tool_call_requests bigint,tool_call_successes bigint,cached_input_tokens numeric(30,12),input_tokens numeric(30,12),gateway_total_sum_ms numeric(30,3),gateway_total_count bigint,internal_dispatch_sum_ms numeric(30,3),internal_dispatch_count bigint,upstream_attempts bigint,failed_upstream_attempts bigint,cost_nanos numeric(30,0));
create table public.v2_public_usage_hourly_meters (rollup_id uuid default gen_random_uuid(),meter_key text,modality text,unit text,quantity numeric(30,12),created_at timestamp with time zone,updated_at timestamp with time zone);
create table public.v2_request_attempts (attempt_id uuid,request_event_id uuid,attempt_number smallint,provider_model_id text,started_at timestamp with time zone,completed_at timestamp with time zone,status_code integer,success boolean,error_code text,failure_class text,upstream_response_id text,latency_ms integer,safe_metadata jsonb,created_at timestamp with time zone,cloudflare_colo text);
create table public.v2_request_facts (request_event_id uuid,workspace_id uuid,request_id text,occurred_at timestamp with time zone,app_id uuid,key_id uuid,endpoint text,requested_model_input text,requested_model_slug text,routed_model_slug text,provider_model_id text,status_code integer,success boolean,error_code text,stop_reason text,tool_call_count integer,structured_output_attempted boolean,structured_output_succeeded boolean,stream boolean,byok boolean,latency_ms integer,time_to_first_token_ms integer,generation_ms integer,queue_ms integer,upstream_latency_ms integer,upstream_attempt_count smallint,throughput numeric(30,12),user_agent text,sdk_name text,sdk_version text,client_version text,region text,safe_metadata jsonb,created_at timestamp with time zone,cloudflare_colo text,internal_dispatch_ms numeric(12,3),gateway_total_ms numeric(12,3),session_id text,end_user_id text,auth_method text,native_response_id text,cost_nanos bigint,currency text,tool_call_succeeded boolean,gateway_request_id uuid,gateway_request_created_at timestamp with time zone,edge_country text,edge_continent text,provider_ttft_ms integer,gateway_ttft_ms integer,output_speed_tps numeric(30,12),tpot_ms numeric(30,12),itl_ms numeric(30,12),phaseo_overhead_ms integer,client_source_id text,client_source_name text,client_source_kind text,client_source_version text,client_source_detection text,service_tier_requested text,service_tier_observed text,service_tier_slug text);
create table public.v2_request_pricing_lines (pricing_line_id uuid,request_event_id uuid,sku_id uuid,sku_meter_id uuid,meter_key text,quantity numeric(30,12),unit text,unit_price_nanos numeric(30,12),charged_nanos bigint,created_at timestamp with time zone);
create table public.v2_request_usage (usage_id uuid,request_event_id uuid,sku_meter_id uuid,meter_key text,modality text,unit text,quantity numeric(30,12),source text,billable boolean,sequence integer,created_at timestamp with time zone);
create table public.v2_rollup_refresh_state (rollup_name text,bucket_start timestamp with time zone,last_started_at timestamp with time zone,last_completed_at timestamp with time zone,source_watermark timestamp with time zone,status text,error_message text,updated_at timestamp with time zone);
create table public.v2_route_capabilities (provider_model_id text,capability_id text,status text,max_input_tokens integer,max_output_tokens integer,params jsonb,effective_from timestamp with time zone,effective_to timestamp with time zone,metadata jsonb,created_at timestamp with time zone,updated_at timestamp with time zone);
create table public.workspace_classifiers (id uuid,workspace_id uuid,slug text,name text,description text,kind text,instructions text,categories jsonb,model text,service_tier text,sample_rate_bps integer,enabled boolean,created_by uuid,created_at timestamp with time zone,updated_at timestamp with time zone);
alter table private.v2_analytics_previous_grains add constraint v2_analytics_previous_grains_pkey PRIMARY KEY (grain_id);
alter table public.data_contributions add constraint data_contributions_pkey PRIMARY KEY (id);
alter table public.data_contributions add constraint data_contributions_workspace_id_request_id_key UNIQUE (workspace_id, request_id);
alter table public.v2_model_provider_routes add constraint v2_model_provider_routes_pkey PRIMARY KEY (provider_model_id);
alter table public.v2_model_provider_routes add constraint v2_model_provider_routes_provider_model_key UNIQUE (provider_slug, provider_model_id);
alter table public.v2_request_facts add constraint v2_request_facts_pkey PRIMARY KEY (request_event_id);
alter table public.v2_request_facts add constraint v2_request_facts_request_key UNIQUE (workspace_id, request_id);
alter table public.v2_models add constraint v2_models_pkey PRIMARY KEY (model_slug);
alter table public.public_model_task_daily add constraint public_model_task_daily_pkey PRIMARY KEY (usage_date, taxonomy_slug, primary_category, model_slug, provider_slug);
alter table public.public_model_user_usage_daily add constraint public_model_user_usage_daily_pkey PRIMARY KEY (day_bucket, model_id, provider_id, actor_hash);
alter table public.public_model_workspace_usage_weekly add constraint public_model_workspace_usage_weekly_pkey PRIMARY KEY (week_start, model_id, workspace_hash);
alter table public.request_classification_daily add constraint request_classification_daily_pkey PRIMARY KEY (usage_date, workspace_id, classifier_id, primary_category, model_slug, provider_slug);
alter table public.v2_analytics_outbox add constraint v2_analytics_outbox_pkey PRIMARY KEY (request_event_id);
alter table public.v2_private_usage_daily add constraint v2_private_usage_daily_pkey PRIMARY KEY (rollup_id);
alter table public.v2_public_effective_pricing_daily add constraint v2_public_effective_pricing_daily_pkey PRIMARY KEY (model_slug, usage_date, provider_id, pricing_plan);
alter table public.v2_public_usage_daily add constraint v2_public_usage_daily_pkey PRIMARY KEY (rollup_id);
alter table public.v2_public_usage_hourly add constraint v2_public_usage_hourly_pkey PRIMARY KEY (rollup_id);
alter table public.v2_rollup_refresh_state add constraint v2_rollup_refresh_state_pkey PRIMARY KEY (rollup_name, bucket_start);
CREATE OR REPLACE FUNCTION public.get_public_period_leaderboard(p_metric text DEFAULT 'text_tokens'::text, p_days integer DEFAULT 7, p_as_of timestamp with time zone DEFAULT now())
 RETURNS TABLE(model_id text, current numeric, previous numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if p_days is null or p_days not in (1, 7, 30) or p_as_of is null
    or p_metric is null or p_metric not in (
      'text_tokens', 'image_inputs', 'image_outputs', 'audio_tokens', 'audio_seconds',
      'speech_seconds', 'transcription_seconds', 'video_tokens', 'video_seconds',
      'cached_tokens', 'embedding_tokens', 'rerank_quad_tokens', 'tool_calls', 'users'
    ) then
    raise exception 'Invalid ranking metric or period';
  end if;

  return query
  with periods as (
    select true as is_current, p_as_of - p_days * interval '24 hours' as start_at, p_as_of as end_at
    union all
    select false, p_as_of - 2 * p_days * interval '24 hours', p_as_of - p_days * interval '24 hours'
  ), windows as (
    select p.*,
      (p.start_at at time zone 'UTC')::date + case
        when (p.start_at at time zone 'UTC')::time = time '00:00' then 0 else 1 end as full_from,
      (p.end_at at time zone 'UTC')::date as full_to
    from periods p
  ), edges as materialized (
    select w.is_current, w.start_at, least(w.full_from::timestamp at time zone 'UTC', w.end_at) as end_at
    from windows w where w.start_at < (w.full_from::timestamp at time zone 'UTC')
    union all
    select w.is_current, greatest(w.full_to::timestamp at time zone 'UTC', w.start_at), w.end_at
    from windows w where (w.full_to::timestamp at time zone 'UTC') < w.end_at
  ), quantities as (
    select w.is_current, u.model_id, case when p_metric = 'tool_calls' then u.tool_call_count::numeric
      else public.public_ranking_metric_value(p_metric, u.meters) end as value
    from windows w
    cross join lateral public.get_public_ranking_usage_window(w.start_at, w.end_at) u
    where p_metric <> 'users'
  ), actors as (
    select w.is_current, d.model_id, d.actor_hash
    from windows w
    join public.public_model_user_usage_daily d on d.day_bucket >= w.full_from and d.day_bucket < w.full_to
    where p_metric = 'users'
    union all
    -- Match the actor identity and model normalization used by the daily user rollup.
    select e.is_current,
      public.public_leaderboard_model_id(
        coalesce(fact.routed_model_slug, fact.requested_model_slug),
        coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input),
        fact.requested_model_input, fact.routed_model_slug, authoritative.api_model_id,
        route.provider_slug, authoritative.pricing_plan, authoritative.is_free_variant),
      md5('public-model-user:' || coalesce(
        nullif(fact.safe_metadata->>'oauth_user_id', '')::uuid::text,
        nullif(fact.end_user_id, ''), fact.workspace_id::text, fact.key_id::text
      ))
    from edges e
    join public.v2_request_facts fact on fact.occurred_at >= e.start_at and fact.occurred_at < e.end_at
    left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
    left join public.gateway_requests authoritative on authoritative.id = fact.gateway_request_id
      and authoritative.created_at = fact.gateway_request_created_at
    where p_metric = 'users' and fact.success is true
  ), totals as (
    select q.model_id, coalesce(sum(q.value) filter (where q.is_current), 0) as current,
      coalesce(sum(q.value) filter (where not q.is_current), 0) as previous
    from quantities q group by q.model_id
    union all
    select a.model_id, count(distinct a.actor_hash) filter (where a.is_current)::numeric,
      count(distinct a.actor_hash) filter (where not a.is_current)::numeric
    from actors a group by a.model_id
  )
  select t.model_id, t.current, t.previous
  from totals t
  join public.v2_models m on m.model_slug = t.model_id and m.hidden = false and m.status <> 'disabled'
  where lower(t.model_id) not in ('unknown', 'other') and (t.current > 0 or t.previous > 0)
  order by t.current desc, t.model_id
  limit 500;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_ranking_usage_window(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(model_id text, provider_id text, app_id uuid, requests bigint, successful_requests bigint, tool_call_count bigint, meters jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_full_from date := (p_from at time zone 'UTC')::date + case
    when (p_from at time zone 'UTC')::time = time '00:00' then 0 else 1 end;
  v_full_to date := (p_to at time zone 'UTC')::date;
begin
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '365 days' then
    raise exception 'Invalid ranking window';
  end if;
  return query
  with edges as (
    select p_from as start_at, least(v_full_from::timestamp at time zone 'UTC', p_to) as end_at
    where p_from < (v_full_from::timestamp at time zone 'UTC')
    union all
    select greatest(v_full_to::timestamp at time zone 'UTC', p_from), p_to
    where (v_full_to::timestamp at time zone 'UTC') < p_to
      -- A range within a single UTC day is already entirely in the first edge.
      and v_full_to >= v_full_from
  ), daily_rows as materialized (
    select d.rollup_id, d.model_slug, d.provider_model_id, d.app_id,
      d.requests, d.successful_requests, d.tool_call_count
    from public.v2_public_usage_daily d
    where d.usage_date >= v_full_from and d.usage_date < v_full_to
  ), daily_meter_totals as (
    select u.rollup_id, u.meter_key, sum(u.quantity) as quantity
    from public.v2_public_usage_daily_meters u
    join daily_rows d on d.rollup_id = u.rollup_id
    group by u.rollup_id, u.meter_key
  ), daily_meters as (
    select m.rollup_id, jsonb_object_agg(m.meter_key, m.quantity) as meters
    from daily_meter_totals m group by m.rollup_id
  ), edge_rows as materialized (
    select f.request_event_id, f.routed_model_slug, f.requested_model_slug,
      f.provider_model_id, f.app_id, f.success, f.tool_call_count
    from edges e
    join public.v2_request_facts f on f.occurred_at >= e.start_at and f.occurred_at < e.end_at
    where lower(coalesce(f.routed_model_slug, f.requested_model_slug)) not in ('unknown', 'other')
  ), edge_meter_totals as (
    select u.request_event_id, u.meter_key, sum(u.quantity) as quantity
    from public.v2_request_usage u
    join edge_rows f on f.request_event_id = u.request_event_id
    group by u.request_event_id, u.meter_key
  ), edge_meters as (
    select m.request_event_id, jsonb_object_agg(m.meter_key, m.quantity) as meters
    from edge_meter_totals m group by m.request_event_id
  ), usage_rows as (
    select d.model_slug as model_id, d.provider_model_id, d.app_id, d.requests,
      d.successful_requests, d.tool_call_count, meter_values.meters
    from daily_rows d
    left join daily_meters meter_values on meter_values.rollup_id = d.rollup_id
    union all
    select coalesce(f.routed_model_slug, f.requested_model_slug), f.provider_model_id, f.app_id,
      1::bigint, case when f.success then 1 else 0 end::bigint, f.tool_call_count::bigint, meter_values.meters
    from edge_rows f
    left join edge_meters meter_values on meter_values.request_event_id = f.request_event_id
  )
  select u.model_id, r.provider_slug, u.app_id, u.requests, u.successful_requests, u.tool_call_count, coalesce(u.meters, '{}'::jsonb)
  from usage_rows u
  join public.v2_models m on m.model_slug = u.model_id and m.hidden = false and m.status <> 'disabled'
  join public.v2_model_provider_routes r on r.provider_model_id = u.provider_model_id
    and coalesce(r.is_stealth, false) = false and r.routing_enabled = true
    and r.status in ('active', 'degraded')
    and (r.effective_from is null or r.effective_from <= now())
    and (r.effective_to is null or r.effective_to > now())
  where lower(u.model_id) not in ('unknown', 'other');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_summary_stats()
 RETURNS TABLE(total_requests_24h bigint, total_tokens_24h bigint, total_models integer, total_providers integer, avg_latency_ms numeric, success_rate_24h numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with meters as (
    select meter.rollup_id, sum(meter.quantity) filter (where meter.meter_key in ('input_tokens','output_tokens'))::bigint as tokens
    from public.v2_public_usage_hourly_meters meter group by meter.rollup_id
  ), aggregate as (
    select sum(usage.requests)::bigint as requests, sum(coalesce(meters.tokens,0))::bigint as tokens,
      count(distinct usage.model_slug)::integer as models, count(distinct route.provider_slug)::integer as providers,
      sum(usage.latency_sum_ms)::numeric as latency_sum, sum(usage.latency_count)::bigint as latency_count,
      sum(usage.successful_requests)::bigint as successes
    from public.v2_public_usage_hourly usage
    left join meters on meters.rollup_id = usage.rollup_id
    left join public.v2_model_provider_routes route on route.provider_model_id = usage.provider_model_id
    where usage.bucket_start >= now() - interval '24 hours'
  )
  select coalesce(requests,0), coalesce(tokens,0), coalesce(models,0), coalesce(providers,0),
    round(latency_sum / nullif(latency_count,0),0), round(successes::numeric / nullif(requests,0),4)
  from aggregate;
$function$
;
CREATE OR REPLACE FUNCTION public.process_v2_analytics_outbox(p_limit integer DEFAULT 250)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 2000));
  v_selected integer := 0;
  v_private_grains integer := 0;
  v_public_daily_grains integer := 0;
  v_public_hourly_grains integer := 0;
  v_rollup_id uuid;
  grain record;
begin
  create temporary table if not exists pg_temp.v2_rollup_batch (
    request_event_id uuid primary key,
    workspace_id uuid not null,
    occurred_at timestamptz not null,
    app_id uuid,
    model_slug text,
    provider_model_id text,
    cloudflare_colo text
  ) on commit drop;
  truncate table pg_temp.v2_rollup_batch;

  insert into pg_temp.v2_rollup_batch (
    request_event_id, workspace_id, occurred_at, app_id, model_slug,
    provider_model_id, cloudflare_colo
  )
  select
    outbox.request_event_id,
    fact.workspace_id,
    fact.occurred_at,
    fact.app_id,
    coalesce(fact.routed_model_slug, fact.requested_model_slug),
    fact.provider_model_id,
    fact.cloudflare_colo
  from public.v2_analytics_outbox outbox
  join public.v2_request_facts fact on fact.request_event_id = outbox.request_event_id
  where outbox.status in ('pending', 'failed')
    and outbox.available_at <= now()
  order by outbox.occurred_at, outbox.request_event_id
  for update of outbox skip locked
  limit case when exists(select 1 from private.v2_analytics_previous_grains)
    then greatest(0,v_limit-least(5,v_limit)) else v_limit end;


  get diagnostics v_selected = row_count;
  create temporary table if not exists pg_temp.v2_previous_grain_batch
    (like private.v2_analytics_previous_grains including defaults) on commit drop;
  truncate table pg_temp.v2_previous_grain_batch;
  alter table pg_temp.v2_previous_grain_batch add column if not exists transaction_id bigint;
  insert into pg_temp.v2_previous_grain_batch(grain_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo,queued_at,transaction_id)
  select previous.* from private.v2_analytics_previous_grains previous
  order by previous.queued_at,previous.grain_id for update skip locked limit greatest(0,v_limit-v_selected);
  insert into pg_temp.v2_rollup_batch
    (request_event_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo)
  select grain_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo
  from pg_temp.v2_previous_grain_batch;
  v_selected := v_selected + (select count(*) from pg_temp.v2_previous_grain_batch);

  if v_selected = 0 then
    return jsonb_build_object(
      'selected', 0,
      'private_grains', 0,
      'public_daily_grains', 0,
      'public_hourly_grains', 0
    );
  end if;

  update public.v2_analytics_outbox outbox
  set status = 'processing', updated_at = now()
  where outbox.request_event_id in (select batch.request_event_id from pg_temp.v2_rollup_batch batch);

  for grain in
    select distinct
      batch.workspace_id,
      batch.occurred_at::date as usage_date,
      batch.app_id,
      batch.model_slug,
      batch.provider_model_id,
      batch.cloudflare_colo
    from pg_temp.v2_rollup_batch batch
    where batch.model_slug is not null
  loop
    delete from public.v2_private_usage_daily rollup
    where rollup.workspace_id = grain.workspace_id
      and rollup.usage_date = grain.usage_date
      and rollup.app_id is not distinct from grain.app_id
      and rollup.model_slug = grain.model_slug
      and rollup.provider_model_id is not distinct from grain.provider_model_id
      and rollup.cloudflare_colo is not distinct from grain.cloudflare_colo;

    insert into public.v2_private_usage_daily (
      usage_date, workspace_id, app_id, model_slug, provider_model_id, cloudflare_colo,
      requests, successful_requests, failed_requests, rate_limited_requests,
      tool_call_count, tool_call_requests, tool_call_successes,
      structured_output_attempts, structured_output_successes,
      latency_sum_ms, latency_count, generation_sum_ms, generation_count,
      throughput_sum, throughput_count, gateway_total_sum_ms, gateway_total_count,
      internal_dispatch_sum_ms, internal_dispatch_count,
      upstream_attempts, failed_upstream_attempts, cached_input_tokens, input_tokens, cost_nanos
    )
    select
      grain.usage_date, grain.workspace_id, grain.app_id, grain.model_slug,
      grain.provider_model_id, grain.cloudflare_colo,
      count(*), count(*) filter (where fact.success), count(*) filter (where not fact.success),
      count(*) filter (where fact.status_code = 429),
      coalesce(sum(fact.tool_call_count), 0),
      count(*) filter (where fact.tool_call_count > 0),
      count(*) filter (where fact.tool_call_count > 0 and fact.tool_call_succeeded is true),
      count(*) filter (where fact.structured_output_attempted),
      count(*) filter (where fact.structured_output_attempted and fact.structured_output_succeeded),
      coalesce(sum(fact.latency_ms), 0), count(fact.latency_ms),
      coalesce(sum(fact.generation_ms), 0), count(fact.generation_ms),
      coalesce(sum(fact.throughput), 0), count(fact.throughput),
      coalesce(sum(fact.gateway_total_ms), 0), count(fact.gateway_total_ms),
      coalesce(sum(fact.internal_dispatch_ms), 0), count(fact.internal_dispatch_ms),
      coalesce(sum(attempts.attempts), 0), coalesce(sum(attempts.failed_attempts), 0),
      coalesce(sum(usage.cached_input_tokens), 0), coalesce(sum(usage.input_tokens), 0),
      coalesce(sum(fact.cost_nanos), 0)
    from public.v2_request_facts fact
    left join lateral (
      select count(*)::bigint as attempts,
        count(*) filter (where not attempt.success)::bigint as failed_attempts
      from public.v2_request_attempts attempt
      where attempt.request_event_id = fact.request_event_id
    ) attempts on true
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'cached_input_tokens'), 0) as cached_input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0) as input_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where fact.workspace_id = grain.workspace_id
      and fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    having count(*) > 0
    returning rollup_id into v_rollup_id;

    insert into public.v2_private_usage_daily_meters (
      rollup_id, meter_key, modality, unit, quantity
    )
    select v_rollup_id, meter.meter_key, meter.modality, meter.unit, sum(meter.quantity)
    from public.v2_request_usage meter
    join public.v2_request_facts fact on fact.request_event_id = meter.request_event_id
    where fact.workspace_id = grain.workspace_id
      and fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    group by meter.meter_key, meter.modality, meter.unit;

    v_private_grains := v_private_grains + 1;
  end loop;

  for grain in
    select distinct
      batch.occurred_at::date as usage_date,
      batch.app_id,
      batch.model_slug,
      batch.provider_model_id,
      batch.cloudflare_colo
    from pg_temp.v2_rollup_batch batch
    where batch.model_slug is not null
  loop
    delete from public.v2_public_usage_daily rollup
    where rollup.usage_date = grain.usage_date
      and rollup.app_id is not distinct from grain.app_id
      and rollup.model_slug = grain.model_slug
      and rollup.provider_model_id is not distinct from grain.provider_model_id
      and rollup.cloudflare_colo is not distinct from grain.cloudflare_colo;

    insert into public.v2_public_usage_daily (
      usage_date, app_id, model_slug, provider_model_id, cloudflare_colo,
      requests, successful_requests, failed_requests, rate_limited_requests,
      tool_call_count, tool_call_requests, tool_call_successes,
      structured_output_attempts, structured_output_successes,
      latency_sum_ms, latency_count, generation_sum_ms, generation_count,
      throughput_sum, throughput_count, gateway_total_sum_ms, gateway_total_count,
      internal_dispatch_sum_ms, internal_dispatch_count,
      upstream_attempts, failed_upstream_attempts, cached_input_tokens, input_tokens, cost_nanos
    )
    select
      grain.usage_date, grain.app_id, grain.model_slug, grain.provider_model_id, grain.cloudflare_colo,
      count(*), count(*) filter (where fact.success), count(*) filter (where not fact.success),
      count(*) filter (where fact.status_code = 429),
      coalesce(sum(fact.tool_call_count), 0),
      count(*) filter (where fact.tool_call_count > 0),
      count(*) filter (where fact.tool_call_count > 0 and fact.tool_call_succeeded is true),
      count(*) filter (where fact.structured_output_attempted),
      count(*) filter (where fact.structured_output_attempted and fact.structured_output_succeeded),
      coalesce(sum(fact.latency_ms), 0), count(fact.latency_ms),
      coalesce(sum(fact.generation_ms), 0), count(fact.generation_ms),
      coalesce(sum(fact.throughput), 0), count(fact.throughput),
      coalesce(sum(fact.gateway_total_ms), 0), count(fact.gateway_total_ms),
      coalesce(sum(fact.internal_dispatch_ms), 0), count(fact.internal_dispatch_ms),
      coalesce(sum(attempts.attempts), 0), coalesce(sum(attempts.failed_attempts), 0),
      coalesce(sum(usage.cached_input_tokens), 0), coalesce(sum(usage.input_tokens), 0),
      coalesce(sum(fact.cost_nanos), 0)
    from public.v2_request_facts fact
    left join lateral (
      select count(*)::bigint as attempts,
        count(*) filter (where not attempt.success)::bigint as failed_attempts
      from public.v2_request_attempts attempt
      where attempt.request_event_id = fact.request_event_id
    ) attempts on true
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'cached_input_tokens'), 0) as cached_input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0) as input_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    having count(*) > 0
    returning rollup_id into v_rollup_id;

    insert into public.v2_public_usage_daily_meters (
      rollup_id, meter_key, modality, unit, quantity
    )
    select v_rollup_id, meter.meter_key, meter.modality, meter.unit, sum(meter.quantity)
    from public.v2_request_usage meter
    join public.v2_request_facts fact on fact.request_event_id = meter.request_event_id
    where fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    group by meter.meter_key, meter.modality, meter.unit;

    v_public_daily_grains := v_public_daily_grains + 1;
  end loop;

  for grain in
    select distinct
      date_trunc('hour', batch.occurred_at) as bucket_start,
      batch.app_id,
      batch.model_slug,
      batch.provider_model_id,
      batch.cloudflare_colo
    from pg_temp.v2_rollup_batch batch
    where batch.model_slug is not null
  loop
    delete from public.v2_public_usage_hourly rollup
    where rollup.bucket_start = grain.bucket_start
      and rollup.app_id is not distinct from grain.app_id
      and rollup.model_slug = grain.model_slug
      and rollup.provider_model_id is not distinct from grain.provider_model_id
      and rollup.cloudflare_colo is not distinct from grain.cloudflare_colo;

    insert into public.v2_public_usage_hourly (
      bucket_start, app_id, model_slug, provider_model_id, cloudflare_colo,
      requests, successful_requests, failed_requests, rate_limited_requests,
      tool_call_count, tool_call_requests, tool_call_successes,
      structured_output_attempts, structured_output_successes,
      latency_sum_ms, latency_count, generation_sum_ms, generation_count,
      throughput_sum, throughput_count, gateway_total_sum_ms, gateway_total_count,
      internal_dispatch_sum_ms, internal_dispatch_count,
      upstream_attempts, failed_upstream_attempts, cached_input_tokens, input_tokens, cost_nanos
    )
    select
      grain.bucket_start, grain.app_id, grain.model_slug, grain.provider_model_id, grain.cloudflare_colo,
      count(*), count(*) filter (where fact.success), count(*) filter (where not fact.success),
      count(*) filter (where fact.status_code = 429),
      coalesce(sum(fact.tool_call_count), 0),
      count(*) filter (where fact.tool_call_count > 0),
      count(*) filter (where fact.tool_call_count > 0 and fact.tool_call_succeeded is true),
      count(*) filter (where fact.structured_output_attempted),
      count(*) filter (where fact.structured_output_attempted and fact.structured_output_succeeded),
      coalesce(sum(fact.latency_ms), 0), count(fact.latency_ms),
      coalesce(sum(fact.generation_ms), 0), count(fact.generation_ms),
      coalesce(sum(fact.throughput), 0), count(fact.throughput),
      coalesce(sum(fact.gateway_total_ms), 0), count(fact.gateway_total_ms),
      coalesce(sum(fact.internal_dispatch_ms), 0), count(fact.internal_dispatch_ms),
      coalesce(sum(attempts.attempts), 0), coalesce(sum(attempts.failed_attempts), 0),
      coalesce(sum(usage.cached_input_tokens), 0), coalesce(sum(usage.input_tokens), 0),
      coalesce(sum(fact.cost_nanos), 0)
    from public.v2_request_facts fact
    left join lateral (
      select count(*)::bigint as attempts,
        count(*) filter (where not attempt.success)::bigint as failed_attempts
      from public.v2_request_attempts attempt
      where attempt.request_event_id = fact.request_event_id
    ) attempts on true
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'cached_input_tokens'), 0) as cached_input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0) as input_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where fact.occurred_at >= grain.bucket_start
      and fact.occurred_at < grain.bucket_start + interval '1 hour'
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    having count(*) > 0
    returning rollup_id into v_rollup_id;

    insert into public.v2_public_usage_hourly_meters (
      rollup_id, meter_key, modality, unit, quantity
    )
    select v_rollup_id, meter.meter_key, meter.modality, meter.unit, sum(meter.quantity)
    from public.v2_request_usage meter
    join public.v2_request_facts fact on fact.request_event_id = meter.request_event_id
    where fact.occurred_at >= grain.bucket_start
      and fact.occurred_at < grain.bucket_start + interval '1 hour'
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    group by meter.meter_key, meter.modality, meter.unit;

    v_public_hourly_grains := v_public_hourly_grains + 1;
  end loop;

  insert into public.v2_rollup_refresh_state (
    rollup_name, bucket_start, last_started_at, last_completed_at, source_watermark, status, error_message, updated_at
  )
  select 'private_daily', date_trunc('day', batch.occurred_at), now(), now(), max(batch.occurred_at), 'complete', null, now()
  from pg_temp.v2_rollup_batch batch
  group by date_trunc('day', batch.occurred_at)
  on conflict (rollup_name, bucket_start) do update set
    last_started_at = excluded.last_started_at,
    last_completed_at = excluded.last_completed_at,
    source_watermark = excluded.source_watermark,
    status = excluded.status,
    error_message = null,
    updated_at = now();

  insert into public.v2_rollup_refresh_state (
    rollup_name, bucket_start, last_started_at, last_completed_at, source_watermark, status, error_message, updated_at
  )
  select 'public_hourly', date_trunc('hour', batch.occurred_at), now(), now(), max(batch.occurred_at), 'complete', null, now()
  from pg_temp.v2_rollup_batch batch
  group by date_trunc('hour', batch.occurred_at)
  on conflict (rollup_name, bucket_start) do update set
    last_started_at = excluded.last_started_at,
    last_completed_at = excluded.last_completed_at,
    source_watermark = excluded.source_watermark,
    status = excluded.status,
    error_message = null,
    updated_at = now();

  update public.v2_analytics_outbox outbox
  set status = 'complete', last_error = null, updated_at = now()
  where outbox.request_event_id in (select batch.request_event_id from pg_temp.v2_rollup_batch batch);


  delete from private.v2_analytics_previous_grains
  where grain_id in (select grain_id from pg_temp.v2_previous_grain_batch);
  return jsonb_build_object(
    'selected', v_selected,
    'private_grains', v_private_grains,
    'public_daily_grains', v_public_daily_grains,
    'public_hourly_grains', v_public_hourly_grains
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_public_model_task_daily(p_since date DEFAULT (CURRENT_DATE - 1))
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('refresh_public_model_task_daily')
  );

  delete from public.public_model_task_daily
  where usage_date >= coalesce(p_since, current_date - 1);

  insert into public.public_model_task_daily (
    usage_date, taxonomy_slug, primary_category, model_slug, provider_slug,
    workspace_count, request_count, input_tokens, output_tokens, updated_at
  )
  select
    daily.usage_date,
    classifier.slug,
    daily.primary_category,
    daily.model_slug,
    daily.provider_slug,
    count(*) as workspace_count,
    sum(daily.request_count) as request_count,
    sum(daily.input_tokens) as input_tokens,
    sum(daily.output_tokens) as output_tokens,
    now()
  from public.request_classification_daily daily
  join public.workspace_classifiers classifier on classifier.id = daily.classifier_id
  where daily.usage_date >= coalesce(p_since, current_date - 1)
    and classifier.kind = 'phaseo_task'
  group by daily.usage_date, classifier.slug, daily.primary_category,
    daily.model_slug, daily.provider_slug
  on conflict (usage_date, taxonomy_slug, primary_category, model_slug, provider_slug)
  do update set
    workspace_count = excluded.workspace_count,
    request_count = excluded.request_count,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    updated_at = excluded.updated_at;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_public_model_user_usage_daily(p_since timestamp with time zone DEFAULT (now() - '2 days'::interval), p_until timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_since date := (p_since at time zone 'utc')::date;
  v_until date := ((p_until - interval '1 microsecond') at time zone 'utc')::date;
begin
  delete from public.public_model_user_usage_daily
  where day_bucket >= v_since and day_bucket <= v_until;
  insert into public.public_model_user_usage_daily
    (day_bucket, model_id, provider_id, actor_hash, requests, tokens, refreshed_at)
  with normalized as (
    select (fact.occurred_at at time zone 'utc')::date as day_bucket,
      public.public_leaderboard_model_id(
        coalesce(fact.routed_model_slug, fact.requested_model_slug),
        coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input),
        fact.requested_model_input, fact.routed_model_slug, request.api_model_id,
        route.provider_slug, request.pricing_plan, request.is_free_variant
      ) as model_id,
      coalesce(nullif(route.provider_slug, ''), 'unknown') as provider_id,
      coalesce(
        nullif(fact.safe_metadata->>'oauth_user_id', '')::uuid::text,
        nullif(fact.end_user_id, ''), fact.workspace_id::text, fact.key_id::text
      ) as actor_key,
      public.gateway_usage_nonnegative_bigint(coalesce(
        public.gateway_usage_total_tokens(usage.payload), usage.total_tokens, 0
      )) as total_tokens
    from public.v2_request_facts fact
    left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
    left join public.gateway_requests request
      on request.id = fact.gateway_request_id and request.created_at = fact.gateway_request_created_at
    left join lateral (
      select jsonb_object_agg(meter_key, quantity) as payload,
        sum(quantity) filter (where meter_key in ('input_tokens','output_tokens')) as total_tokens
      from (
        select meter.meter_key, sum(meter.quantity) as quantity
        from public.v2_request_usage meter
        where meter.request_event_id = fact.request_event_id
        group by meter.meter_key
      ) meters
    ) usage on true
    where fact.occurred_at >= (v_since::timestamp at time zone 'utc')
      and fact.occurred_at < p_until and fact.success is true
  )
  select day_bucket, model_id, provider_id, md5('public-model-user:' || actor_key),
    count(*)::bigint, sum(total_tokens)::bigint, now()
  from normalized
  where actor_key is not null and model_id is not null and model_id <> ''
    and lower(model_id) not in ('unknown', 'other')
  group by day_bucket, model_id, provider_id, md5('public-model-user:' || actor_key);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_public_model_workspace_usage_weekly(p_since timestamp with time zone DEFAULT (now() - '84 days'::interval), p_until timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_since_week date := date_trunc('week', p_since at time zone 'utc')::date;
  v_until_week date := date_trunc('week', (p_until - interval '1 microsecond') at time zone 'utc')::date;
begin
  delete from public.public_model_workspace_usage_weekly
  where week_start >= v_since_week and week_start <= v_until_week;
  insert into public.public_model_workspace_usage_weekly
    (week_start, model_id, workspace_hash, requests, refreshed_at)
  select date_trunc('week', fact.occurred_at at time zone 'utc')::date,
    coalesce(nullif(fact.routed_model_slug,''),nullif(fact.requested_model_slug,'')),
    md5('public-model-workspace:' || fact.workspace_id::text), count(*)::bigint, now()
  from public.v2_request_facts fact
  where fact.occurred_at >= p_since and fact.occurred_at < p_until
    and fact.success is true and fact.workspace_id is not null
    and coalesce(nullif(fact.routed_model_slug,''),nullif(fact.requested_model_slug,'')) is not null
    and lower(coalesce(nullif(fact.routed_model_slug,''),nullif(fact.requested_model_slug,''))) not in ('unknown','other')
  group by 1,2,3;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_v2_public_effective_pricing_daily()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  source_line public.v2_request_pricing_lines%rowtype;
  direction integer;
  target_model text;
  target_date date;
  target_provider text;
  target_plan text;
  is_input boolean;
  is_output boolean;
  is_cached_read boolean;
  is_cached_write boolean;
begin
  if tg_op = 'DELETE' then
    source_line := old;
    direction := -1;
  else
    source_line := new;
    direction := 1;
  end if;

  select
    coalesce(fact.routed_model_slug, fact.requested_model_slug),
    fact.occurred_at::date,
    route.provider_slug,
    public.resolve_v2_effective_pricing_plan(fact.service_tier_slug, sku.service_tier_slug)
  into target_model, target_date, target_provider, target_plan
  from public.v2_request_facts fact
  join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
  left join public.v2_pricing_skus sku on sku.sku_id = source_line.sku_id
  where fact.request_event_id = source_line.request_event_id;

  if target_model is null or target_provider is null then return source_line; end if;

  is_cached_read := source_line.meter_key in (
    'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens'
  );
  is_cached_write := source_line.meter_key in (
    'cached_write_tokens', 'cached_write_text_tokens',
    'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
  );
  is_input := source_line.meter_key in ('input_tokens', 'input_text_tokens') or is_cached_read or is_cached_write;
  is_output := source_line.meter_key in ('output_tokens', 'output_text_tokens');

  if direction = -1 then
    update public.v2_public_effective_pricing_daily set
      input_tokens = greatest(0, input_tokens - case when is_input then source_line.quantity else 0 end),
      output_tokens = greatest(0, output_tokens - case when is_output then source_line.quantity else 0 end),
      cached_read_tokens = greatest(0, cached_read_tokens - case when is_cached_read then source_line.quantity else 0 end),
      cached_write_tokens = greatest(0, cached_write_tokens - case when is_cached_write then source_line.quantity else 0 end),
      input_cost_nanos = greatest(0, input_cost_nanos - case when is_input then source_line.charged_nanos else 0 end),
      output_cost_nanos = greatest(0, output_cost_nanos - case when is_output then source_line.charged_nanos else 0 end),
      total_cost_nanos = greatest(0, total_cost_nanos - source_line.charged_nanos),
      updated_at = now()
    where model_slug = target_model
      and usage_date = target_date
      and provider_id = target_provider
      and pricing_plan = target_plan;
    return source_line;
  end if;

  insert into public.v2_public_effective_pricing_daily (
    model_slug, usage_date, provider_id, pricing_plan,
    input_tokens, output_tokens, cached_read_tokens, cached_write_tokens,
    input_cost_nanos, output_cost_nanos, total_cost_nanos
  ) values (
    target_model, target_date, target_provider, target_plan,
    case when is_input then source_line.quantity else 0 end,
    case when is_output then source_line.quantity else 0 end,
    case when is_cached_read then source_line.quantity else 0 end,
    case when is_cached_write then source_line.quantity else 0 end,
    case when is_input then source_line.charged_nanos else 0 end,
    case when is_output then source_line.charged_nanos else 0 end,
    source_line.charged_nanos
  )
  on conflict (model_slug, usage_date, provider_id, pricing_plan) do update set
    input_tokens = greatest(0, public.v2_public_effective_pricing_daily.input_tokens + excluded.input_tokens),
    output_tokens = greatest(0, public.v2_public_effective_pricing_daily.output_tokens + excluded.output_tokens),
    cached_read_tokens = greatest(0, public.v2_public_effective_pricing_daily.cached_read_tokens + excluded.cached_read_tokens),
    cached_write_tokens = greatest(0, public.v2_public_effective_pricing_daily.cached_write_tokens + excluded.cached_write_tokens),
    input_cost_nanos = greatest(0, public.v2_public_effective_pricing_daily.input_cost_nanos + excluded.input_cost_nanos),
    output_cost_nanos = greatest(0, public.v2_public_effective_pricing_daily.output_cost_nanos + excluded.output_cost_nanos),
    total_cost_nanos = greatest(0, public.v2_public_effective_pricing_daily.total_cost_nanos + excluded.total_cost_nanos),
    updated_at = now();

  return source_line;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_request_classification_rollup(p_contribution_id uuid, p_classifier_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_contribution public.data_contributions%rowtype;
  v_category text;
begin
  select * into v_contribution
  from public.data_contributions
  where id = p_contribution_id;
  if not found then return; end if;

  select primary_category into v_category
  from public.request_classifications
  where contribution_id = p_contribution_id
    and classifier_id = p_classifier_id;
  if not found then return; end if;

  if not exists (
    select 1 from public.workspace_classifiers where id = p_classifier_id
  ) then
    return;
  end if;

  insert into public.request_classification_daily (
    usage_date, workspace_id, classifier_id, primary_category, model_slug,
    provider_slug, request_count, input_tokens, output_tokens, updated_at
  )
  select
    contribution.occurred_at::date,
    contribution.workspace_id,
    classification.classifier_id,
    classification.primary_category,
    contribution.model_slug,
    coalesce(contribution.provider_slug, ''),
    count(*),
    coalesce(sum(contribution.input_tokens), 0),
    coalesce(sum(contribution.output_tokens), 0),
    now()
  from public.request_classifications classification
  join public.data_contributions contribution on contribution.id = classification.contribution_id
  where contribution.workspace_id = v_contribution.workspace_id
    and contribution.occurred_at::date = v_contribution.occurred_at::date
    and classification.classifier_id = p_classifier_id
    and classification.primary_category = v_category
    and contribution.model_slug = v_contribution.model_slug
    and coalesce(contribution.provider_slug, '') = coalesce(v_contribution.provider_slug, '')
  group by contribution.occurred_at::date, contribution.workspace_id,
    classification.classifier_id, classification.primary_category,
    contribution.model_slug, coalesce(contribution.provider_slug, '')
  on conflict (usage_date, workspace_id, classifier_id, primary_category, model_slug, provider_slug)
  do update set
    request_count = excluded.request_count,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    updated_at = excluded.updated_at;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_v2_public_effective_pricing_fact_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  source_fact public.v2_request_facts%rowtype;
  old_service_tier text;
  new_service_tier text;
  old_plan text;
  new_plan text;
  source_service_tier text;
  target_model text;
  target_date date;
  target_provider text;
  totals record;
begin
  old_service_tier := coalesce(
    public.normalize_v2_service_tier(old.service_tier_slug),
    public.normalize_v2_service_tier(old.safe_metadata->>'service_tier'),
    public.normalize_v2_service_tier(old.safe_metadata->>'service_tier_observed'),
    public.normalize_v2_service_tier(old.safe_metadata->>'service_tier_requested'),
    case when old.endpoint = 'batch' then 'batch' else null end
  );
  new_service_tier := case
    when new.service_tier_slug is distinct from old.service_tier_slug then coalesce(
      public.normalize_v2_service_tier(new.service_tier_slug),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier'),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_observed'),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_requested'),
      old_service_tier
    )
    else coalesce(
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier'),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_observed'),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_requested'),
      public.normalize_v2_service_tier(new.service_tier_slug),
      case when new.endpoint = 'batch' then 'batch' else old_service_tier end
    )
  end;
  old_plan := public.resolve_v2_effective_pricing_plan(old_service_tier, null);
  new_plan := public.resolve_v2_effective_pricing_plan(new_service_tier, null);

  if tg_when = 'BEFORE' then
    new.service_tier_requested := coalesce(
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_requested'),
      public.normalize_v2_service_tier(new.service_tier_requested)
    );
    new.service_tier_observed := coalesce(
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_observed'),
      public.normalize_v2_service_tier(new.service_tier_observed)
    );
    new.service_tier_slug := new_service_tier;
  end if;

  if (old.provider_model_id, old.routed_model_slug, old.requested_model_slug, old.occurred_at, old_plan)
    is not distinct from
    (new.provider_model_id, new.routed_model_slug, new.requested_model_slug, new.occurred_at, new_plan)
  then
    return new;
  end if;

  if tg_when = 'BEFORE' then
    source_fact := old;
    source_service_tier := old_service_tier;
  else
    source_fact := new;
    source_service_tier := new_service_tier;
  end if;
  target_model := coalesce(source_fact.routed_model_slug, source_fact.requested_model_slug);
  target_date := source_fact.occurred_at::date;
  select route.provider_slug into target_provider
  from public.v2_model_provider_routes route
  where route.provider_model_id = source_fact.provider_model_id;

  if target_model is null or target_provider is null then return new; end if;

  for totals in
    select
      public.resolve_v2_effective_pricing_plan(source_service_tier, sku.service_tier_slug) as pricing_plan,
      coalesce(sum(line.quantity) filter (where line.meter_key in (
        'input_tokens', 'input_text_tokens', 'cached_read_tokens', 'cached_read_text_tokens',
        'implicit_cached_input_text_tokens', 'cached_write_tokens', 'cached_write_text_tokens',
        'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
      )), 0) as input_tokens,
      coalesce(sum(line.quantity) filter (where line.meter_key in ('output_tokens', 'output_text_tokens')), 0) as output_tokens,
      coalesce(sum(line.quantity) filter (where line.meter_key in (
        'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens'
      )), 0) as cached_read_tokens,
      coalesce(sum(line.quantity) filter (where line.meter_key in (
        'cached_write_tokens', 'cached_write_text_tokens', 'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
      )), 0) as cached_write_tokens,
      coalesce(sum(line.charged_nanos) filter (where line.meter_key in (
        'input_tokens', 'input_text_tokens', 'cached_read_tokens', 'cached_read_text_tokens',
        'implicit_cached_input_text_tokens', 'cached_write_tokens', 'cached_write_text_tokens',
        'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
      )), 0) as input_cost_nanos,
      coalesce(sum(line.charged_nanos) filter (where line.meter_key in ('output_tokens', 'output_text_tokens')), 0) as output_cost_nanos,
      coalesce(sum(line.charged_nanos), 0) as total_cost_nanos
    from public.v2_request_pricing_lines line
    left join public.v2_pricing_skus sku on sku.sku_id = line.sku_id
    where line.request_event_id = source_fact.request_event_id
    group by public.resolve_v2_effective_pricing_plan(source_service_tier, sku.service_tier_slug)
  loop
    if tg_when = 'BEFORE' then
      update public.v2_public_effective_pricing_daily set
        input_tokens = greatest(0, input_tokens - totals.input_tokens),
        output_tokens = greatest(0, output_tokens - totals.output_tokens),
        cached_read_tokens = greatest(0, cached_read_tokens - totals.cached_read_tokens),
        cached_write_tokens = greatest(0, cached_write_tokens - totals.cached_write_tokens),
        input_cost_nanos = greatest(0, input_cost_nanos - totals.input_cost_nanos),
        output_cost_nanos = greatest(0, output_cost_nanos - totals.output_cost_nanos),
        total_cost_nanos = greatest(0, total_cost_nanos - totals.total_cost_nanos),
        updated_at = now()
      where model_slug = target_model and usage_date = target_date
        and provider_id = target_provider and pricing_plan = totals.pricing_plan;
    else
      insert into public.v2_public_effective_pricing_daily (
        model_slug, usage_date, provider_id, pricing_plan, input_tokens, output_tokens,
        cached_read_tokens, cached_write_tokens, input_cost_nanos, output_cost_nanos, total_cost_nanos
      ) values (
        target_model, target_date, target_provider, totals.pricing_plan, totals.input_tokens,
        totals.output_tokens, totals.cached_read_tokens, totals.cached_write_tokens,
        totals.input_cost_nanos, totals.output_cost_nanos, totals.total_cost_nanos
      ) on conflict (model_slug, usage_date, provider_id, pricing_plan) do update set
        input_tokens = public.v2_public_effective_pricing_daily.input_tokens + excluded.input_tokens,
        output_tokens = public.v2_public_effective_pricing_daily.output_tokens + excluded.output_tokens,
        cached_read_tokens = public.v2_public_effective_pricing_daily.cached_read_tokens + excluded.cached_read_tokens,
        cached_write_tokens = public.v2_public_effective_pricing_daily.cached_write_tokens + excluded.cached_write_tokens,
        input_cost_nanos = public.v2_public_effective_pricing_daily.input_cost_nanos + excluded.input_cost_nanos,
        output_cost_nanos = public.v2_public_effective_pricing_daily.output_cost_nanos + excluded.output_cost_nanos,
        total_cost_nanos = public.v2_public_effective_pricing_daily.total_cost_nanos + excluded.total_cost_nanos,
        updated_at = now();
    end if;
  end loop;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.drain_provider_health_refresh(p_limit integer DEFAULT 25)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item record;
  provider_value text;
  completed integer := 0;
  completed_keys jsonb := '[]'::jsonb;
  failed_keys jsonb := '[]'::jsonb;
  started_at timestamptz := clock_timestamp();
begin
  -- Only workers take this lock. Ingestion never waits for a reporting scan.
  if not pg_try_advisory_xact_lock(hashtextextended('provider_health_refresh_worker', 0)) then return 0; end if;
  for item in select * from private.provider_health_refresh_queue
    where retry_after <= clock_timestamp()
    order by retry_after, usage_date, model_slug, provider_model_id
    limit greatest(1, least(coalesce(p_limit, 25), 25))
  loop
    exit when clock_timestamp() - started_at > interval '5 seconds';
    begin
      select provider_slug into provider_value from public.v2_model_provider_routes
        where provider_model_id = item.provider_model_id;
      -- Remove old provider-slug rows as well when route metadata was corrected.
      delete from public.v2_public_provider_health_daily
        where usage_date = item.usage_date and model_slug = item.model_slug
          and provider_model_id = item.provider_model_id;
      if provider_value is not null then
        insert into public.v2_public_provider_health_daily (
          usage_date, model_slug, provider_model_id, provider_slug, request_count,
          successful_request_count, attempt_count, successful_attempts, failed_attempts,
          fallback_attempts, latency_sum_ms, latency_count, updated_at
        )
        select item.usage_date, item.model_slug, item.provider_model_id, provider_value,
          count(distinct fact.request_event_id), count(distinct fact.request_event_id) filter (where attempt.success),
          count(*), count(*) filter (where attempt.success), count(*) filter (where not attempt.success),
          count(*) filter (where attempt.attempt_number > 1),
          coalesce(sum(attempt.latency_ms), 0), count(attempt.latency_ms), clock_timestamp()
        from public.v2_request_facts fact
        join public.v2_request_attempts attempt on attempt.request_event_id = fact.request_event_id
        where fact.occurred_at >= item.usage_date::timestamptz
          and fact.occurred_at < (item.usage_date + 1)::timestamptz
          and (fact.routed_model_slug = item.model_slug
            or (fact.routed_model_slug is null and fact.requested_model_slug = item.model_slug))
          and attempt.provider_model_id = item.provider_model_id
        having count(*) > 0;
      end if;
      completed_keys := completed_keys || jsonb_build_array(jsonb_build_object(
        'usage_date', item.usage_date, 'model_slug', item.model_slug,
        'provider_model_id', item.provider_model_id, 'generation', item.generation));
      completed := completed + 1;
    exception when query_canceled or lock_not_available or others then
      failed_keys := failed_keys || jsonb_build_array(jsonb_build_object(
        'usage_date', item.usage_date, 'model_slug', item.model_slug,
        'provider_model_id', item.provider_model_id, 'error_code', sqlstate));
    end;
  end loop;
  -- Acknowledge only after ALL scans. Earlier deletions would hold queue row
  -- locks across later scans and make new ingestion wait for reporting again.
  delete from private.provider_health_refresh_queue queue
  using jsonb_to_recordset(completed_keys) as done(
    usage_date date, model_slug text, provider_model_id text, generation bigint)
  where queue.usage_date = done.usage_date and queue.model_slug = done.model_slug
    and queue.provider_model_id = done.provider_model_id and queue.generation = done.generation;
  update private.provider_health_refresh_queue queue
    set retry_after = clock_timestamp() + interval '5 minutes', last_error_code = failed.error_code
  from jsonb_to_recordset(failed_keys) as failed(
    usage_date date, model_slug text, provider_model_id text, error_code text)
  where queue.usage_date = failed.usage_date and queue.model_slug = failed.model_slug
    and queue.provider_model_id = failed.provider_model_id;
  return completed;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.gateway_usage_nonnegative_bigint(p_value numeric)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select greatest(coalesce(floor(p_value), 0), 0)::bigint;
$function$
;
CREATE OR REPLACE FUNCTION public.gateway_usage_total_tokens(p_usage jsonb)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    case
      when coalesce(p_usage->>'total_tokens', '') ~ '^\d+$'
        then (p_usage->>'total_tokens')::bigint
      else null
    end,
    greatest(
      coalesce(case when coalesce(p_usage->>'input_text_tokens', '') ~ '^\d+$' then (p_usage->>'input_text_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'input_tokens', '') ~ '^\d+$' then (p_usage->>'input_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'prompt_tokens', '') ~ '^\d+$' then (p_usage->>'prompt_tokens')::bigint end, 0)
    )
    + greatest(
      coalesce(case when coalesce(p_usage->>'output_text_tokens', '') ~ '^\d+$' then (p_usage->>'output_text_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'output_tokens', '') ~ '^\d+$' then (p_usage->>'output_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'completion_tokens', '') ~ '^\d+$' then (p_usage->>'completion_tokens')::bigint end, 0)
    )
    + coalesce(case when coalesce(p_usage->>'reasoning_tokens', '') ~ '^\d+$' then (p_usage->>'reasoning_tokens')::bigint end, 0)
    + coalesce(case when coalesce(p_usage->>'cached_read_text_tokens', '') ~ '^\d+$' then (p_usage->>'cached_read_text_tokens')::bigint end, 0),
    0
  );
$function$
;
CREATE OR REPLACE FUNCTION public.public_leaderboard_model_id(p_canonical_model_id text, p_model_id text, p_requested_model_id text, p_routed_model_id text, p_api_model_id text, p_provider text, p_pricing_plan text, p_is_free_variant boolean)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when coalesce(p_is_free_variant, false)
      or lower(coalesce(p_pricing_plan, '')) = 'free'
      or lower(coalesce(p_api_model_id, '')) like '%:free'
      or lower(coalesce(p_routed_model_id, '')) like '%:free'
      or lower(coalesce(p_model_id, '')) like '%:free'
      or lower(coalesce(p_requested_model_id, '')) like '%:free'
      or lower(coalesce(p_canonical_model_id, '')) like '%:free'
    then coalesce(
      nullif(p_api_model_id, ''),
      nullif(p_routed_model_id, ''),
      nullif(p_model_id, ''),
      nullif(p_requested_model_id, ''),
      nullif(p_canonical_model_id, ''),
      public.resolve_public_model_id(p_model_id, p_provider),
      'unknown'
    )
    else coalesce(
      nullif(p_canonical_model_id, ''),
      public.resolve_public_model_id(p_model_id, p_provider),
      nullif(p_routed_model_id, ''),
      nullif(p_requested_model_id, ''),
      nullif(p_api_model_id, ''),
      nullif(p_model_id, ''),
      'unknown'
    )
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_v2_provider_health_for_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  fact_row record;
begin
  if tg_op <> 'INSERT' then
    select occurred_at::date usage_date, coalesce(routed_model_slug, requested_model_slug) model_slug
      into fact_row from public.v2_request_facts where request_event_id = old.request_event_id;
    perform private.enqueue_provider_health_refresh(fact_row.usage_date, fact_row.model_slug, old.provider_model_id);
  end if;
  if tg_op <> 'DELETE' then
    select occurred_at::date usage_date, coalesce(routed_model_slug, requested_model_slug) model_slug
      into fact_row from public.v2_request_facts where request_event_id = new.request_event_id;
    perform private.enqueue_provider_health_refresh(fact_row.usage_date, fact_row.model_slug, new.provider_model_id);
  end if;
  return null;
end;
$function$
;
create view public.v2_web_public_usage_daily with (security_invoker=true) as select usage.* from public.v2_public_usage_daily usage;
create view public.v2_web_public_usage_hourly with (security_invoker=true) as select usage.* from public.v2_public_usage_hourly usage;
create view public.v2_rpc_gateway_model_usage_daily with (security_invoker=true) as select usage.* from public.v2_public_usage_daily usage;
grant usage on schema public, private to service_role;
grant all on all tables in schema public, private to service_role;
grant select on public.v2_models, public.v2_model_provider_routes,
  public.v2_public_usage_daily, public.v2_public_usage_hourly,
  public.v2_public_usage_daily_meters, public.v2_public_usage_hourly_meters,
  public.v2_public_effective_pricing_daily, public.v2_public_provider_health_daily,
  public.public_model_task_daily to anon, authenticated;
do $$ declare target text; begin
  foreach target in array array['v2_public_usage_daily','v2_public_usage_hourly',
    'v2_public_usage_daily_meters','v2_public_usage_hourly_meters',
    'v2_public_effective_pricing_daily','v2_public_provider_health_daily','public_model_task_daily'] loop
    execute 'alter table public.' || target || ' enable row level security';
    execute 'create policy fixture_public_read on public.' || target || ' for select to anon,authenticated using (true)';
  end loop;
end $$;
