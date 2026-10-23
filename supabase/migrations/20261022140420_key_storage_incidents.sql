SET local check_function_bodies = off;

-- Key storage incidents: when a platform where customers store API keys reports
-- a breach, Phaseo staff revoke or pause every key recorded as stored there.
CREATE TABLE "public"."key_storage_incidents" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "client_request_id"   uuid                     NOT NULL,
  "location_id"         text                     NOT NULL,
  "action"              text                     NOT NULL,
  "keys_created_before" timestamp with time zone NOT NULL,
  "title"               text                     NOT NULL,
  "customer_message"    text                     NOT NULL,
  "source_url"          text,
  "declared_by"         uuid,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "applied_at"          timestamp with time zone,
  "affected_keys"       integer,
  "affected_workspaces" integer,
  CONSTRAINT "key_storage_incidents_pkey" PRIMARY KEY (id),
  CONSTRAINT "key_storage_incidents_client_request_id_key" UNIQUE (client_request_id),
  CONSTRAINT "key_storage_incidents_action_check" CHECK ((action = ANY (ARRAY['revoke'::text, 'pause'::text]))),
  CONSTRAINT "key_storage_incidents_location_check" CHECK (public.valid_key_storage_locations(ARRAY[location_id])),
  CONSTRAINT "key_storage_incidents_title_check" CHECK (((length(btrim(title)) >= 1) AND (length(title) <= 200))),
  CONSTRAINT "key_storage_incidents_message_check" CHECK (((length(btrim(customer_message)) >= 1) AND (length(customer_message) <= 2000))),
  CONSTRAINT "key_storage_incidents_source_url_check" CHECK (((source_url IS NULL) OR ((source_url ~ '^https://'::text) AND (length(source_url) <= 500)))),
  CONSTRAINT "key_storage_incidents_declared_by_fkey" FOREIGN KEY (declared_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE "public"."key_storage_incidents"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX key_storage_incidents_created_at_idx ON public.key_storage_incidents USING btree (created_at DESC);

CREATE INDEX key_storage_incidents_declared_by_idx ON public.key_storage_incidents USING btree (declared_by)
  WHERE (declared_by IS NOT NULL);

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."key_storage_incidents" TO "service_role";

COMMENT ON TABLE "public"."key_storage_incidents" IS 'A platform where customers store API keys (key storage location) reported a breach. Phaseo staff declare it, then apply it once to revoke or pause every matching key created before keys_created_before, across all workspaces. Service-only.';

CREATE TABLE "public"."key_storage_incident_keys" (
  "incident_id"     uuid NOT NULL,
  "key_id"          uuid NOT NULL,
  "workspace_id"    uuid NOT NULL,
  "previous_status" text NOT NULL,
  CONSTRAINT "key_storage_incident_keys_pkey" PRIMARY KEY (incident_id, key_id),
  CONSTRAINT "key_storage_incident_keys_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES public.key_storage_incidents(id) ON DELETE CASCADE,
  CONSTRAINT "key_storage_incident_keys_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE,
  CONSTRAINT "key_storage_incident_keys_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."key_storage_incident_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX key_storage_incident_keys_key_id_idx ON public.key_storage_incident_keys USING btree (key_id);

CREATE INDEX key_storage_incident_keys_workspace_id_idx ON public.key_storage_incident_keys USING btree (workspace_id, incident_id);

GRANT SELECT, INSERT ON TABLE "public"."key_storage_incident_keys" TO "service_role";

COMMENT ON TABLE "public"."key_storage_incident_keys" IS 'Keys a key storage incident revoked or paused, with their status before. Shows each workspace which of its keys an incident affected. Service-only.';

CREATE OR REPLACE FUNCTION public.preview_key_storage_incident (
  p_location_id         text,
  p_keys_created_before timestamp with time zone,
  p_action              text DEFAULT 'revoke'::text
)
  RETURNS TABLE (
    keys       bigint,
    workspaces bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The keys apply_key_storage_incident would change. Service-only.
  select count(*), count(distinct key.workspace_id)
  from public.keys as key
  where key.storage_locations @> array[p_location_id]
    and cardinality(key.storage_locations) > 0
    and key.created_at < p_keys_created_before
    and key.key_kind = 'standard'
    and key.status = any(case when p_action = 'pause' then array['active'] else array['active', 'paused'] end)
    and key.name not in ('__chat_route_managed_key__', '__slack_agent_managed_key__');
$function$;

COMMENT ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) IS 'How many keys and workspaces a key storage incident would revoke or pause. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.apply_key_storage_incident (
  p_incident_id uuid
)
  RETURNS TABLE (
    key_id       uuid,
    kid          text,
    workspace_id uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_incident public.key_storage_incidents%rowtype;
  v_now timestamp with time zone := now();
begin
  -- Applies a declared incident exactly once, in one transaction: changes every
  -- matching key, records which keys it changed and their previous status, and
  -- writes a workspace audit event per key. Returns the changed keys so the
  -- caller can clear the gateway's key cache. Service-only.
  select * into v_incident from public.key_storage_incidents where id = p_incident_id for update;
  if not found then
    raise exception 'incident_not_found' using errcode = 'P0002';
  end if;
  if v_incident.applied_at is not null then
    raise exception 'incident_already_applied' using errcode = '55000';
  end if;

  create temporary table affected on commit drop as
  select key.id, key.kid, key.workspace_id, key.status as previous_status, key.name, key.prefix
  from public.keys as key
  where key.storage_locations @> array[v_incident.location_id]
    and cardinality(key.storage_locations) > 0
    and key.created_at < v_incident.keys_created_before
    and key.key_kind = 'standard'
    and key.status = any(case when v_incident.action = 'pause' then array['active'] else array['active', 'paused'] end)
    and key.name not in ('__chat_route_managed_key__', '__slack_agent_managed_key__')
  for update of key;

  update public.keys as key
  set status = case when v_incident.action = 'pause' then 'paused' else 'revoked' end,
      revoked_at = case when v_incident.action = 'pause' then key.revoked_at else v_now end,
      revoked_reason = case when v_incident.action = 'pause' then key.revoked_reason else 'storage_incident:' || v_incident.id::text end
  from affected
  where key.id = affected.id;

  insert into public.key_storage_incident_keys (incident_id, key_id, workspace_id, previous_status)
  select v_incident.id, affected.id, affected.workspace_id, affected.previous_status from affected;

  -- No actor: Phaseo took the action, not a workspace member.
  insert into public.workspace_audit_events (workspace_id, actor_user_id, action, target_type, target_id, target_name, metadata)
  select affected.workspace_id, null,
    case when v_incident.action = 'pause' then 'api_key.paused' else 'api_key.revoked' end,
    'api_key', affected.id::text, left(affected.name, 200),
    jsonb_build_object('source', 'storage_incident', 'incidentId', v_incident.id, 'storageLocation', v_incident.location_id, 'prefix', affected.prefix, 'previousStatus', affected.previous_status)
  from affected;

  update public.key_storage_incidents
  set applied_at = v_now,
      affected_keys = (select count(*) from affected),
      affected_workspaces = (select count(distinct affected.workspace_id) from affected)
  where id = v_incident.id;

  return query select affected.id, affected.kid, affected.workspace_id from affected;
end;
$function$;

COMMENT ON FUNCTION "public"."apply_key_storage_incident"(uuid) IS 'Revokes or pauses, once, every live key stored in the incident''s location and created before its cut-off, across all workspaces, recording and auditing each key. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."apply_key_storage_incident"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_key_storage_incident"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_key_storage_incident"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_key_storage_incident"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.declare_key_storage_incident (
  p_client_request_id   uuid,
  p_location_id         text,
  p_action              text,
  p_keys_created_before timestamp with time zone,
  p_title               text,
  p_customer_message    text,
  p_source_url          text,
  p_declared_by         uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_incident_id uuid;
  v_created boolean := false;
begin
  -- Declares an incident and applies it in the same transaction, so there is
  -- never a declared but unapplied incident. Retrying with the same
  -- p_client_request_id returns the first result instead of declaring again,
  -- so a caller that lost the response (or failed to send the emails) can
  -- safely retry. Service-only.
  insert into public.key_storage_incidents (client_request_id, location_id, action, keys_created_before, title, customer_message, source_url, declared_by)
  values (p_client_request_id, p_location_id, p_action, p_keys_created_before, p_title, p_customer_message, p_source_url, p_declared_by)
  on conflict (client_request_id) do nothing
  returning id into v_incident_id;

  if v_incident_id is null then
    select incident.id into v_incident_id
    from public.key_storage_incidents as incident
    where incident.client_request_id = p_client_request_id;
  else
    v_created := true;
    perform public.apply_key_storage_incident(v_incident_id);
  end if;

  return jsonb_build_object(
    'incident_id', v_incident_id,
    'created', v_created,
    'keys', coalesce((
      select jsonb_agg(jsonb_build_object('key_id', changed.key_id, 'workspace_id', changed.workspace_id) order by changed.key_id)
      from public.key_storage_incident_keys as changed
      where changed.incident_id = v_incident_id
    ), '[]'::jsonb)
  );
end;
$function$;

COMMENT ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) IS 'Declares and applies a key storage incident in one transaction; idempotent per client request id. Returns the incident id and the keys it changed. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.key_storage_incident_recipients (
  p_incident_id uuid
)
  RETURNS TABLE (
    workspace_id   uuid,
    workspace_name text,
    user_id        uuid,
    email          text,
    keys           bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The owners and admins of each workspace an applied incident changed, with
  -- how many of that workspace's keys it changed. Service-only.
  with affected as (
    select changed.workspace_id, count(*) as keys
    from public.key_storage_incident_keys as changed
    where changed.incident_id = p_incident_id
    group by changed.workspace_id
  ), people as (
    select member.workspace_id, member.user_id
    from public.workspace_members as member
    join affected on affected.workspace_id = member.workspace_id
    where member.role::text in ('owner', 'admin')
    union
    select workspace.id, workspace.owner_user_id
    from public.workspaces as workspace
    join affected on affected.workspace_id = workspace.id
    where workspace.owner_user_id is not null
  )
  select people.workspace_id, workspace.name, people.user_id, account.email::text, affected.keys
  from people
  join affected on affected.workspace_id = people.workspace_id
  join public.workspaces as workspace on workspace.id = people.workspace_id
  join auth.users as account on account.id = people.user_id
  where nullif(btrim(account.email), '') is not null
  order by people.workspace_id, people.user_id;
$function$;

COMMENT ON FUNCTION "public"."key_storage_incident_recipients"(uuid) IS 'Owners and admins to email for each workspace a key storage incident changed. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."key_storage_incident_recipients"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."key_storage_incident_recipients"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."key_storage_incident_recipients"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."key_storage_incident_recipients"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.workspace_key_storage_incidents (
  p_workspace_id uuid
)
  RETURNS TABLE (
    id               uuid,
    location_id      text,
    action           text,
    title            text,
    customer_message text,
    source_url       text,
    applied_at       timestamp with time zone,
    keys             bigint,
    key_ids          uuid[]
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Incidents from the last 90 days that changed this workspace's keys, newest
  -- first, for the notice on the API keys and Key security pages. Service-only:
  -- callers verify workspace access first.
  select incident.id, incident.location_id, incident.action, incident.title, incident.customer_message,
    incident.source_url, incident.applied_at, count(*), array_agg(changed.key_id order by changed.key_id)
  from public.key_storage_incident_keys as changed
  join public.key_storage_incidents as incident on incident.id = changed.incident_id
  where changed.workspace_id = p_workspace_id
    and incident.applied_at > now() - interval '90 days'
  group by incident.id
  order by incident.applied_at desc;
$function$;

COMMENT ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) IS 'Key storage incidents from the last 90 days that revoked or paused this workspace''s keys. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) FROM PUBLIC, "anon", "authenticated";
