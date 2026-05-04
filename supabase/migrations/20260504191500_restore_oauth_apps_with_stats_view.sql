-- Restore oauth_apps_with_stats for runtime compatibility with the OAuth apps UI.

drop view if exists public.oauth_apps_with_stats;

create view public.oauth_apps_with_stats
with (security_invoker = true)
as
select
  oam.*,
  count(distinct oa.id) filter (where oa.revoked_at is null) as active_authorizations,
  count(distinct oa.id) as total_authorizations,
  max(oa.last_used_at) as last_used_at,
  count(distinct gr.id) as requests_last_30d
from public.oauth_app_metadata oam
left join public.oauth_authorizations oa on oa.client_id = oam.client_id
left join public.gateway_requests gr
  on gr.oauth_client_id = oam.client_id
 and gr.created_at > now() - interval '30 days'
where oam.status = 'active'
group by oam.id;

grant select on public.oauth_apps_with_stats to authenticated;

comment on view public.oauth_apps_with_stats is 'OAuth apps with authorization and usage statistics. SECURITY INVOKER - respects RLS policies on underlying tables.';
