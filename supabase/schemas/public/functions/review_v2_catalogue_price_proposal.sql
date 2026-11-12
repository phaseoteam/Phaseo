CREATE OR REPLACE FUNCTION public.review_v2_catalogue_price_proposal (
  p_actor_user_id uuid,
  p_proposal_id   text,
  p_accept        boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_proposal public.v2_catalogue_price_proposals%rowtype; v_model text; v_current jsonb; v_result jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  select * into v_proposal from public.v2_catalogue_price_proposals where proposal_id=p_proposal_id;
  if not found then raise exception 'proposal is no longer pending'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalogue-proposal:'||v_proposal.provider_model_id||':'||(v_proposal.sku->>'sku_code'),0));
  select * into v_proposal from public.v2_catalogue_price_proposals where proposal_id=p_proposal_id for update;
  if not found or v_proposal.status<>'pending' then raise exception 'proposal is no longer pending'; end if;
  if p_accept then
    select model_slug into v_model from public.v2_model_provider_routes where provider_model_id=v_proposal.provider_model_id for update;
    select to_jsonb(s) into v_current from public.v2_pricing_skus s where s.provider_model_id=v_proposal.provider_model_id and s.sku_code=v_proposal.sku->>'sku_code' and effective_to is null order by version desc limit 1 for update;
    if v_current is distinct from v_proposal.expected_sku then raise exception 'Pricing changed since this proposal. Refresh the provider feed.'; end if;
    v_result:=public.mutate_v2_admin_pricing_sku(p_actor_user_id,v_model,'save',v_proposal.sku||jsonb_build_object('effective_from',now()));
  end if;
  update public.v2_catalogue_price_proposals set status=case when p_accept then 'accepted' else 'dismissed' end,reviewed_by=p_actor_user_id,reviewed_at=now() where proposal_id=p_proposal_id;
  return coalesce(v_result,'{}'::jsonb);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."review_v2_catalogue_price_proposal"(uuid, text, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."review_v2_catalogue_price_proposal"(uuid, text, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."review_v2_catalogue_price_proposal"(uuid, text, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."review_v2_catalogue_price_proposal"(uuid, text, boolean) FROM PUBLIC, "anon", "authenticated";
