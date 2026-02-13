-- Revert auth activity RPC (unused for now).

drop function if exists public.get_my_auth_activity(timestamptz, int, int);

