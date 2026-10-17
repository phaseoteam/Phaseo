CREATE OR REPLACE FUNCTION public.claim_mobile_push_receipts (
  p_limit integer
)
  RETURNS TABLE (
    id             uuid,
    expo_ticket_id text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Hands out Expo tickets whose receipts should be ready (sent 15 minutes to a day ago) and
-- marks them checked, so each receipt is fetched once. Expo keeps receipts for a day;
-- older unchecked tickets are closed without a check.
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_mobile_push_receipt_limit';
  end if;

  update public.mobile_push_deliveries x
  set receipt_checked_at = now(), updated_at = now()
  where x.status = 'sent' and x.expo_ticket_id is not null and x.receipt_checked_at is null
    and x.sent_at <= now() - interval '1 day';

  return query
  with due as (
    select x.id
    from public.mobile_push_deliveries x
    where x.status = 'sent' and x.expo_ticket_id is not null and x.receipt_checked_at is null
      and x.sent_at <= now() - interval '15 minutes'
    order by x.sent_at, x.id
    for update skip locked
    limit p_limit
  )
  update public.mobile_push_deliveries x
  set receipt_checked_at = now(), updated_at = now()
  from due
  where x.id = due.id
  returning x.id, x.expo_ticket_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_receipts"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_receipts"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_receipts"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_receipts"(integer) FROM PUBLIC, "anon", "authenticated";
