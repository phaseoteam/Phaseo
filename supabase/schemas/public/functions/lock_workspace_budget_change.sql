CREATE OR REPLACE FUNCTION public.lock_workspace_budget_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_workspace_id uuid;
begin
  v_workspace_id := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."lock_workspace_budget_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."lock_workspace_budget_change"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."lock_workspace_budget_change"() FROM PUBLIC, "anon", "authenticated", "service_role";
