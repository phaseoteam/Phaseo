-- Keep the catalogue edit and its recommended-successor validation in one transaction.
create or replace function public.mutate_v2_admin_model_with_successor(
  p_actor_user_id uuid,
  p_action text,
  p_model_slug text,
  p_payload jsonb
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_result jsonb;
begin
  v_result := public.mutate_v2_admin_catalogue(p_actor_user_id, 'models', p_action, p_model_slug, p_payload);
  if p_payload ? 'replacementModelId' then
    perform public.set_v2_model_recommended_successor(p_actor_user_id, p_model_slug, p_payload->>'replacementModelId');
  end if;
  return v_result;
end $$;

revoke all on function public.mutate_v2_admin_model_with_successor(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_model_with_successor(uuid,text,text,jsonb) to service_role;

create or replace function public.mutate_v2_admin_model_graph_with_successor(
  p_actor_user_id uuid,
  p_model_slug text,
  p_payload jsonb
)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_result jsonb;
begin
  v_result := public.mutate_v2_admin_model_graph(p_actor_user_id, p_model_slug, p_payload);
  if p_payload ? 'replacement_model_id' then
    perform public.set_v2_model_recommended_successor(p_actor_user_id, p_model_slug, p_payload->>'replacement_model_id');
  end if;
  return v_result;
end $$;

revoke all on function public.mutate_v2_admin_model_graph_with_successor(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_model_graph_with_successor(uuid,text,jsonb) to service_role;
