-- Successor routing, step 1 of 2: admin approval and the unserved clock.
--
-- v2_model_successor_routing records, per model, whether an admin approved
-- routing to its replacement_model_slug and when the model stopped being
-- served. Nothing routes on it yet; the gateway redirect ships separately.
-- The state lives in a sidecar so the hourly stamp does not touch v2_models,
-- its row history or the gateway catalogue invalidation triggers.
--
-- The first run stamps models that are already unserved with the run time,
-- so any grace period starts from deployment.

CREATE TABLE "public"."v2_model_successor_routing" (
  "model_slug"              text                     NOT NULL,
  "unserved_since"          timestamp with time zone,
  "auto_route_enabled"      boolean                  NOT NULL DEFAULT false,
  "approved_successor_slug" text,
  "approved_by"             uuid,
  "approved_at"             timestamp with time zone,
  "compatibility"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "notes"                   text,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_model_successor_routing_approval_check"
    CHECK (((NOT auto_route_enabled) OR ((approved_successor_slug IS NOT NULL) AND (approved_at IS NOT NULL)))),
  CONSTRAINT "v2_model_successor_routing_not_self_check" CHECK (((approved_successor_slug IS NULL) OR (approved_successor_slug <> model_slug))),
  CONSTRAINT "v2_model_successor_routing_pkey" PRIMARY KEY (model_slug),
  CONSTRAINT "v2_model_successor_routing_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "v2_model_successor_routing_approved_successor_slug_fkey" FOREIGN KEY (approved_successor_slug) REFERENCES public.v2_models(model_slug) ON DELETE SET NULL,
  CONSTRAINT "v2_model_successor_routing_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_model_successor_routing"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_model_successor_routing_approved_successor_idx ON public.v2_model_successor_routing USING btree (approved_successor_slug)
  WHERE (approved_successor_slug IS NOT NULL);

CREATE INDEX v2_model_successor_routing_unserved_idx ON public.v2_model_successor_routing USING btree (unserved_since)
  WHERE (unserved_since IS NOT NULL);

CREATE POLICY "service_role_full_access" ON "public"."v2_model_successor_routing"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE "public"."v2_model_successor_routing" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."v2_model_successor_routing" TO "service_role";

COMMENT ON TABLE "public"."v2_model_successor_routing" IS 'Admin approval to route requests for a model to its replacement_model_slug once no provider serves it, plus the time it stopped being served. Approval is tied to approved_successor_slug and lapses if replacement_model_slug changes.';

REVOKE ALL ON TABLE "public"."v2_model_successor_routing" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.v2_model_has_routable_route (
  p_model_slug text,
  p_at         timestamp with time zone DEFAULT now()
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  -- Mirrors the route filter in gateway_fetch_public_catalog_at for any endpoint,
  -- ignoring model status: this asks whether a provider still serves the model.
  -- BYOK-only routes count as served.
  select exists (
    select 1
    from public.v2_model_provider_routes r
    join public.v2_providers p on p.provider_slug=r.provider_slug
    join public.v2_route_capabilities c on c.provider_model_id=r.provider_model_id
    where r.model_slug=p_model_slug
      and r.routing_enabled
      and (p.status <> 'external' or coalesce(r.metadata->>'external_routing_override', 'false') = 'true')
      and (r.effective_from is null or r.effective_from<=p_at)
      and (r.effective_to is null or p_at<r.effective_to)
      and c.status in ('active','deranked','deranked_lvl1','deranked_lvl2','deranked_lvl3')
      and (c.effective_from is null or c.effective_from<=p_at)
      and (c.effective_to is null or p_at<c.effective_to)
  )
$function$;

GRANT EXECUTE ON FUNCTION "public"."v2_model_has_routable_route"(text, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."v2_model_has_routable_route"(text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."v2_model_has_routable_route"(text, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."v2_model_has_routable_route"(text, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.refresh_model_unserved_since ()
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_now timestamptz := now(); v_marked integer; v_cleared integer;
begin
  -- Stamps when a model stopped being served and clears the stamp when a route
  -- comes back. Models that never had a route are not tracked. Rows are only
  -- written on a change, so an hourly run is cheap.
  with unserved as (
    select m.model_slug
    from public.v2_models m
    where not m.hidden
      and m.status in ('active','deprecated','retired')
      and exists (select 1 from public.v2_model_provider_routes r where r.model_slug=m.model_slug)
      and not public.v2_model_has_routable_route(m.model_slug, v_now)
  ), marked as (
    insert into public.v2_model_successor_routing as s (model_slug, unserved_since)
    select model_slug, v_now from unserved
    on conflict (model_slug) do update set unserved_since=v_now, updated_at=v_now
      where s.unserved_since is null
    returning 1
  ), cleared as (
    update public.v2_model_successor_routing s set unserved_since=null, updated_at=v_now
    where s.unserved_since is not null
      and not exists (select 1 from unserved u where u.model_slug=s.model_slug)
    returning 1
  )
  select (select count(*) from marked), (select count(*) from cleared) into v_marked, v_cleared;
  return jsonb_build_object('marked', v_marked, 'cleared', v_cleared, 'checked_at', v_now);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_model_unserved_since"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_model_unserved_since"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_model_unserved_since"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_model_unserved_since"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_model_successor_routing (
  p_model_slug text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_model public.v2_models%rowtype; v_successor public.v2_models%rowtype; v_state public.v2_model_successor_routing%rowtype;
  v_missing_in text[]; v_missing_out text[]; v_context integer; v_successor_context integer; v_served boolean;
  v_blocking text[] := '{}'; v_warnings text[] := '{}'; v_compatibility jsonb;
begin
  select * into v_model from public.v2_models where model_slug=p_model_slug;
  if not found then raise exception 'model % does not exist', p_model_slug; end if;
  select * into v_state from public.v2_model_successor_routing where model_slug=p_model_slug;

  if v_model.replacement_model_slug is not null then
    select * into v_successor from public.v2_models where model_slug=v_model.replacement_model_slug;
  end if;
  if v_successor.model_slug is not null then
    select coalesce(array_agg(x),'{}') into v_missing_in from unnest(v_model.input_modalities) x where not x = any(v_successor.input_modalities);
    select coalesce(array_agg(x),'{}') into v_missing_out from unnest(v_model.output_modalities) x where not x = any(v_successor.output_modalities);
    select max(context_length) into v_context from public.v2_model_provider_routes where model_slug=v_model.model_slug;
    select max(context_length) into v_successor_context from public.v2_model_provider_routes where model_slug=v_successor.model_slug;
    v_served := public.v2_model_has_routable_route(v_successor.model_slug);

    -- Blocking issues can never be approved; warnings need an explicit override.
    if v_model.variant_kind='free' and v_successor.variant_kind<>'free' then v_blocking := v_blocking || 'free_to_paid'::text; end if;
    if v_successor.hidden then v_blocking := v_blocking || 'successor_hidden'::text; end if;
    if v_successor.status not in ('active','deprecated','retired') then v_blocking := v_blocking || 'successor_inactive'::text; end if;
    if cardinality(v_missing_in) > 0 then v_warnings := v_warnings || 'missing_input_modalities'::text; end if;
    if cardinality(v_missing_out) > 0 then v_warnings := v_warnings || 'missing_output_modalities'::text; end if;
    if v_context is not null and (v_successor_context is null or v_successor_context < v_context) then v_warnings := v_warnings || 'smaller_context'::text; end if;
    if not v_served then v_warnings := v_warnings || 'successor_not_served'::text; end if;

    v_compatibility := jsonb_build_object(
      'successor', v_successor.model_slug, 'successor_status', v_successor.status, 'successor_served', v_served,
      'missing_input_modalities', to_jsonb(v_missing_in), 'missing_output_modalities', to_jsonb(v_missing_out),
      'context_length', v_context, 'successor_context_length', v_successor_context,
      'blocking', to_jsonb(v_blocking), 'warnings', to_jsonb(v_warnings));
  end if;

  return jsonb_build_object(
    'model_slug', v_model.model_slug,
    'replacement_model_slug', v_model.replacement_model_slug,
    'unserved_since', v_state.unserved_since,
    'auto_route_enabled', coalesce(v_state.auto_route_enabled, false),
    'approved_successor_slug', v_state.approved_successor_slug,
    'approved_by', v_state.approved_by,
    'approved_at', v_state.approved_at,
    'approved_compatibility', coalesce(v_state.compatibility, '{}'::jsonb),
    'notes', v_state.notes,
    -- An approval only covers the successor that was reviewed.
    'approval_current', coalesce(v_state.auto_route_enabled, false) and v_state.approved_successor_slug is not distinct from v_model.replacement_model_slug,
    'compatibility', v_compatibility);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."get_model_successor_routing"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_model_successor_routing"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_model_successor_routing"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_model_successor_routing"(text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.set_model_successor_routing (
  p_actor_user_id      uuid,
  p_model_slug         text,
  p_enabled            boolean,
  p_allow_incompatible boolean DEFAULT false,
  p_notes              text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_before jsonb; v_current jsonb; v_compatibility jsonb; v_successor text;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  perform 1 from public.v2_models where model_slug=p_model_slug for update;
  if not found then raise exception 'model % does not exist', p_model_slug; end if;

  v_before := public.get_model_successor_routing(p_model_slug);
  if p_enabled then
    v_successor := v_before->>'replacement_model_slug';
    v_compatibility := v_before->'compatibility';
    if v_successor is null or v_compatibility is null or jsonb_typeof(v_compatibility) <> 'object' then
      raise exception 'Set a replacement model before approving successor routing.';
    end if;
    if jsonb_array_length(v_compatibility->'blocking') > 0 then
      raise exception 'Successor % cannot be approved: %', v_successor, (select string_agg(x,', ') from jsonb_array_elements_text(v_compatibility->'blocking') x);
    end if;
    if jsonb_array_length(v_compatibility->'warnings') > 0 and not coalesce(p_allow_incompatible,false) then
      raise exception 'Successor % has compatibility warnings: %. Accept them to approve.', v_successor, (select string_agg(x,', ') from jsonb_array_elements_text(v_compatibility->'warnings') x);
    end if;
    insert into public.v2_model_successor_routing as s (model_slug, auto_route_enabled, approved_successor_slug, approved_by, approved_at, compatibility, notes)
    values (p_model_slug, true, v_successor, p_actor_user_id, now(),
      v_compatibility || jsonb_build_object('accepted_warnings', jsonb_array_length(v_compatibility->'warnings') > 0), nullif(btrim(p_notes),''))
    on conflict (model_slug) do update set auto_route_enabled=true, approved_successor_slug=excluded.approved_successor_slug,
      approved_by=excluded.approved_by, approved_at=excluded.approved_at, compatibility=excluded.compatibility,
      notes=coalesce(excluded.notes, s.notes), updated_at=now();
  else
    update public.v2_model_successor_routing set auto_route_enabled=false, approved_successor_slug=null, approved_by=null,
      approved_at=null, compatibility='{}'::jsonb, notes=coalesce(nullif(btrim(p_notes),''), notes), updated_at=now()
    where model_slug=p_model_slug;
  end if;

  v_current := public.get_model_successor_routing(p_model_slug);
  if v_current is distinct from v_before then
    insert into public.v2_catalogue_admin_changes (actor_user_id, resource_type, resource_id, action, before_state, after_state)
    values (p_actor_user_id, 'models', p_model_slug, 'update',
      jsonb_build_object('successor_routing', v_before), jsonb_build_object('successor_routing', v_current));
  end if;
  return v_current;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."set_model_successor_routing"(uuid, text, boolean, boolean, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_model_successor_routing"(uuid, text, boolean, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_model_successor_routing"(uuid, text, boolean, boolean, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_model_successor_routing"(uuid, text, boolean, boolean, text) FROM PUBLIC, "anon", "authenticated";

select cron.schedule('track-model-unserved-since', '41 * * * *',
  $job$set statement_timeout = '60s'; set lock_timeout = '5s'; select public.refresh_model_unserved_since();$job$);
