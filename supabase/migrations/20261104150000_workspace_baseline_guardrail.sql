-- Guardrail levels, phase B: the workspace baseline.
-- The workspace-wide privacy and restriction rules (Settings, Privacy; PATCH /v1/control/settings)
-- move from workspace_settings to a built-in access guardrail per workspace, assigned at workspace
-- level, which the gateway reads through resolve_key_guardrails like any other guardrail.
-- 1. workspace_guardrails.is_workspace_baseline, at most one per workspace, always kind 'access'.
-- 2. private.protect_workspace_baseline_guardrail: the baseline stays enabled, an access guardrail,
--    assigned to the whole workspace and nothing else, and cannot be deleted (except with its workspace).
-- 3. private.ensure_workspace_baseline_guardrail creates a baseline on first use;
--    public.save_workspace_baseline_guardrail saves the rules to it in one transaction.
-- 4. private.sync_workspace_baseline_guardrail keeps the baseline and the workspace_settings columns
--    equal in both directions. The columns are kept (and keep being written) so code deployed before or
--    after this migration, or rolled back, reads the same rules. Dropping them is a later, separately
--    confirmed step.
-- 5. resolve_key_guardrails(workspace, key, include_workspace_baseline): the form the gateway calls;
--    its existence tells the gateway to stop reading the rules from workspace_settings.
-- 6. Backfill: a baseline only for workspaces whose settings restrict something (on 2026-11-04, one).
--    Every other workspace gets one lazily, on its first save.
-- Migrations run without a transaction: the sync triggers and the backfill are created in one DO block
-- under a lock, so no settings write can fall between them. Nothing is deleted or dropped.

SET local check_function_bodies = off;

-- ---- 1. Marker
ALTER TABLE "public"."workspace_guardrails"
  ADD COLUMN "is_workspace_baseline" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."workspace_guardrails"
  ADD CONSTRAINT "workspace_guardrails_baseline_kind_check" CHECK (((NOT is_workspace_baseline) OR (kind = 'access'::text)));

CREATE UNIQUE INDEX workspace_guardrails_one_baseline_idx ON public.workspace_guardrails USING btree (workspace_id)
  WHERE is_workspace_baseline;

COMMENT ON COLUMN "public"."workspace_guardrails"."is_workspace_baseline" IS 'The workspace baseline: the built-in access guardrail holding the workspace-wide rules edited under Settings, Privacy, assigned to the whole workspace. At most one per workspace; created by private.ensure_workspace_baseline_guardrail and protected by private.protect_workspace_baseline_guardrail.';

-- ---- 2. Protection
CREATE OR REPLACE FUNCTION private.protect_workspace_baseline_guardrail()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- Runs with the caller's rights so current_user is the client role on a direct client insert.
-- The workspace baseline (workspace_guardrails.is_workspace_baseline) holds the workspace-wide rules
-- the Privacy page edits. It stays an enabled access guardrail in its workspace, assigned to the whole
-- workspace and to nothing else. Its name, description and rules can change; it cannot be deleted,
-- disabled, given another kind, unassigned, or assigned to a department, member or key. Only
-- private.ensure_workspace_baseline_guardrail creates one (clients cannot insert a baseline, and an
-- existing guardrail cannot become one). Deletes cascading from a deleted workspace pass.
declare
  v_protected boolean := false;
begin
  if tg_table_name = 'workspace_guardrails' then
    if tg_op = 'INSERT' then
      v_protected := new.is_workspace_baseline and current_user in ('anon', 'authenticated');
    elsif tg_op = 'DELETE' then
      v_protected := old.is_workspace_baseline and pg_catalog.pg_trigger_depth() = 1;
    else
      v_protected := old.is_workspace_baseline is distinct from new.is_workspace_baseline
        or (new.is_workspace_baseline and (
          new.kind is distinct from 'access'
          or not new.enabled
          or new.workspace_id is distinct from old.workspace_id));
    end if;
  else
    -- workspace_guardrail_assignments
    if tg_op in ('DELETE', 'UPDATE') and pg_catalog.pg_trigger_depth() = 1 then
      v_protected := exists (
        select 1 from public.workspace_guardrails g
        where g.id = old.guardrail_id and g.is_workspace_baseline
      );
    end if;
    if not v_protected and tg_op in ('INSERT', 'UPDATE') and new.target_type is distinct from 'workspace' then
      v_protected := exists (
        select 1 from public.workspace_guardrails g
        where g.id = new.guardrail_id and g.is_workspace_baseline
      );
    end if;
  end if;

  if v_protected then
    raise exception 'workspace_baseline_guardrail_protected'
      using errcode = '23514',
        detail = 'The workspace baseline holds the rules set under Settings, Privacy. It stays on, stays an access guardrail and applies to the whole workspace, and it cannot be deleted.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "private"."protect_workspace_baseline_guardrail"() IS 'Keeps each workspace''s baseline guardrail an enabled access guardrail assigned only to the whole workspace: it cannot be deleted (except with its workspace), disabled, change kind, be unassigned or be assigned at another level.';

REVOKE ALL ON FUNCTION "private"."protect_workspace_baseline_guardrail"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."protect_workspace_baseline_guardrail"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."protect_workspace_baseline_guardrail"() TO "postgres";

CREATE TRIGGER protect_workspace_baseline_guardrail
  BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_workspace_baseline_guardrail();

CREATE TRIGGER protect_workspace_baseline_guardrail
  BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_guardrail_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_workspace_baseline_guardrail();

-- ---- 3. Create and save
CREATE OR REPLACE FUNCTION private.ensure_workspace_baseline_guardrail (
  p_workspace_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The workspace's baseline guardrail, created on first use: an access guardrail holding the
-- workspace-wide rules the Privacy page edits, assigned to the whole workspace. A new baseline starts
-- from the workspace_settings privacy and restriction columns (defaults when there is no row), so
-- creating it never changes what the gateway enforces. Safe under concurrent first saves: the
-- partial unique index allows one baseline per workspace, and the loser of a race reads the winner's.
declare
  v_id uuid;
begin
  select g.id into v_id
  from public.workspace_guardrails g
  where g.workspace_id = p_workspace_id
    and g.is_workspace_baseline;

  if v_id is null then
    insert into public.workspace_guardrails (
      workspace_id, name, description, kind, enabled, is_workspace_baseline,
      privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts,
      privacy_enable_input_output_logging, privacy_zdr_only,
      provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed,
      model_restriction_mode, allowed_api_model_ids)
    select
      p_workspace_id, 'Workspace baseline', 'Workspace-wide data and routing rules, set under Settings, Privacy.', 'access', true, true,
      coalesce(s.privacy_enable_paid_may_train, true), coalesce(s.privacy_enable_free_may_train, true),
      coalesce(s.privacy_enable_free_may_publish_prompts, true), coalesce(s.privacy_enable_input_output_logging, true),
      coalesce(s.privacy_zdr_only, false),
      coalesce(s.provider_restriction_mode, 'none'), coalesce(s.provider_restriction_provider_ids, '{}'),
      coalesce(s.provider_restriction_enforce_allowed, false),
      coalesce(s.model_restriction_mode, 'none'), coalesce(s.model_restriction_model_ids, '{}')
    from (select 1) as one
    left join public.workspace_settings s on s.workspace_id = p_workspace_id
    on conflict (workspace_id) where is_workspace_baseline do nothing
    returning id into v_id;

    if v_id is null then
      select g.id into v_id
      from public.workspace_guardrails g
      where g.workspace_id = p_workspace_id
        and g.is_workspace_baseline;
    end if;
  end if;

  insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
  values (p_workspace_id, v_id, 'workspace', null)
  on conflict do nothing;

  return v_id;
end;
$function$;

COMMENT ON FUNCTION "private"."ensure_workspace_baseline_guardrail"(uuid) IS 'Returns the workspace''s baseline guardrail, creating it (from the workspace_settings privacy and restriction columns) and its workspace assignment when missing.';

REVOKE ALL ON FUNCTION "private"."ensure_workspace_baseline_guardrail"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."ensure_workspace_baseline_guardrail"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."ensure_workspace_baseline_guardrail"(uuid) TO "postgres";

CREATE OR REPLACE FUNCTION public.save_workspace_baseline_guardrail (
  p_workspace_id uuid,
  p_settings     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Saves the workspace-wide rules (Settings, Privacy and PATCH /v1/control/settings) to the
-- workspace's baseline guardrail in one transaction, creating the baseline and its workspace
-- assignment first when the workspace has none. p_settings holds only the columns to change, named as
-- on workspace_guardrails (allowed_api_model_ids, not model_restriction_model_ids); a key that is
-- missing or null keeps its value. private.sync_workspace_baseline_guardrail copies the result to the
-- workspace_settings columns. Returns the saved baseline row.
declare
  v_id uuid;
  v_unknown text;
  v_row public.workspace_guardrails;
begin
  if p_workspace_id is null or p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'invalid_workspace_baseline_settings' using errcode = '22023';
  end if;

  select key into v_unknown
  from jsonb_object_keys(p_settings) as key
  where key not in (
    'privacy_enable_paid_may_train', 'privacy_enable_free_may_train', 'privacy_enable_free_may_publish_prompts',
    'privacy_enable_input_output_logging', 'privacy_zdr_only',
    'provider_restriction_mode', 'provider_restriction_provider_ids', 'provider_restriction_enforce_allowed',
    'model_restriction_mode', 'allowed_api_model_ids')
  limit 1;
  if v_unknown is not null then
    raise exception 'invalid_workspace_baseline_settings'
      using errcode = '22023', detail = format('%s is not a workspace baseline setting.', v_unknown);
  end if;

  v_id := private.ensure_workspace_baseline_guardrail(p_workspace_id);

  update public.workspace_guardrails g set
    privacy_enable_paid_may_train = coalesce((p_settings ->> 'privacy_enable_paid_may_train')::boolean, g.privacy_enable_paid_may_train),
    privacy_enable_free_may_train = coalesce((p_settings ->> 'privacy_enable_free_may_train')::boolean, g.privacy_enable_free_may_train),
    privacy_enable_free_may_publish_prompts = coalesce((p_settings ->> 'privacy_enable_free_may_publish_prompts')::boolean, g.privacy_enable_free_may_publish_prompts),
    privacy_enable_input_output_logging = coalesce((p_settings ->> 'privacy_enable_input_output_logging')::boolean, g.privacy_enable_input_output_logging),
    privacy_zdr_only = coalesce((p_settings ->> 'privacy_zdr_only')::boolean, g.privacy_zdr_only),
    provider_restriction_mode = coalesce(p_settings ->> 'provider_restriction_mode', g.provider_restriction_mode),
    provider_restriction_provider_ids = case
      when jsonb_typeof(p_settings -> 'provider_restriction_provider_ids') = 'array'
        then array(select jsonb_array_elements_text(p_settings -> 'provider_restriction_provider_ids'))
      else g.provider_restriction_provider_ids
    end,
    provider_restriction_enforce_allowed = coalesce((p_settings ->> 'provider_restriction_enforce_allowed')::boolean, g.provider_restriction_enforce_allowed),
    model_restriction_mode = coalesce(p_settings ->> 'model_restriction_mode', g.model_restriction_mode),
    allowed_api_model_ids = case
      when jsonb_typeof(p_settings -> 'allowed_api_model_ids') = 'array'
        then array(select jsonb_array_elements_text(p_settings -> 'allowed_api_model_ids'))
      else g.allowed_api_model_ids
    end,
    updated_at = now()
  where g.id = v_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

COMMENT ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) IS 'Saves the workspace-wide privacy and restriction rules to the workspace baseline guardrail, creating it (and its workspace assignment) if missing, in one transaction. Mirrored to workspace_settings by a trigger. Service role only.';

GRANT EXECUTE ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

-- ---- 4. Two-way copy (the triggers are created with the backfill below)
CREATE OR REPLACE FUNCTION private.sync_workspace_baseline_guardrail()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Keeps a workspace's baseline guardrail and the privacy and restriction columns of its
-- workspace_settings row equal, in both directions, while those columns still exist (dropping them is
-- a later, separately confirmed step). The gateway reads the baseline; older code may still read or
-- write the columns:
-- * workspace_guardrails (the baseline changed): copy its values to workspace_settings, creating the
--   row if needed. allowed_api_model_ids is stored there as model_restriction_model_ids.
-- * workspace_settings (code that still writes the columns): copy the values to the baseline, and
--   create the baseline when the workspace has none and the values restrict anything.
-- Each direction writes only values that differ, so the write it causes in the other table changes
-- nothing there and the pair settles after one hop.
begin
  if tg_table_name = 'workspace_guardrails' then
    insert into public.workspace_settings as s (
      workspace_id,
      privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts,
      privacy_enable_input_output_logging, privacy_zdr_only,
      provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed,
      model_restriction_mode, model_restriction_model_ids)
    values (
      new.workspace_id,
      new.privacy_enable_paid_may_train, new.privacy_enable_free_may_train, new.privacy_enable_free_may_publish_prompts,
      new.privacy_enable_input_output_logging, new.privacy_zdr_only,
      new.provider_restriction_mode, new.provider_restriction_provider_ids, new.provider_restriction_enforce_allowed,
      new.model_restriction_mode, new.allowed_api_model_ids)
    on conflict (workspace_id) do update set
      privacy_enable_paid_may_train = excluded.privacy_enable_paid_may_train,
      privacy_enable_free_may_train = excluded.privacy_enable_free_may_train,
      privacy_enable_free_may_publish_prompts = excluded.privacy_enable_free_may_publish_prompts,
      privacy_enable_input_output_logging = excluded.privacy_enable_input_output_logging,
      privacy_zdr_only = excluded.privacy_zdr_only,
      provider_restriction_mode = excluded.provider_restriction_mode,
      provider_restriction_provider_ids = excluded.provider_restriction_provider_ids,
      provider_restriction_enforce_allowed = excluded.provider_restriction_enforce_allowed,
      model_restriction_mode = excluded.model_restriction_mode,
      model_restriction_model_ids = excluded.model_restriction_model_ids,
      updated_at = now()
    where (
      s.privacy_enable_paid_may_train, s.privacy_enable_free_may_train, s.privacy_enable_free_may_publish_prompts,
      s.privacy_enable_input_output_logging, s.privacy_zdr_only,
      s.provider_restriction_mode, s.provider_restriction_provider_ids, s.provider_restriction_enforce_allowed,
      s.model_restriction_mode, s.model_restriction_model_ids
    ) is distinct from (
      excluded.privacy_enable_paid_may_train, excluded.privacy_enable_free_may_train, excluded.privacy_enable_free_may_publish_prompts,
      excluded.privacy_enable_input_output_logging, excluded.privacy_zdr_only,
      excluded.provider_restriction_mode, excluded.provider_restriction_provider_ids, excluded.provider_restriction_enforce_allowed,
      excluded.model_restriction_mode, excluded.model_restriction_model_ids
    );
    return null;
  end if;

  -- workspace_settings
  update public.workspace_guardrails g set
    privacy_enable_paid_may_train = new.privacy_enable_paid_may_train,
    privacy_enable_free_may_train = new.privacy_enable_free_may_train,
    privacy_enable_free_may_publish_prompts = new.privacy_enable_free_may_publish_prompts,
    privacy_enable_input_output_logging = new.privacy_enable_input_output_logging,
    privacy_zdr_only = new.privacy_zdr_only,
    provider_restriction_mode = new.provider_restriction_mode,
    provider_restriction_provider_ids = new.provider_restriction_provider_ids,
    provider_restriction_enforce_allowed = new.provider_restriction_enforce_allowed,
    model_restriction_mode = new.model_restriction_mode,
    allowed_api_model_ids = new.model_restriction_model_ids,
    updated_at = now()
  where g.workspace_id = new.workspace_id
    and g.is_workspace_baseline
    and (
      g.privacy_enable_paid_may_train, g.privacy_enable_free_may_train, g.privacy_enable_free_may_publish_prompts,
      g.privacy_enable_input_output_logging, g.privacy_zdr_only,
      g.provider_restriction_mode, g.provider_restriction_provider_ids, g.provider_restriction_enforce_allowed,
      g.model_restriction_mode, g.allowed_api_model_ids
    ) is distinct from (
      new.privacy_enable_paid_may_train, new.privacy_enable_free_may_train, new.privacy_enable_free_may_publish_prompts,
      new.privacy_enable_input_output_logging, new.privacy_zdr_only,
      new.provider_restriction_mode, new.provider_restriction_provider_ids, new.provider_restriction_enforce_allowed,
      new.model_restriction_mode, new.model_restriction_model_ids
    );

  if not found
    and not (
      new.privacy_enable_paid_may_train and new.privacy_enable_free_may_train
      and new.privacy_enable_free_may_publish_prompts and new.privacy_enable_input_output_logging
      and not new.privacy_zdr_only
      and new.provider_restriction_mode = 'none' and not new.provider_restriction_enforce_allowed
      and new.model_restriction_mode = 'none')
    and not exists (
      select 1 from public.workspace_guardrails g
      where g.workspace_id = new.workspace_id and g.is_workspace_baseline)
  then
    perform private.ensure_workspace_baseline_guardrail(new.workspace_id);
  end if;
  return null;
end;
$function$;

COMMENT ON FUNCTION "private"."sync_workspace_baseline_guardrail"() IS 'Keeps the workspace baseline guardrail and the workspace_settings privacy and restriction columns equal in both directions, creating the baseline when older code saves restricting values for a workspace without one.';

REVOKE ALL ON FUNCTION "private"."sync_workspace_baseline_guardrail"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."sync_workspace_baseline_guardrail"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."sync_workspace_baseline_guardrail"() TO "postgres";

-- ---- 5. Resolution with the baseline
CREATE OR REPLACE FUNCTION public.resolve_key_guardrails (
  p_workspace_id               uuid,
  p_key_id                     uuid,
  p_include_workspace_baseline boolean
)
  RETURNS TABLE (
    guardrail_id uuid,
    source_type  text,
    source_id    uuid
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- resolve_key_guardrails(workspace, key), with or without the workspace baseline (the workspace-wide
  -- rules from Settings, Privacy, assigned at workspace level). The gateway calls this form: its
  -- existence tells it the baseline holds those rules, so it stops reading them from workspace_settings.
  -- Workspace-level guardrails apply even when p_key_id is not a row in keys: an OAuth access token
  -- authenticates with its client id, and must still get the workspace's rules (zero data retention
  -- included), as it did when the gateway read them from workspace_settings.
  with resolved as (
    select key_level.guardrail_id, key_level.source_type, key_level.source_id
    from public.resolve_key_guardrails(p_workspace_id, p_key_id) as key_level
    where key_level.source_type <> 'workspace'
    union all
    select a.guardrail_id, a.target_type, a.target_id
    from public.workspace_guardrail_assignments a
    where a.workspace_id = p_workspace_id
      and a.target_type = 'workspace'
      and a.target_id is null
  )
  select resolved.guardrail_id, resolved.source_type, resolved.source_id
  from resolved
  join public.workspace_guardrails g
    on g.id = resolved.guardrail_id
   and g.workspace_id = p_workspace_id
   and g.enabled
  where coalesce(p_include_workspace_baseline, true) or not g.is_workspace_baseline
  order by resolved.guardrail_id, resolved.source_type, resolved.source_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid, boolean) TO "service_role";

COMMENT ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid, boolean) IS 'resolve_key_guardrails(workspace, key) with the workspace baseline guardrail included or left out, and the workspace-level guardrails even for an id with no keys row (an OAuth access token''s client id). The gateway calls this form once the baseline holds the workspace-wide rules.';

REVOKE ALL ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid, boolean) FROM PUBLIC, "anon", "authenticated";

-- ---- 6. Triggers and backfill
DO $migration$
BEGIN
  LOCK TABLE public.workspace_settings, public.workspace_guardrails IN SHARE ROW EXCLUSIVE MODE;

CREATE TRIGGER sync_workspace_baseline_guardrail
  AFTER INSERT OR UPDATE OF privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts, privacy_enable_input_output_logging, privacy_zdr_only, provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed, model_restriction_mode, model_restriction_model_ids ON public.workspace_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_workspace_baseline_guardrail();

CREATE TRIGGER sync_workspace_baseline_guardrail
  AFTER INSERT OR UPDATE ON public.workspace_guardrails
  FOR EACH ROW
  WHEN (new.is_workspace_baseline)
  EXECUTE FUNCTION private.sync_workspace_baseline_guardrail();

  -- Unrestricted means every column at its default: training, prompt publishing and logging allowed,
  -- zero data retention not required, no provider or model list in force, enforce_allowed off.
  PERFORM private.ensure_workspace_baseline_guardrail(s.workspace_id)
  FROM public.workspace_settings s
  WHERE NOT (
    s.privacy_enable_paid_may_train AND s.privacy_enable_free_may_train
    AND s.privacy_enable_free_may_publish_prompts AND s.privacy_enable_input_output_logging
    AND NOT s.privacy_zdr_only
    AND s.provider_restriction_mode = 'none' AND NOT s.provider_restriction_enforce_allowed
    AND s.model_restriction_mode = 'none');
END
$migration$;
