CREATE OR REPLACE FUNCTION private.prune_catalogue_row_history (
  p_batch_size integer DEFAULT 5000
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '60s'
  SET lock_timeout TO '5s'
  AS $function$
declare
  v_cursor bigint;
  v_ids bigint[];
  v_deleted integer;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 10000 then
    raise exception 'Catalogue history prune batch size must be between 1 and 10000';
  end if;

  -- Never delete a row the catalogue notification capture has not read yet.
  select c.last_history_event_id into v_cursor
  from public.catalogue_notification_cursors c
  where c.source = 'v2_catalogue_row_history';
  if v_cursor is null then
    return 0;
  end if;

  -- 1. Benchmark-result rewrites that changed nothing but updated_at. No new ones are recorded since #3515,
  --    so this is a fixed backlog. A plain scan with LIMIT stops as soon as a batch is found.
  select coalesce(array_agg(n.event_id), '{}') into v_ids
  from (
    select h.event_id
    from public.v2_catalogue_row_history h
    where h.table_name = 'v2_benchmark_results'
      and h.operation = 'UPDATE'
      and h.event_id <= v_cursor
      and (h.before_state - 'updated_at') = (h.after_state - 'updated_at')
    limit p_batch_size
  ) n;

  -- 2. Benchmark-result changes older than 90 days, but only those the admin model history view can no longer
  --    show: it lists each model's newest 100 non-baseline rows, so a row is removed only when its model has at
  --    least 100 newer non-baseline rows. Deleting such rows never moves an older row into that window.
  if cardinality(v_ids) < p_batch_size then
    select v_ids || coalesce(array_agg(o.event_id), '{}') into v_ids
    from (
      with old as (
        select h.event_id, h.model_slug
        from public.v2_catalogue_row_history h
        where h.table_name = 'v2_benchmark_results'
          and h.operation = 'UPDATE'
          and h.recorded_at < now() - interval '90 days'
          and h.event_id <= v_cursor
          and h.event_id <> all (v_ids)
      ),
      floors as (
        select m.model_slug,
          (select n.event_id
           from public.v2_catalogue_row_history n
           where n.model_slug = m.model_slug and n.operation <> 'BASELINE'
           order by n.event_id desc
           offset 99 limit 1) as floor_event_id
        from (select distinct old.model_slug from old where old.model_slug is not null) m
      )
      select old.event_id
      from old
      left join floors f on f.model_slug = old.model_slug
      where old.model_slug is null or old.event_id < f.floor_event_id
      order by old.event_id
      limit p_batch_size - cardinality(v_ids)
    ) o;
  end if;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  perform pg_catalog.set_config('phaseo.catalogue_history_prune', 'on', true);
  delete from public.v2_catalogue_row_history h
  where h.event_id = any (v_ids)
    and h.table_name = 'v2_benchmark_results'
    and h.operation = 'UPDATE';
  get diagnostics v_deleted = row_count;
  perform pg_catalog.set_config('phaseo.catalogue_history_prune', 'off', true);
  return v_deleted;
end;
$function$;

COMMENT ON FUNCTION "private"."prune_catalogue_row_history"(integer) IS 'Bounded deletion of benchmark-result UPDATE history only: updated_at-only rewrites, and changes older than 90 days that fall outside the newest 100 non-baseline rows per model. Skips rows the notification capture has not read. Every other history row is kept.';

REVOKE ALL ON FUNCTION "private"."prune_catalogue_row_history"(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."prune_catalogue_row_history"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."prune_catalogue_row_history"(integer) TO "postgres";
