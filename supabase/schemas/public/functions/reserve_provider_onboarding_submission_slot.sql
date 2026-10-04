CREATE OR REPLACE FUNCTION public.reserve_provider_onboarding_submission_slot (
  p_user_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  reservation_count integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select count(*)::integer
    into reservation_count
    from public.provider_onboarding_submission_reservations
   where user_id = p_user_id
     and created_at >= now() - interval '24 hours';

  if reservation_count >= 5 then
    return false;
  end if;

  insert into public.provider_onboarding_submission_reservations (user_id)
  values (p_user_id);
  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."reserve_provider_onboarding_submission_slot"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."reserve_provider_onboarding_submission_slot"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reserve_provider_onboarding_submission_slot"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reserve_provider_onboarding_submission_slot"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."reserve_provider_onboarding_submission_slot"(uuid) FROM PUBLIC, "anon";
