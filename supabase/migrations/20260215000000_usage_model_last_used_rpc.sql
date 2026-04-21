-- Returns distinct models used by a team since a timestamp, with last-used time.
-- Used by the web app to power lifecycle alerts without fetching thousands of rows client-side.

create or replace function public.get_workspace_model_last_used(
  p_workspace_id uuid,
  p_since timestamptz
)
returns table(
  model_id text,
  last_used_at timestamptz
)
language sql
stable
as $$
  select
    gr.model_id::text as model_id,
    max(gr.created_at) as last_used_at
  from public.gateway_requests gr
  where gr.workspace_id = p_workspace_id
    and gr.created_at >= p_since
    and gr.model_id is not null
    and gr.model_id <> ''
    and public.is_workspace_member(p_workspace_id)
  group by gr.model_id
  order by last_used_at desc;
$$;
grant execute on function public.get_workspace_model_last_used(uuid, timestamptz) to authenticated;
