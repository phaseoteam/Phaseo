-- Restore the service-only boundary established by 20260811130234 after the handle-length fix.
-- The post-login server calls this RPC through supabaseAdmin; browser clients must not supply arbitrary user IDs.
revoke all on function public.provision_personal_workspace(uuid,text) from public,anon,authenticated;
grant execute on function public.provision_personal_workspace(uuid,text) to service_role;
