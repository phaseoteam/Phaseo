CREATE OR REPLACE FUNCTION public.claim_provider_model_notifications(p_lease uuid)
RETURNS SETOF uuid LANGUAGE sql SET search_path TO public AS $function$
  with eligible as (
    select request.id from public.provider_catalog_model_requests request
    join public.provider_catalog_sources source using(provider_slug)
    where request.status='pending' and request.notification_sent_at is null and request.notification_retry_at<=now()
      and source.status='active'
    order by request.created_at limit 100 for update of request skip locked
  ) update public.provider_catalog_model_requests request set notification_lease=p_lease,notification_retry_at=now()+interval '15 minutes'
    from eligible where request.id=eligible.id returning request.id;
$function$;
REVOKE ALL ON FUNCTION public.claim_provider_model_notifications(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_provider_model_notifications(uuid) TO service_role;
