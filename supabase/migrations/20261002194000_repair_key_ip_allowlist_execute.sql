-- The keys CHECK constraint runs on every insert/update, including last_used_at.
-- Preserve table permissions and RLS; grant only this pure input validator.
-- Conditional because the allowlist migration was applied separately in production.
do $$
begin
  if to_regprocedure('public.valid_key_ip_allowlist(jsonb)') is not null then
    grant execute on function public.valid_key_ip_allowlist(jsonb) to service_role;
    if has_table_privilege('authenticated', 'public.keys', 'INSERT, UPDATE') then
      grant execute on function public.valid_key_ip_allowlist(jsonb) to authenticated;
    end if;
  end if;
end;
$$;
