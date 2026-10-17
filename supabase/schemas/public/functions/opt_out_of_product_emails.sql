CREATE OR REPLACE FUNCTION public.opt_out_of_product_emails (
  p_token uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- One-click unsubscribe from a feedback email: opts the user out of all non-essential
-- email and cancels any of their feedback emails still waiting in the outbox.
-- Repeating it is harmless. Returns null for an unknown token, otherwise the user's
-- addresses (current sign-in and any feedback email was sent to) so the caller can also
-- unsubscribe them in the email provider.
declare
  v_user_id uuid;
  v_emails jsonb;
begin
  update public.feedback_requests
  set opted_out_at = coalesce(opted_out_at, now())
  where access_token = p_token
  returning user_id into v_user_id;

  if v_user_id is null then
    return null;
  end if;

  update public.users
  set product_emails_opted_out_at = coalesce(product_emails_opted_out_at, now())
  where user_id = v_user_id;

  update public.email_outbox
  set attempts = 5, last_error = 'unsubscribed'
  where user_id = v_user_id and kind = 'feedback_request' and sent_at is null;

  select coalesce(jsonb_agg(distinct e.email order by e.email), '[]'::jsonb) into v_emails
  from (
    select lower(trim(a.email)) as email from auth.users a where a.id = v_user_id
    union
    select lower(trim(o.to_email)) from public.email_outbox o
    where o.user_id = v_user_id and o.kind = 'feedback_request'
  ) e
  where nullif(e.email, '') is not null;

  return jsonb_build_object('emails', v_emails);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."opt_out_of_product_emails"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."opt_out_of_product_emails"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."opt_out_of_product_emails"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."opt_out_of_product_emails"(uuid) FROM PUBLIC, "anon", "authenticated";
