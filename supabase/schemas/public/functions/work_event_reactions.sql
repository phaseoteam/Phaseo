CREATE OR REPLACE FUNCTION public.work_event_reactions (
  p_workspace_id uuid,
  p_event_ids    uuid[],
  p_user_id      uuid
)
  RETURNS TABLE(event_id uuid, emoji text, count integer, mine boolean)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- For each of the events, how many people reacted with each emoji and whether p_user_id did.
select reaction.event_id, reaction.emoji, count(*)::integer, bool_or(reaction.user_id = p_user_id)
from public.work_reactions reaction
where reaction.workspace_id = p_workspace_id and reaction.event_id = any(p_event_ids)
group by reaction.event_id, reaction.emoji;
$function$;

COMMENT ON FUNCTION public.work_event_reactions(uuid, uuid[], uuid) IS 'Reaction counts per work item event and emoji, and whether the given person reacted. Service role only.';

REVOKE ALL ON FUNCTION public.work_event_reactions(uuid, uuid[], uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_event_reactions(uuid, uuid[], uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_event_reactions(uuid, uuid[], uuid) TO "service_role";
