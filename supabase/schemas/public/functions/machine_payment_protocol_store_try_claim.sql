CREATE OR REPLACE FUNCTION public.machine_payment_protocol_store_try_claim (
  p_key        text,
  p_expires_at timestamp with time zone
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.machine_payment_protocol_store(key,value,expires_at)
  values(p_key,jsonb_build_object('type','mppx:replay','expires',extract(epoch from p_expires_at)*1000),p_expires_at)
  on conflict(key) do update set value=excluded.value,version=machine_payment_protocol_store.version+1,expires_at=excluded.expires_at,updated_at=now()
  where machine_payment_protocol_store.expires_at is not null and machine_payment_protocol_store.expires_at <= now();
  return found;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."machine_payment_protocol_store_try_claim"(text, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."machine_payment_protocol_store_try_claim"(text, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."machine_payment_protocol_store_try_claim"(text, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."machine_payment_protocol_store_try_claim"(text, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
