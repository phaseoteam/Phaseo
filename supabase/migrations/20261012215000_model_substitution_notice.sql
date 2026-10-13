-- phaseo:allow-destructive-migration reason: re-creates set_notification_event_destinations to accept model_substitution; its DELETE only replaces one workspace alert's routing rows when an administrator saves that alert, as in 20260824113000
-- One-off notice when a workspace's requests for a model no provider serves
-- are first served by a replacement. Adds the model_substitution notification
-- kind and the function the gateway calls to queue it.

ALTER TABLE "public"."notification_event_destinations"
  DROP CONSTRAINT "notification_event_destinations_event_kind_check";

ALTER TABLE "public"."notification_event_destinations"
  ADD CONSTRAINT "notification_event_destinations_event_kind_check"
    CHECK ((event_kind = ANY (ARRAY['low_balance'::text, 'auto_top_up_failed'::text, 'payment_method_expiring'::text, 'model_deprecation'::text, 'model_substitution'::text])));

CREATE OR REPLACE FUNCTION public.set_notification_event_destinations (
  p_workspace_id    uuid,
  p_event_kind      text,
  p_destination_ids uuid[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_event_kind, 0));

  if p_event_kind not in ('low_balance', 'auto_top_up_failed', 'payment_method_expiring', 'model_deprecation', 'model_substitution') then
    raise exception 'invalid_notification_event_kind';
  end if;

  if (
    select count(*)
    from public.notification_destinations
    where workspace_id = p_workspace_id
      and status = 'active'
      and id = any(p_destination_ids)
  ) <> cardinality(p_destination_ids) then
    raise exception 'notification_destination_not_found';
  end if;

  delete from public.notification_event_destinations
  where workspace_id = p_workspace_id and event_kind = p_event_kind;

  insert into public.notification_event_destinations (workspace_id, event_kind, destination_id)
  select p_workspace_id, p_event_kind, destination_id
  from unnest(p_destination_ids) as destination_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.record_model_substitution (
  p_workspace_id   uuid,
  p_model_slug     text,
  p_successor_slug text,
  p_source         text DEFAULT 'approved'::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_dedupe_key text := left('model_substitution:' || p_workspace_id::text || ':' || p_model_slug || ':' || p_successor_slug, 500);
  v_owner uuid;
  v_email text;
  v_workspace_name text;
  v_model_name text;
  v_successor_name text;
  v_title text;
  v_inserted uuid;
begin
  -- One notice per workspace, model and replacement. The gateway calls this on
  -- every isolate that serves a substitution, so the common case returns here.
  if exists (select 1 from public.email_outbox where dedupe_key = v_dedupe_key) then
    return false;
  end if;

  if p_source not in ('approved', 'workspace') or p_model_slug = p_successor_slug then
    raise exception 'invalid_model_substitution';
  end if;

  select m.name into v_model_name from public.v2_models m where m.model_slug = p_model_slug;
  if not found then return false; end if;
  select m.name into v_successor_name from public.v2_models m where m.model_slug = p_successor_slug;
  if not found then return false; end if;

  select w.owner_user_id, w.name, nullif(trim(a.email), '')
  into v_owner, v_workspace_name, v_email
  from public.workspaces w
  left join auth.users a on a.id = w.owner_user_id
  where w.id = p_workspace_id;
  if v_email is null then return false; end if;

  v_title := 'Model replaced: ' || coalesce(v_model_name, p_model_slug);

  insert into public.email_outbox (dedupe_key, kind, template, to_email, subject, workspace_id, user_id, payload)
  values (
    v_dedupe_key, 'model_substitution', 'model_substitution', v_email, v_title, p_workspace_id, v_owner,
    jsonb_build_object(
      'title', v_title,
      'workspace_name', coalesce(v_workspace_name, 'your workspace'),
      'model_id', p_model_slug,
      'model_name', coalesce(v_model_name, p_model_slug),
      'replacement_model_id', p_successor_slug,
      'replacement_model_name', coalesce(v_successor_name, p_successor_slug),
      'source', p_source
    )
  )
  on conflict (dedupe_key) do nothing
  returning id into v_inserted;

  return v_inserted is not null;
end;
$function$;

COMMENT ON FUNCTION "public"."record_model_substitution"(uuid, text, text, text) IS 'Queues the one-off notice that a workspace''s requests for a model no provider serves are now served by a replacement. Emails the owner and feeds routed notification destinations; returns true only the first time.';

GRANT EXECUTE ON FUNCTION "public"."record_model_substitution"(uuid, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_model_substitution"(uuid, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_model_substitution"(uuid, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_model_substitution"(uuid, text, text, text) FROM PUBLIC, "anon", "authenticated";
