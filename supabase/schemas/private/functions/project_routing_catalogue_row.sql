CREATE OR REPLACE FUNCTION private.project_routing_catalogue_row (
  input jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) || jsonb_build_object('metadata',
  (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
   from jsonb_each(case when jsonb_typeof(input->'metadata')='object' then input->'metadata' else '{}'::jsonb end)
   where key in ('availability','self_serve','quantization_scheme','match','priority',
     'included_quantity','billing_timestamp_basis','time_windows')))
from jsonb_each(input) where key in (
 'model_slug','provider_slug','provider_model_id','variant_id','sku_id','sku_meter_id',
 'provider_region_id','service_tier_slug','capability_id','alias_slug','enabled',
 'status','hidden','access_scope','is_stealth','availability','provider_availability_status',
 'phaseo_status','available_from','effective_from','effective_to','released_at','retired_at',
 'routable','routing_enabled','route_variant_id','region','execution_region','data_region',
 'region_code','execution_supported','data_residency_supported','currency','operation',
 'billable','meter_key','unit','unit_quantity','price_nanos','meter_order','params',
 'regions','default_execution_regions','default_data_regions','provider_family_slug',
 'provider_model_slug','context_length','max_input_tokens','max_output_tokens',
 'input_modalities','output_modalities','zero_data_retention','credential_mode',
 'residency_mode','prompt_training_policy','data_policy_tier','data_policy_confidence',
 'data_policy_contract_mode','data_policy_variant','stream_cancellation_support',
 'stream_cancellation_stops_provider_billing','stream_cancellation_usage_recovery',
 'stream_cancellation_evidence_kind','benchmark_id','score_numeric','is_self_reported'
);
$function$;

GRANT EXECUTE ON FUNCTION "private"."project_routing_catalogue_row"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."project_routing_catalogue_row"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."project_routing_catalogue_row"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."project_routing_catalogue_row"(jsonb) TO "postgres";
