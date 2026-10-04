CREATE OR REPLACE FUNCTION private.enqueue_public_reporting_for_fact()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'UPDATE' and old is not distinct from new then return new; end if;
  if tg_op <> 'INSERT' then
    perform private.enqueue_public_reporting_refresh(old.occurred_at);
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'INSERT' or new.occurred_at is distinct from old.occurred_at then
      perform private.enqueue_public_reporting_refresh(new.occurred_at);
    end if;
    return new;
  end if;
  return old;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_public_reporting_for_fact"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_public_reporting_for_fact"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_public_reporting_for_fact"() TO "postgres";
