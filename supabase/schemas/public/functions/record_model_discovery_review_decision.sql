CREATE OR REPLACE FUNCTION public.record_model_discovery_review_decision (
  p_item_id       uuid,
  p_decision      text,
  p_reason        text,
  p_actor_user_id uuid,
  p_reviewed_at   timestamp with time zone DEFAULT now()
)
  RETURNS SETOF public.model_discovery_review_items
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  updated_item public.model_discovery_review_items;
begin
  if p_decision not in ('in_progress', 'approved', 'rejected', 'snoozed') then
    raise exception 'invalid model discovery review decision';
  end if;

  if p_decision in ('rejected', 'snoozed') and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is required for this review decision';
  end if;

  update public.model_discovery_review_items
  set
    status = p_decision,
    reviewed_by = p_actor_user_id,
    reviewed_at = coalesce(p_reviewed_at, now()),
    review_note = case
      when p_decision in ('approved', 'in_progress') then null
      else nullif(trim(p_reason), '')
    end
  where id = p_item_id
  returning * into updated_item;

  if not found then
    return;
  end if;

  insert into public.model_discovery_review_events (
    item_id,
    decision,
    reason,
    actor_user_id
  ) values (
    p_item_id,
    p_decision,
    nullif(trim(p_reason), ''),
    p_actor_user_id
  );

  return next updated_item;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_model_discovery_review_decision"(uuid, text, text, uuid, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_model_discovery_review_decision"(uuid, text, text, uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_model_discovery_review_decision"(uuid, text, text, uuid, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_model_discovery_review_decision"(uuid, text, text, uuid, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
