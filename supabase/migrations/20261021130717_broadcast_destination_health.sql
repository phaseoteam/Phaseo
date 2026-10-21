-- Broadcast destination health: the latest delivery outcome and failure streak per
-- destination, hourly delivered and failed counts, and the functions that record
-- prune and summarise them.

CREATE TABLE "public"."broadcast_destination_health" (
  "destination_id"       uuid                     NOT NULL,
  "workspace_id"         uuid                     NOT NULL,
  "last_success_at"      timestamp with time zone,
  "last_failure_at"      timestamp with time zone,
  "last_http_status"     integer,
  "last_error"           text,
  "consecutive_failures" integer                  NOT NULL DEFAULT 0,
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "broadcast_destination_health_consecutive_failures_check" CHECK ((consecutive_failures >= 0)),
  CONSTRAINT "broadcast_destination_health_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.workspace_broadcast_destinations(id) ON DELETE CASCADE,
  CONSTRAINT "broadcast_destination_health_pkey" PRIMARY KEY (destination_id),
  CONSTRAINT "broadcast_destination_health_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."broadcast_destination_health"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX broadcast_destination_health_workspace_id_idx ON public.broadcast_destination_health USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."broadcast_destination_health"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."broadcast_destination_health" IS 'Latest delivery outcome for each Broadcast destination, written by record_broadcast_destination_health. consecutive_failures counts failed export requests since the last successful one.';

REVOKE ALL ON TABLE "public"."broadcast_destination_health" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."broadcast_destination_health" TO "service_role";

REVOKE ALL ON TABLE "public"."broadcast_destination_health" FROM "anon", "authenticated";

CREATE TABLE "public"."broadcast_destination_delivery_hourly" (
  "destination_id" uuid                     NOT NULL,
  "hour"           timestamp with time zone NOT NULL,
  "workspace_id"   uuid                     NOT NULL,
  "delivered"      integer                  NOT NULL DEFAULT 0,
  "failed"         integer                  NOT NULL DEFAULT 0,
  CONSTRAINT "broadcast_destination_delivery_hourly_counts_check" CHECK (((delivered >= 0) AND (failed >= 0))),
  CONSTRAINT "broadcast_destination_delivery_hourly_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.workspace_broadcast_destinations(id) ON DELETE CASCADE,
  CONSTRAINT "broadcast_destination_delivery_hourly_pkey" PRIMARY KEY (destination_id, hour),
  CONSTRAINT "broadcast_destination_delivery_hourly_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."broadcast_destination_delivery_hourly"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX broadcast_destination_delivery_hourly_hour_idx ON public.broadcast_destination_delivery_hourly USING btree (hour);

CREATE INDEX broadcast_destination_delivery_hourly_workspace_hour_idx ON public.broadcast_destination_delivery_hourly USING btree (workspace_id, hour DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."broadcast_destination_delivery_hourly"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."broadcast_destination_delivery_hourly" IS 'Broadcast events delivered and finally failed per destination per UTC hour. Pruned after eight days by prune_broadcast_destination_delivery_hourly.';

REVOKE ALL ON TABLE "public"."broadcast_destination_delivery_hourly" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."broadcast_destination_delivery_hourly" TO "service_role";

REVOKE ALL ON TABLE "public"."broadcast_destination_delivery_hourly" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.record_broadcast_destination_health (
  p_results jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '5s'
  SET lock_timeout TO '1s'
  AS $function$
declare
  v_recorded integer;
begin
  -- One entry per destination from one consumer batch: events delivered and
  -- finally failed, failed requests since the batch's last success, and the
  -- last success and failure. A batch with a success resets the failure streak
  -- to its own count; otherwise its failures extend the stored streak.
  -- Destinations deleted since delivery are skipped.
  with results as (
    select distinct on (result.destination_id)
      result.destination_id,
      destination.workspace_id,
      greatest(coalesce(result.delivered, 0), 0) as delivered,
      greatest(coalesce(result.failed, 0), 0) as failed,
      greatest(coalesce(result.failures, 0), 0) as failures,
      result.last_success_at,
      result.last_failure_at,
      result.last_http_status,
      left(result.last_error, 500) as last_error
    from jsonb_to_recordset(case when jsonb_typeof(p_results) = 'array' then p_results else '[]'::jsonb end) as result(
      destination_id uuid,
      delivered integer,
      failed integer,
      failures integer,
      last_success_at timestamptz,
      last_failure_at timestamptz,
      last_http_status integer,
      last_error text
    )
    join public.workspace_broadcast_destinations destination on destination.id = result.destination_id
    order by result.destination_id
  ),
  health as (
    insert into public.broadcast_destination_health as health (
      destination_id, workspace_id, last_success_at, last_failure_at, last_http_status, last_error, consecutive_failures, updated_at
    )
    select destination_id, workspace_id, last_success_at, last_failure_at, last_http_status, last_error, failures, now()
    from results
    where last_success_at is not null or last_failure_at is not null
    on conflict (destination_id) do update set
      last_success_at = greatest(health.last_success_at, excluded.last_success_at),
      last_failure_at = greatest(health.last_failure_at, excluded.last_failure_at),
      last_http_status = case when excluded.last_failure_at is not null then excluded.last_http_status else health.last_http_status end,
      last_error = case when excluded.last_failure_at is not null then excluded.last_error else health.last_error end,
      consecutive_failures = case
        when excluded.last_success_at is not null then excluded.consecutive_failures
        else health.consecutive_failures + excluded.consecutive_failures
      end,
      updated_at = now()
  ),
  hourly as (
    insert into public.broadcast_destination_delivery_hourly as hourly (destination_id, hour, workspace_id, delivered, failed)
    select destination_id, date_trunc('hour', now(), 'UTC'), workspace_id, delivered, failed
    from results
    where delivered > 0 or failed > 0
    on conflict (destination_id, hour) do update set
      delivered = hourly.delivered + excluded.delivered,
      failed = hourly.failed + excluded.failed
  )
  select count(*) into v_recorded from results;
  return v_recorded;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) TO "service_role";

COMMENT ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) IS 'Records one Broadcast consumer batch''s delivery outcomes per destination: the latest success and failure, the failure streak, and hourly delivered and failed event counts.';

REVOKE ALL ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.prune_broadcast_destination_delivery_hourly (
  p_limit integer DEFAULT 5000
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '10s'
  SET lock_timeout TO '500ms'
  AS $function$
declare
  v_deleted integer;
begin
  -- The dashboard shows the last day; a week is kept for alerts and trends.
  with expired as (
    select destination_id, hour
    from public.broadcast_destination_delivery_hourly
    where hour < now() - interval '8 days'
    order by hour
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5000), 5000))
  )
  delete from public.broadcast_destination_delivery_hourly hourly
  using expired
  where hourly.destination_id = expired.destination_id
    and hourly.hour = expired.hour;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) TO "service_role";

COMMENT ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) IS 'Deletes a bounded batch of Broadcast hourly delivery counts older than eight days.';

REVOKE ALL ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.broadcast_destination_health_summary (
  p_workspace_id uuid
)
  RETURNS TABLE (
    destination_id uuid,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    last_http_status integer,
    last_error text,
    consecutive_failures integer,
    delivered_24h bigint,
    failed_24h bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '5s'
  AS $function$
  -- The 24-hour window covers the current UTC hour and the 24 before it, so it
  -- spans up to 25 hours rather than dropping the hour in progress.
  select
    destination.id,
    health.last_success_at,
    health.last_failure_at,
    health.last_http_status,
    health.last_error,
    coalesce(health.consecutive_failures, 0),
    coalesce(counts.delivered, 0),
    coalesce(counts.failed, 0)
  from public.workspace_broadcast_destinations destination
  left join public.broadcast_destination_health health on health.destination_id = destination.id
  left join (
    select hourly.destination_id, sum(hourly.delivered) as delivered, sum(hourly.failed) as failed
    from public.broadcast_destination_delivery_hourly hourly
    where hourly.workspace_id = p_workspace_id
      and hourly.hour >= date_trunc('hour', now(), 'UTC') - interval '24 hours'
    group by hourly.destination_id
  ) counts on counts.destination_id = destination.id
  where destination.workspace_id = p_workspace_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) TO "service_role";

COMMENT ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) IS 'Each Broadcast destination in a workspace with its latest delivery outcome, failure streak, and events delivered and failed in the last 24 hours.';

REVOKE ALL ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) FROM PUBLIC, "anon", "authenticated";

