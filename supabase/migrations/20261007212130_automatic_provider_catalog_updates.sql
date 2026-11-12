SET local check_function_bodies = off;

CREATE TABLE "public"."provider_catalog_edit_events" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"  text                     NOT NULL,
  "model_slug"     text                     NOT NULL,
  "field"          text                     NOT NULL,
  "actor_id"       uuid,
  "actor_kind"     text                     NOT NULL,
  "actor_name"     text,
  "action"         text                     NOT NULL,
  "previous_value" jsonb,
  "value"          jsonb,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_catalog_edit_events_action_check" CHECK ((action = ANY (ARRAY['override'::text, 'revert'::text]))),
  CONSTRAINT "provider_catalog_edit_events_actor_kind_check" CHECK ((actor_kind = ANY (ARRAY['phaseo'::text, 'provider'::text]))),
  CONSTRAINT "provider_catalog_edit_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."provider_catalog_edit_events"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."provider_catalog_edit_events" FROM "anon", "authenticated";

ALTER TABLE "public"."provider_catalog_sources"
  ADD COLUMN "feed_models" jsonb;

ALTER TABLE "public"."provider_catalog_sources"
  ADD COLUMN "catalog_overrides" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."provider_catalog_sources"
  ADD COLUMN "overrides_updated_at" timestamp WITH time zone;

CREATE OR REPLACE FUNCTION public.apply_provider_catalog_feed_snapshot (
  p_provider_slug    text,
  p_run_id           uuid,
  p_feed_models      jsonb,
  p_models           jsonb,
  p_expected_version timestamp with time zone
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare source public.provider_catalog_sources%rowtype; result integer;
begin
  select * into source from public.provider_catalog_sources where provider_slug=p_provider_slug for update;
  if not found or source.management_mode <> 'remote' or p_expected_version is distinct from source.updated_at then raise exception 'provider_catalog_version_conflict'; end if;
  result := public.apply_provider_catalog_snapshot(p_provider_slug,p_run_id,p_models);
  update public.provider_catalog_sources set feed_models=p_feed_models where provider_slug=p_provider_slug;
  return result;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."apply_provider_catalog_feed_snapshot"(text, uuid, jsonb, jsonb, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.save_provider_catalog_overrides (
  p_provider_slug    text,
  p_actor_id         uuid,
  p_actor_kind       text,
  p_expected_version timestamp with time zone,
  p_changes          jsonb,
  p_feed_models      jsonb                    DEFAULT NULL::jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  source public.provider_catalog_sources%rowtype;
  change jsonb;
  model_id text;
  field_name text;
  old_value jsonb;
  fields jsonb;
  actor_name text;
  feed_value jsonb;
begin
  select * into source from public.provider_catalog_sources where provider_slug = p_provider_slug for update;
  if not found or source.management_mode <> 'remote' then raise exception 'provider_catalog_remote_source_required'; end if;
  if p_actor_kind not in ('phaseo','provider') or p_actor_id is null then raise exception 'provider_catalog_actor_required'; end if;
  select display_name into actor_name from public.users where user_id=p_actor_id;
  if p_expected_version is null or p_expected_version <> source.updated_at then raise exception 'provider_catalog_version_conflict'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 16000 then raise exception 'provider_catalog_changes_invalid'; end if;
  source.feed_models := coalesce(source.feed_models,p_feed_models);
  for change in select value from jsonb_array_elements(p_changes) loop
    model_id := change->>'model_id'; field_name := change->>'field';
    if model_id is null or field_name is null or field_name not in ('$model','$removed','name','description','providerModelSlug','inputModalities','outputModalities','contextLength','maxOutputTokens','availability','availableFrom','deprecatedAt','shutdownAt','capabilities','pricing','serviceTiers') then raise exception 'provider_catalog_override_field_invalid'; end if;
    fields := coalesce(source.catalog_overrides->model_id, '{}'::jsonb);
    old_value := fields->field_name;
    select model->field_name into feed_value from jsonb_array_elements(coalesce(source.feed_models,'[]'::jsonb)) model where model->>'id'=model_id limit 1;
    if coalesce((change->>'revert')::boolean, false) then
      if old_value is null then continue; end if;
      fields := fields - field_name;
    else
      fields := fields || jsonb_build_object(field_name, jsonb_build_object('value',coalesce(change->'value','null'::jsonb),'actor_id',p_actor_id,'actor_kind',p_actor_kind,'actor_name',actor_name,'edited_at',now()));
    end if;
    source.catalog_overrides := source.catalog_overrides || jsonb_build_object(model_id,fields);
    insert into public.provider_catalog_edit_events(provider_slug,model_slug,field,actor_id,actor_kind,actor_name,action,previous_value,value)
    values(p_provider_slug,model_id,field_name,p_actor_id,p_actor_kind,actor_name,case when coalesce((change->>'revert')::boolean,false) then 'revert' else 'override' end,coalesce(old_value->'value',feed_value),case when coalesce((change->>'revert')::boolean,false) then feed_value else change->'value' end);
  end loop;
  if jsonb_array_length(p_changes) > 0 then
    update public.provider_catalog_sources set feed_models=source.feed_models,catalog_overrides=source.catalog_overrides,overrides_updated_at=now(),refresh_requested=true,next_poll_at=now(),updated_at=now() where provider_slug=p_provider_slug;
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."save_provider_catalog_overrides"(text, uuid, text, timestamp WITH time zone, jsonb, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.save_provider_managed_catalog (
  p_provider_slug    text,
  p_actor_id         uuid,
  p_actor_kind       text,
  p_expected_version timestamp with time zone,
  p_document         jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare source public.provider_catalog_sources%rowtype; actor_name text;
begin
  select * into source from public.provider_catalog_sources where provider_slug=p_provider_slug for update;
  if not found or source.management_mode <> 'managed' then raise exception 'provider_catalog_managed_source_required'; end if;
  if p_expected_version is distinct from coalesce(source.managed_updated_at,source.updated_at) then raise exception 'provider_catalog_version_conflict'; end if;
  if p_actor_id is null or p_actor_kind not in ('phaseo','provider') or jsonb_typeof(p_document) <> 'object' then raise exception 'provider_catalog_edit_invalid'; end if;
  select display_name into actor_name from public.users where user_id=p_actor_id;
  insert into public.provider_catalog_edit_events(provider_slug,model_slug,field,actor_id,actor_kind,actor_name,action,previous_value,value)
  values(p_provider_slug,'*','$catalog',p_actor_id,p_actor_kind,actor_name,'override',source.managed_catalog,p_document);
  update public.provider_catalog_sources set managed_catalog=p_document,managed_updated_by=p_actor_id,managed_updated_at=now(),refresh_requested=true,next_poll_at=now(),etag=null,last_modified=null,last_error=null,updated_at=now() where provider_slug=p_provider_slug;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."save_provider_managed_catalog"(text, uuid, text, timestamp WITH time zone, jsonb) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "public"."provider_catalog_edit_events"
  ADD CONSTRAINT "provider_catalog_edit_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."provider_catalog_edit_events"
  ADD CONSTRAINT "provider_catalog_edit_events_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug);

ALTER TABLE "public"."provider_catalog_sources"
  ADD CONSTRAINT "provider_catalog_sources_feed_models_check" CHECK ((jsonb_typeof(feed_models) = 'array'::text));

ALTER TABLE "public"."provider_catalog_sources"
  ADD CONSTRAINT "provider_catalog_sources_overrides_check" CHECK ((jsonb_typeof(catalog_overrides) = 'object'::text));

CREATE INDEX provider_catalog_edit_events_provider_idx ON public.provider_catalog_edit_events USING btree (provider_slug, created_at DESC, id DESC);

REVOKE ALL ON FUNCTION "public"."apply_provider_catalog_feed_snapshot"(text, uuid, jsonb, jsonb, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_provider_catalog_feed_snapshot"(text, uuid, jsonb, jsonb, timestamp WITH time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_provider_catalog_feed_snapshot"(text, uuid, jsonb, jsonb, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_provider_catalog_overrides"(text, uuid, text, timestamp WITH time zone, jsonb, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_provider_catalog_overrides"(text, uuid, text, timestamp WITH time zone, jsonb, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_provider_catalog_overrides"(text, uuid, text, timestamp WITH time zone, jsonb, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_provider_managed_catalog"(text, uuid, text, timestamp WITH time zone, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_provider_managed_catalog"(text, uuid, text, timestamp WITH time zone, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_provider_managed_catalog"(text, uuid, text, timestamp WITH time zone, jsonb) TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_edit_events" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."provider_catalog_edit_events" TO "service_role";
