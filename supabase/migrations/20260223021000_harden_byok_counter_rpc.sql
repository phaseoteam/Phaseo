-- Restrict BYOK monthly counter RPC to service role only.

revoke all on function public.increment_team_byok_monthly_request_count(uuid, timestamptz) from public;
grant execute on function public.increment_team_byok_monthly_request_count(uuid, timestamptz) to service_role;
