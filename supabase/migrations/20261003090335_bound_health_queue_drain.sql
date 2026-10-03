-- Keep ingestion independent of every reporting scan in a batch.
-- Acknowledge signals only after scanning; bound work by elapsed time and keys.
-- phaseo:allow-destructive-migration reason: Deletes only completed derived health refresh signals; request and billing sources remain intact.
set local lock_timeout = '500ms';
set local statement_timeout = '15s';

create or replace function private.drain_provider_health_refresh(p_limit integer default 25)
returns integer language plpgsql security definer set search_path = '' as $$
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
$$;

select cron.schedule('provider-health-refresh-queue', '* * * * *',
  $$set statement_timeout = '10s'; select private.drain_provider_health_refresh(25);$$);
