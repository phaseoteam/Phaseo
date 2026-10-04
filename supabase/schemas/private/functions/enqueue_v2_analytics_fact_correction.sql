CREATE OR REPLACE FUNCTION private.enqueue_v2_analytics_fact_correction()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if coalesce(current_setting('phaseo.pruning_byok_metadata',true),'')='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if coalesce(old.routed_model_slug,old.requested_model_slug) is not null and (tg_op='DELETE' or row(old.workspace_id,date_trunc('hour',old.occurred_at at time zone 'utc'),old.app_id,
    coalesce(old.routed_model_slug,old.requested_model_slug),old.provider_model_id,old.cloudflare_colo)
    is distinct from row(new.workspace_id,date_trunc('hour',new.occurred_at at time zone 'utc'),new.app_id,
    coalesce(new.routed_model_slug,new.requested_model_slug),new.provider_model_id,new.cloudflare_colo)) then
    insert into private.v2_analytics_previous_grains as queued(workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo)
    values(old.workspace_id,date_trunc('hour',old.occurred_at at time zone 'utc') at time zone 'utc',old.app_id,
      coalesce(old.routed_model_slug,old.requested_model_slug),old.provider_model_id,old.cloudflare_colo)
    on conflict(workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo) do update
    set grain_id=excluded.grain_id,transaction_id=excluded.transaction_id
    where queued.transaction_id<>excluded.transaction_id;
  end if;
  if tg_op='DELETE' then return old; end if;
  if old is distinct from new then perform private.enqueue_v2_analytics_correction(new.request_event_id); end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_v2_analytics_fact_correction"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_v2_analytics_fact_correction"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_v2_analytics_fact_correction"() TO "postgres";
