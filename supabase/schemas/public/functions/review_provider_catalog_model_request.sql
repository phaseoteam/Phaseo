CREATE OR REPLACE FUNCTION public.review_provider_catalog_model_request(p_request_id uuid,p_decision text,p_reason text,p_reviewed_by uuid,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SET search_path TO public AS $function$
declare proposal public.provider_catalog_model_requests; provider_id text;
begin
  if p_decision not in ('approved','rejected','needs_changes') then raise exception 'invalid_model_review_decision'; end if;
  if p_decision <> 'approved' and nullif(btrim(p_reason),'') is null then raise exception 'model_review_reason_required'; end if;
  select provider_slug into provider_id from public.provider_catalog_model_requests where id=p_request_id;
  perform 1 from public.v2_providers where provider_slug=provider_id for update;
  select * into proposal from public.provider_catalog_model_requests where id=p_request_id for update;
  if not found or proposal.status='withdrawn' then raise exception 'model_request_unavailable'; end if;
  if p_expected_updated_at is not null and proposal.updated_at <> p_expected_updated_at then raise exception 'model_request_changed'; end if;
  if not exists(select 1 from public.provider_catalog_models where provider_slug=proposal.provider_slug and model_slug=proposal.model_slug and status='active' and source_run_id=proposal.source_run_id) then raise exception 'model_request_superseded'; end if;
  if p_decision='approved' then
    insert into public.v2_labs(lab_slug,name,status,routable,metadata)
    values(split_part(lower(proposal.model_slug),'/',1),split_part(lower(proposal.model_slug),'/',1),'disabled',false,'{"created_from_provider_proposal":true}') on conflict(lab_slug) do nothing;
    insert into public.v2_models(model_slug,lab_slug,name,description,status,hidden,input_modalities,output_modalities,variant_kind,metadata)
    values(lower(proposal.model_slug),split_part(lower(proposal.model_slug),'/',1),proposal.model->>'name',proposal.model->>'description','active',true,
      array(select jsonb_array_elements_text(proposal.model->'inputModalities')),
      array(select jsonb_array_elements_text(proposal.model->'outputModalities')),
      case when proposal.model_slug like '%:free' then 'free' else 'standard' end,
      jsonb_build_object('created_from_provider_proposal',true,'provider_catalog_owner',proposal.provider_slug,'approved_request_id',proposal.id))
    on conflict(model_slug) do nothing;
    update public.provider_catalog_sources set refresh_requested=true,next_poll_at=now(),updated_at=now() where provider_slug=proposal.provider_slug;
  end if;
  update public.provider_catalog_model_requests set status=p_decision,reason=case when p_decision='approved' then null else p_reason end,reviewed_by=p_reviewed_by,reviewed_at=now(),updated_at=now() where id=proposal.id;
  update public.provider_catalog_sync_models set decision=p_decision,decision_reason=p_reason,reviewed_by=p_reviewed_by,reviewed_at=now() where run_id=proposal.source_run_id and model_slug=proposal.model_slug;
  insert into public.provider_catalog_review_events(run_id,model_slug,decision,reason,actor_user_id) values(proposal.source_run_id,proposal.model_slug,p_decision,p_reason,p_reviewed_by);
  return proposal.provider_slug;
end;
$function$;
REVOKE ALL ON FUNCTION public.review_provider_catalog_model_request(uuid,text,text,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_provider_catalog_model_request(uuid,text,text,uuid,timestamptz) TO service_role;
