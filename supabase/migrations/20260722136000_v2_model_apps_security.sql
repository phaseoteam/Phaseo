alter function public.get_v2_model_apps(text, integer) security definer;
revoke all on function public.get_v2_model_apps(text, integer) from public;
grant execute on function public.get_v2_model_apps(text, integer) to anon, authenticated, service_role;
