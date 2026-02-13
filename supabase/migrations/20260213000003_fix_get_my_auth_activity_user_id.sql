-- Fix get_my_auth_activity() filtering.
-- Some auth.audit_log_entries implementations do not expose a user_id column, and the payload
-- shape can vary. We scope to the caller by matching auth.uid() against payload text.

create or replace function public.get_my_auth_activity(
    p_since timestamptz default (now() - interval '90 days'),
    p_limit int default 50,
    p_offset int default 0
)
returns table (
    id uuid,
    created_at timestamptz,
    action text,
    provider text,
    ip_address text,
    user_agent text,
    metadata jsonb
)
language sql
security definer
set search_path = auth, public
as $$
    select
        a.id,
        a.created_at,
        nullif(a.payload->>'action', '') as action,
        nullif(coalesce(a.payload->'metadata'->>'provider', a.payload->>'provider'), '') as provider,
        nullif(a.ip_address, '') as ip_address,
        nullif(a.payload->>'user_agent', '') as user_agent,
        coalesce((a.payload->'metadata')::jsonb, '{}'::jsonb) as metadata
    from auth.audit_log_entries a
    where auth.uid() is not null
      and a.payload::text like ('%' || auth.uid()::text || '%')
      and a.created_at >= p_since
    order by a.created_at desc
    limit least(greatest(p_limit, 0), 200)
    offset greatest(p_offset, 0);
$$;

revoke all on function public.get_my_auth_activity(timestamptz, int, int) from public;
grant execute on function public.get_my_auth_activity(timestamptz, int, int) to authenticated;
