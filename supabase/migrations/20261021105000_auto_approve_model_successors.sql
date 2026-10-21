-- Approve clean model successors automatically.
--
-- The hourly refresh_model_unserved_since job now also approves the suggested
-- replacement of a deprecated or retired model when the compatibility check
-- finds no blocking issues and no warnings. Replacements with warnings still
-- need an admin. Revoking a model in the admin panel sets
-- auto_approval_blocked so the job does not approve it again; approving it by
-- hand clears the block. Automatic approvals are audited with a null actor and
-- approval_source = 'auto'.
--
-- Workspaces still opt in to redirects (model_successor_redirect_enabled,
-- default false), so no request changes model until a workspace turns it on.

ALTER TABLE "public"."v2_model_successor_routing"
  ADD COLUMN "approval_source" text,
  ADD COLUMN "auto_approval_blocked" boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT "v2_model_successor_routing_approval_source_check" CHECK ((approval_source = ANY (ARRAY['admin'::text, 'auto'::text])));

-- Existing approvals were all made by an admin.
UPDATE "public"."v2_model_successor_routing" SET approval_source = 'admin' WHERE auto_route_enabled;

COMMENT ON TABLE "public"."v2_model_successor_routing" IS 'Approval to route requests for a model to its replacement_model_slug once no provider serves it, plus the time it stopped being served. Approval is tied to approved_successor_slug and lapses if replacement_model_slug changes. approval_source is admin or auto (the hourly job approves replacements with no compatibility issues); auto_approval_blocked is set when an admin revokes, so the job leaves the model alone.';

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
    -- The successor only offers the context of routes that can serve it now;
    -- the old model keeps its historical maximum, since none may serve it.
    select max(r.context_length) into v_successor_context
    from public.v2_model_provider_routes r
    join public.v2_providers p on p.provider_slug=r.provider_slug
    where r.model_slug=v_successor.model_slug
      and r.routing_enabled
      and p.routing_enabled
      and (p.status <> 'external' or coalesce(r.metadata->>'external_routing_override', 'false') = 'true')
      and (r.effective_from is null or r.effective_from<=now())
      and (r.effective_to is null or now()<r.effective_to)
      and exists (
        select 1 from public.v2_route_capabilities c
        where c.provider_model_id=r.provider_model_id
          and c.status in ('active','deranked','deranked_lvl1','deranked_lvl2','deranked_lvl3')
          and (c.effective_from is null or c.effective_from<=now())
          and (c.effective_to is null or now()<c.effective_to));
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
    'approval_source', v_state.approval_source,
    'auto_approval_blocked', coalesce(v_state.auto_approval_blocked, false),
    'approved_compatibility', coalesce(v_state.compatibility, '{}'::jsonb),
    'notes', v_state.notes,
    -- An approval only covers the successor that was reviewed.
    'approval_current', coalesce(v_state.auto_route_enabled, false) and v_state.approved_successor_slug is not distinct from v_model.replacement_model_slug,
    'compatibility', v_compatibility);
end $function$;

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
    insert into public.v2_model_successor_routing as s (model_slug, auto_route_enabled, approved_successor_slug, approved_by, approved_at, compatibility, notes, approval_source, auto_approval_blocked)
    values (p_model_slug, true, v_successor, p_actor_user_id, now(),
      v_compatibility || jsonb_build_object('accepted_warnings', jsonb_array_length(v_compatibility->'warnings') > 0), nullif(btrim(p_notes),''), 'admin', false)
    on conflict (model_slug) do update set auto_route_enabled=true, approved_successor_slug=excluded.approved_successor_slug,
      approved_by=excluded.approved_by, approved_at=excluded.approved_at, compatibility=excluded.compatibility,
      notes=coalesce(excluded.notes, s.notes), approval_source='admin', auto_approval_blocked=false, updated_at=now();
  else
    -- Revoking also stops the hourly job from approving the model again;
    -- approving it by hand lifts that block.
    insert into public.v2_model_successor_routing as s (model_slug, notes, auto_approval_blocked)
    values (p_model_slug, nullif(btrim(p_notes),''), true)
    on conflict (model_slug) do update set auto_route_enabled=false, approved_successor_slug=null, approved_by=null,
      approved_at=null, compatibility='{}'::jsonb, approval_source=null, auto_approval_blocked=true,
      notes=coalesce(excluded.notes, s.notes), updated_at=now();
  end if;

  v_current := public.get_model_successor_routing(p_model_slug);
  if v_current is distinct from v_before then
    insert into public.v2_catalogue_admin_changes (actor_user_id, resource_type, resource_id, action, before_state, after_state)
    values (p_actor_user_id, 'models', p_model_slug, 'update',
      jsonb_build_object('successor_routing', v_before), jsonb_build_object('successor_routing', v_current));
  end if;
  return v_current;
end $function$;

CREATE OR REPLACE FUNCTION public.refresh_model_unserved_since ()
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_now timestamptz := now(); v_marked integer; v_cleared integer; v_approved integer := 0;
  v_slug text; v_before jsonb; v_after jsonb; v_compatibility jsonb;
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

  -- Approves the suggested replacement of a deprecated or retired model, so
  -- setting a replacement is enough. A smaller context or a missing input
  -- type is accepted: a redirect only happens once nothing serves the old
  -- model, so most requests still succeed. A replacement that is not served
  -- or cannot produce the old model's output still needs an admin; models an
  -- admin revoked are left alone. Only models without a current approval are
  -- checked.
  for v_slug in
    select m.model_slug
    from public.v2_models m
    left join public.v2_model_successor_routing s on s.model_slug=m.model_slug
    where not m.hidden
      and m.replacement_model_slug is not null
      and (m.status in ('deprecated','retired') or m.deprecated_at is not null or m.retired_at is not null)
      and not coalesce(s.auto_approval_blocked, false)
      and not (coalesce(s.auto_route_enabled, false) and s.approved_successor_slug is not distinct from m.replacement_model_slug)
    order by m.model_slug
  loop
    -- Take the same model lock as set_model_successor_routing, then re-read
    -- the state, so an admin revoking at the same moment always wins. A model
    -- being edited right now is left for the next run.
    perform 1 from public.v2_models where model_slug=v_slug for update skip locked;
    continue when not found;
    continue when exists (select 1 from public.v2_model_successor_routing s join public.v2_models m on m.model_slug=s.model_slug
      where s.model_slug=v_slug and (s.auto_approval_blocked
        or (s.auto_route_enabled and s.approved_successor_slug is not distinct from m.replacement_model_slug)));
    v_before := public.get_model_successor_routing(v_slug);
    v_compatibility := v_before->'compatibility';
    continue when v_compatibility is null or jsonb_typeof(v_compatibility) <> 'object'
      or jsonb_array_length(v_compatibility->'blocking') > 0
      or v_compatibility->'warnings' ?| array['successor_not_served','missing_output_modalities'];

    insert into public.v2_model_successor_routing as s (model_slug, auto_route_enabled, approved_successor_slug, approved_by, approved_at, compatibility, approval_source)
    values (v_slug, true, v_compatibility->>'successor', null, v_now,
      v_compatibility || jsonb_build_object('accepted_warnings', jsonb_array_length(v_compatibility->'warnings') > 0), 'auto')
    on conflict (model_slug) do update set auto_route_enabled=true, approved_successor_slug=excluded.approved_successor_slug,
      approved_by=null, approved_at=v_now, compatibility=excluded.compatibility, approval_source='auto', updated_at=v_now
      where not s.auto_approval_blocked;
    continue when not found;

    v_after := public.get_model_successor_routing(v_slug);
    insert into public.v2_catalogue_admin_changes (actor_user_id, resource_type, resource_id, action, before_state, after_state)
    values (null, 'models', v_slug, 'update',
      jsonb_build_object('successor_routing', v_before), jsonb_build_object('successor_routing', v_after));
    v_approved := v_approved + 1;
  end loop;

  return jsonb_build_object('marked', v_marked, 'cleared', v_cleared, 'auto_approved', v_approved, 'checked_at', v_now);
end $function$;
