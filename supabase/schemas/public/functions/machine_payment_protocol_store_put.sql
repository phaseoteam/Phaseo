CREATE OR REPLACE FUNCTION public.machine_payment_protocol_store_put (
  p_key        text,
  p_value      jsonb,
  p_expires_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  insert into public.machine_payment_protocol_store(key,value,expires_at) values(p_key,p_value,p_expires_at)
  on conflict(key) do update set value=excluded.value,version=machine_payment_protocol_store.version+1,expires_at=excluded.expires_at,updated_at=now();
$function$;

GRANT EXECUTE ON FUNCTION "public"."machine_payment_protocol_store_put"(text, jsonb, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."machine_payment_protocol_store_put"(text, jsonb, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."machine_payment_protocol_store_put"(text, jsonb, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."machine_payment_protocol_store_put"(text, jsonb, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
