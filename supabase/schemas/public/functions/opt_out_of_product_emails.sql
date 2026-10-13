CREATE OR REPLACE FUNCTION public.opt_out_of_product_emails (
  p_token uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- One-click unsubscribe from a feedback email: opts the user out of all non-essential
-- email and cancels any of their feedback emails still waiting in the outbox.
-- Repeating it is harmless. Returns false for an unknown token.
declare
  v_user_id uuid;
begin
  update public.feedback_requests
  set opted_out_at = coalesce(opted_out_at, now())
  where access_token = p_token
  returning user_id into v_user_id;

  if v_user_id is null then
    return false;
  end if;

  update public.users
  set product_emails_opted_out_at = coalesce(product_emails_opted_out_at, now())
  where user_id = v_user_id;

  update public.email_outbox
  set attempts = 5, last_error = 'unsubscribed'
  where user_id = v_user_id and kind = 'feedback_request' and sent_at is null;

  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."opt_out_of_product_emails"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."opt_out_of_product_emails"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."opt_out_of_product_emails"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."opt_out_of_product_emails"(uuid) FROM PUBLIC, "anon", "authenticated";
