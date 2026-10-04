CREATE OR REPLACE FUNCTION public.machine_payment_protocol_store_cas (
  p_key              text,
  p_expected_version bigint,
  p_delete           boolean,
  p_value            jsonb,
  p_expires_at       timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if p_expected_version = 0 then
    insert into public.machine_payment_protocol_store(key,value,expires_at) values(p_key,p_value,p_expires_at) on conflict do nothing;
  elsif p_delete then
    delete from public.machine_payment_protocol_store where key=p_key and version=p_expected_version;
  else
    update public.machine_payment_protocol_store set value=p_value,version=version+1,expires_at=p_expires_at,updated_at=now() where key=p_key and version=p_expected_version;
  end if;
  if not found then raise exception 'store_version_conflict'; end if;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."machine_payment_protocol_store_cas"(text, bigint, boolean, jsonb, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."machine_payment_protocol_store_cas"(text, bigint, boolean, jsonb, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."machine_payment_protocol_store_cas"(text, bigint, boolean, jsonb, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."machine_payment_protocol_store_cas"(text, bigint, boolean, jsonb, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
