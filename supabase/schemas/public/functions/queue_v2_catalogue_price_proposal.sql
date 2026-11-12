CREATE OR REPLACE FUNCTION public.queue_v2_catalogue_price_proposal (
  p_provider_model_id text,
  p_sku_code          text,
  p_proposal_id       text,
  p_source_url        text,
  p_sku               jsonb,
  p_expected_sku      jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if nullif(p_sku_code,'') is null then raise exception 'price code required'; end if;
  if p_proposal_id is not null and (p_sku is null or p_sku->>'provider_model_id' is distinct from p_provider_model_id or p_sku->>'sku_code' is distinct from p_sku_code) then raise exception 'proposal identity mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalogue-proposal:'||p_provider_model_id||':'||p_sku_code,0));
  update public.v2_catalogue_price_proposals set status='superseded',reviewed_at=now()
    where provider_model_id=p_provider_model_id and sku->>'sku_code'=p_sku_code and status='pending' and proposal_id is distinct from p_proposal_id;
  if p_proposal_id is null then return; end if;
  insert into public.v2_catalogue_price_proposals(proposal_id,provider_model_id,source_url,sku,expected_sku)
    values(p_proposal_id,p_provider_model_id,p_source_url,p_sku,p_expected_sku)
    on conflict(proposal_id) do update set status='pending',created_at=now(),reviewed_at=null,reviewed_by=null
      where v2_catalogue_price_proposals.status='superseded';
end $function$;

GRANT EXECUTE ON FUNCTION "public"."queue_v2_catalogue_price_proposal"(text, text, text, text, jsonb, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."queue_v2_catalogue_price_proposal"(text, text, text, text, jsonb, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_v2_catalogue_price_proposal"(text, text, text, text, jsonb, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."queue_v2_catalogue_price_proposal"(text, text, text, text, jsonb, jsonb) FROM PUBLIC, "anon", "authenticated";
