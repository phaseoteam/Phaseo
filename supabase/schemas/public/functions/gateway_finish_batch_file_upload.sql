CREATE OR REPLACE FUNCTION public.gateway_finish_batch_file_upload (
  p_workspace_id     uuid,
  p_upload_id        text,
  p_status           text,
  p_provider_file_id text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if p_status is null or p_status not in ('completed', 'failed') then
    raise exception 'invalid_batch_file_upload_status';
  end if;
  update public.gateway_batch_file_uploads
  set status = p_status,
      provider_file_id = nullif(trim(coalesce(p_provider_file_id, '')), ''),
      updated_at = now()
  where workspace_id = p_workspace_id and upload_id = p_upload_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_finish_batch_file_upload"(uuid, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_finish_batch_file_upload"(uuid, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_finish_batch_file_upload"(uuid, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_finish_batch_file_upload"(uuid, text, text, text) FROM PUBLIC, "anon", "authenticated";
