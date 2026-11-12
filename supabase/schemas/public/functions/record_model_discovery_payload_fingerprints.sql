CREATE OR REPLACE FUNCTION public.record_model_discovery_payload_fingerprints (
  p_rows jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  conflicts integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'payload fingerprint rows must be a JSON array';
  end if;

  -- Compare-and-set per provider: record the new fingerprint only while the row still holds the one the
  -- sweep started from. Otherwise an overlapping sweep wrote in between, so clear it; a missing
  -- fingerprint only makes the next sweep re-extract that provider.
  with changes as (
    select
      entry->>'provider_id' as provider_id,
      entry->>'expected' as expected,
      entry->>'next' as next
    from jsonb_array_elements(p_rows) as entries(entry)
    where nullif(trim(entry->>'provider_id'), '') is not null
  ), updated as (
    update public.model_discovery_provider_status as status
    set payload_fingerprint = case
      when status.payload_fingerprint is not distinct from changes.expected then changes.next
      else null
    end
    from changes
    where status.provider_id = changes.provider_id
    returning status.payload_fingerprint is distinct from changes.next as conflicted
  )
  select count(*) filter (where conflicted) into conflicts from updated;

  return conflicts;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_model_discovery_payload_fingerprints"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_model_discovery_payload_fingerprints"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_model_discovery_payload_fingerprints"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_model_discovery_payload_fingerprints"(jsonb) FROM PUBLIC, "anon", "authenticated";
