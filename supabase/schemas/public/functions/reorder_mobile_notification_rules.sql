CREATE OR REPLACE FUNCTION public.reorder_mobile_notification_rules (
  p_user_id  uuid,
  p_rule_ids uuid[]
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Numbers the user's rules in the order given. The list must name each of their rules
-- exactly once; otherwise nothing changes and false is returned.
declare
  v_total integer;
begin
  if p_user_id is null or p_rule_ids is null then
    return false;
  end if;

  perform 1 from public.mobile_notification_rules r where r.user_id = p_user_id for update;
  select count(*) into v_total from public.mobile_notification_rules r where r.user_id = p_user_id;

  if cardinality(p_rule_ids) <> v_total
    or (select count(distinct x.rule_id) from unnest(p_rule_ids) as x(rule_id)) <> v_total
    or exists (
      select 1 from unnest(p_rule_ids) as x(rule_id)
      where x.rule_id is null or not exists (
        select 1 from public.mobile_notification_rules r where r.id = x.rule_id and r.user_id = p_user_id
      )
    ) then
    return false;
  end if;

  update public.mobile_notification_rules r
  set "position" = (o.ord - 1)::integer, updated_at = now()
  from unnest(p_rule_ids) with ordinality as o(rule_id, ord)
  where r.id = o.rule_id and r.user_id = p_user_id and r."position" <> (o.ord - 1)::integer;

  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."reorder_mobile_notification_rules"(uuid, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reorder_mobile_notification_rules"(uuid, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reorder_mobile_notification_rules"(uuid, uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."reorder_mobile_notification_rules"(uuid, uuid[]) FROM PUBLIC, "anon", "authenticated";
