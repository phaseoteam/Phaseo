-- Per-user auth activity (login/logout/etc.) for the Settings > Activity page.
-- Uses auth.uid() so it is always scoped to the caller.

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
      -- Avoid invalid uuid casts if upstream payload ever changes.
      and (
        case
          when (a.payload->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (a.payload->>'user_id')::uuid
          else null
        end
      ) = auth.uid()
      and a.created_at >= p_since
    order by a.created_at desc
    limit least(greatest(p_limit, 0), 200)
    offset greatest(p_offset, 0);
$$;

revoke all on function public.get_my_auth_activity(timestamptz, int, int) from public;
grant execute on function public.get_my_auth_activity(timestamptz, int, int) to authenticated;
