-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

CREATE OR REPLACE FUNCTION public.get_monitor_history_page(p_model text DEFAULT NULL::text, p_provider text DEFAULT NULL::text, p_change_kind text DEFAULT NULL::text, p_commit_offset integer DEFAULT 0, p_commit_limit integer DEFAULT 18)
 RETURNS TABLE(event_id text, committed_at timestamp with time zone, provider_kind text, model_id text, endpoint text, field text, old_value jsonb, new_value jsonb, percent_change double precision, action text, commit_sha text, entity_id text, entity_type text, org_id text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with filtered as not materialized (
    select e.*
    from public.monitor_history_events e
    where (
      p_model is null
      or btrim(p_model) = ''
      or e.model_id = p_model
    )
      and (
        p_provider is null
        or btrim(p_provider) = ''
        or e.provider_slug = p_provider
      )
      and (
        p_change_kind is null
        or btrim(p_change_kind) = ''
        or p_change_kind = 'all'
        or e.change_kind = p_change_kind
      )
  ),
  visible_commits as (
    select
      filtered.commit_sha,
      max(filtered.committed_at) as committed_at
    from filtered
    group by filtered.commit_sha
    order by max(filtered.committed_at) desc, filtered.commit_sha desc
    offset greatest(coalesce(p_commit_offset, 0), 0)
    limit greatest(coalesce(p_commit_limit, 18), 1)
  )
  select
    e.event_id,
    e.committed_at,
    e.provider_kind,
    e.model_id,
    e.endpoint,
    e.field,
    e.old_value,
    e.new_value,
    e.percent_change,
    e.action,
    e.commit_sha,
    e.entity_id,
    e.entity_type,
    e.org_id
  from filtered e
  join visible_commits vc
    on vc.commit_sha = e.commit_sha
  order by
    vc.committed_at desc,
    e.committed_at desc,
    lower(coalesce(e.org_id, '')) asc,
    lower(coalesce(e.model_id, '')) asc,
    case coalesce(e.action, '')
      when 'added' then 0
      when 'changed' then 1
      when 'removed' then 2
      else 3
    end asc,
    case coalesce(e.entity_type, '')
      when 'organisation' then 0
      when 'model' then 1
      when 'family' then 2
      when 'api-provider' then 3
      when 'benchmark' then 4
      when 'alias' then 5
      when 'subscription-plan' then 6
      when 'pricing' then 7
      else 8
    end asc,
    case when e.endpoint is null or btrim(e.endpoint) = '' then 0 else 1 end asc,
    e.event_id asc;
$function$

