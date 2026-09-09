alter table public.v2_catalogue_price_proposals drop constraint v2_catalogue_price_proposals_status_check;
alter table public.v2_catalogue_price_proposals add constraint v2_catalogue_price_proposals_status_check check(status in ('pending','accepted','dismissed','superseded'));

with ranked as (
  select proposal_id,row_number() over(partition by provider_model_id,sku->>'sku_code' order by created_at desc,proposal_id desc) as position
  from public.v2_catalogue_price_proposals where status='pending'
)
update public.v2_catalogue_price_proposals p set status='superseded',reviewed_at=now()
from ranked r where p.proposal_id=r.proposal_id and r.position>1;
create unique index v2_catalogue_price_proposals_pending_family on public.v2_catalogue_price_proposals(provider_model_id,(sku->>'sku_code')) where status='pending';

-- Serialize feed updates and reviews for one price family. A null proposal clears
-- older quotes when the latest feed price already equals the database price.
create or replace function public.queue_v2_catalogue_price_proposal(
  p_provider_model_id text,p_sku_code text,p_proposal_id text,p_source_url text,p_sku jsonb,p_expected_sku jsonb
) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
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
end $$;
revoke all on function public.queue_v2_catalogue_price_proposal(text,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.queue_v2_catalogue_price_proposal(text,text,text,text,jsonb,jsonb) to service_role;

create or replace function public.review_v2_catalogue_price_proposal(p_actor_user_id uuid,p_proposal_id text,p_accept boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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
end $$;
revoke all on function public.review_v2_catalogue_price_proposal(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.review_v2_catalogue_price_proposal(uuid,text,boolean) to service_role;
