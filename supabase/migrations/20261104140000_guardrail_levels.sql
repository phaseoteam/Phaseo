-- phaseo:allow-destructive-migration reason: creates private.sync_guardrail_assignments and a new public.apply_guardrail_assignment_change, whose DELETEs only remove guardrail assignment rows that an admin removes (or that mirror a removed key_guardrails / workspace_member_guardrails row or a deleted department). This migration itself deletes no data and drops nothing.

-- Guardrail levels, phase A (no visible change).
-- 1. workspace_guardrails.kind: access, safety, spend or rate. Existing guardrails become 'safety'
--    when prompt injection or sensitive info is on and no access setting is, else 'access'. The
--    'access' default stays so inserts from code deployed before this migration keep working.
-- 2. workspace_guardrail_assignments: one table for workspace, department, member and key levels,
--    backfilled from key_guardrails and workspace_member_guardrails, which keep being written and
--    are copied into it one way by private.sync_guardrail_assignments. The old tables are kept.
-- 3. resolve_key_guardrails: the enabled guardrails that apply to a key, and the level of each.
-- 4. apply_guardrail_assignment_change accepts workspace and department targets.
-- 5. Department membership changes (grants, overrides, a key's department) and assignment changes
--    queue a gateway workspace publication, which invalidates the workspace's cached key policies.
-- Migrations run without a transaction: the backfill and the copy triggers are created in one DO
-- block under a lock, so no legacy write can fall between them.

SET local check_function_bodies = off;

-- ---- 1. kind
ALTER TABLE "public"."workspace_guardrails"
  ADD COLUMN "kind" text NOT NULL DEFAULT 'access'::text;

ALTER TABLE "public"."workspace_guardrails"
  ADD CONSTRAINT "workspace_guardrails_kind_check" CHECK ((kind = ANY (ARRAY['access'::text, 'safety'::text, 'spend'::text, 'rate'::text])));

COMMENT ON COLUMN "public"."workspace_guardrails"."kind" IS 'What the guardrail controls: access (data retention, training, logging, allowed providers and models), safety (prompt injection, sensitive info), spend or rate. One kind per guardrail.';

UPDATE public.workspace_guardrails
SET kind = 'safety'
WHERE kind = 'access'
  AND (prompt_injection_enabled OR sensitive_info_enabled)
  AND privacy_enable_paid_may_train
  AND privacy_enable_free_may_train
  AND privacy_enable_free_may_publish_prompts
  AND privacy_enable_input_output_logging
  AND NOT privacy_zdr_only
  AND provider_restriction_mode = 'none'
  AND NOT provider_restriction_enforce_allowed
  AND model_restriction_mode = 'none';

-- ---- 2. Assignments table
CREATE TABLE "public"."workspace_guardrail_assignments" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "guardrail_id" uuid                     NOT NULL,
  "target_type"  text                     NOT NULL,
  "target_id"    uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "created_by"   uuid,
  CONSTRAINT "workspace_guardrail_assignments_guardrail_id_fkey" FOREIGN KEY (guardrail_id) REFERENCES public.workspace_guardrails(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_guardrail_assignments_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_guardrail_assignments_target_id_check" CHECK (((target_type = 'workspace'::text) = (target_id IS NULL))),
  CONSTRAINT "workspace_guardrail_assignments_target_type_check" CHECK ((target_type = ANY (ARRAY['workspace'::text, 'department'::text, 'member'::text, 'key'::text]))),
  CONSTRAINT "workspace_guardrail_assignments_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_guardrail_assignments"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_guardrail_assignments_target_idx ON public.workspace_guardrail_assignments USING btree (workspace_id, target_type, target_id);

CREATE UNIQUE INDEX workspace_guardrail_assignments_unique_idx ON public.workspace_guardrail_assignments USING btree (guardrail_id, target_type, COALESCE(target_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_guardrail_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_guardrail_assignments"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_guardrail_assignments" IS 'Where each guardrail applies: the whole workspace (target_id NULL), a department, a member (the principal of their keys, even after they leave) or one key. Key and member rows are copied from key_guardrails and workspace_member_guardrails by private.sync_guardrail_assignments; write those through the legacy tables or apply_guardrail_assignment_change. Workspace and department rows are written here directly. Service role only.';

REVOKE ALL ON TABLE "public"."workspace_guardrail_assignments" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_guardrail_assignments" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_guardrail_assignments" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.sync_guardrail_assignments()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Keeps public.workspace_guardrail_assignments in step with the tables it replaces.
-- key_guardrails and workspace_member_guardrails: one-way copy of every insert, update and delete.
-- Key and member assignments are still written to those tables (by apply_guardrail_assignment_change
-- and by older code), so nothing writes key or member rows here directly and nothing copies back,
-- which rules out trigger loops. The copy runs with the definer's rights because admins may write
-- the legacy tables through their RLS policies, while the new table is service role only.
-- workspace_departments: a deleted department's assignments go with it.
begin
  if tg_table_name = 'workspace_departments' then
    delete from public.workspace_guardrail_assignments a
    where a.workspace_id = old.workspace_id
      and a.target_type = 'department'
      and a.target_id = old.id;
    return null;
  end if;

  if tg_op in ('DELETE', 'UPDATE') then
    if tg_table_name = 'key_guardrails' then
      delete from public.workspace_guardrail_assignments a
      where a.guardrail_id = old.guardrail_id
        and a.target_type = 'key'
        and a.target_id = old.key_id;
    else
      delete from public.workspace_guardrail_assignments a
      where a.guardrail_id = old.guardrail_id
        and a.target_type = 'member'
        and a.target_id = old.user_id
        and a.workspace_id = old.workspace_id;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if tg_table_name = 'key_guardrails' then
      insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
      select g.workspace_id, g.id, 'key', new.key_id
      from public.workspace_guardrails g
      where g.id = new.guardrail_id
      on conflict do nothing;
    else
      insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
      values (new.workspace_id, new.guardrail_id, 'member', new.user_id)
      on conflict do nothing;
    end if;
  end if;
  return null;
end;
$function$;

COMMENT ON FUNCTION "private"."sync_guardrail_assignments"() IS 'Copies key_guardrails and workspace_member_guardrails changes into workspace_guardrail_assignments (one way), and removes a deleted department''s assignments.';

REVOKE ALL ON FUNCTION "private"."sync_guardrail_assignments"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."sync_guardrail_assignments"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."sync_guardrail_assignments"() TO "postgres";

DO $migration$
BEGIN
  LOCK TABLE public.key_guardrails, public.workspace_member_guardrails IN SHARE ROW EXCLUSIVE MODE;

CREATE TRIGGER sync_guardrail_assignments
  AFTER INSERT OR DELETE OR UPDATE ON public.key_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_guardrail_assignments();

CREATE TRIGGER sync_guardrail_assignments
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_member_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_guardrail_assignments();

  INSERT INTO public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id, created_at)
  SELECT g.workspace_id, kg.guardrail_id, 'key', kg.key_id, kg.created_at
  FROM public.key_guardrails kg
  JOIN public.workspace_guardrails g ON g.id = kg.guardrail_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id, created_at)
  SELECT mg.workspace_id, mg.guardrail_id, 'member', mg.user_id, mg.created_at
  FROM public.workspace_member_guardrails mg
  ON CONFLICT DO NOTHING;
END
$migration$;

CREATE TRIGGER sync_guardrail_assignments
  AFTER DELETE ON public.workspace_departments
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_guardrail_assignments();

-- ---- 5. Invalidate cached key policies when department membership changes
CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_department_grants
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_member_overrides
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE TRIGGER keys_department_gateway_publication
  AFTER UPDATE OF department_id ON public.keys
  FOR EACH ROW
  WHEN ((old.department_id IS DISTINCT FROM new.department_id))
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

-- ---- 3. Resolution
CREATE OR REPLACE FUNCTION public.resolve_key_guardrails (
  p_workspace_id uuid,
  p_key_id       uuid
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
  -- The enabled guardrails that apply to one API key, one row per guardrail and the level it is
  -- assigned at (a guardrail assigned at two levels appears twice):
  -- 1. workspace: every key in the workspace (source_id is NULL);
  -- 2. department: the key's departments as spend_scope_departments counts them (a standard key's
  --    own department, else its principal's override department, else all their departments or
  --    only the primary one, as workspace_settings.department_spend_attribution says);
  -- 3. member: the key's principal (oauth_user_id, else created_by), even after they leave;
  -- 4. key: the key itself.
  -- Empty when the key is not in the workspace.
  with key_row as (
    select k.id, coalesce(k.oauth_user_id, k.created_by) as principal_id
    from public.keys k
    where k.id = p_key_id
      and k.workspace_id = p_workspace_id
  ),
  targets as (
    select 'department'::text as target_type, departments.department_id as target_id
    from key_row
    cross join lateral private.spend_scope_departments(p_workspace_id, key_row.id, key_row.principal_id) as departments(department_id)
    union all
    select 'member', key_row.principal_id from key_row where key_row.principal_id is not null
    union all
    select 'key', key_row.id from key_row
  ),
  assigned as (
    select a.guardrail_id, a.target_type, a.target_id
    from public.workspace_guardrail_assignments a
    where a.workspace_id = p_workspace_id
      and a.target_type = 'workspace'
      and a.target_id is null
      and exists (select 1 from key_row)
    union all
    select a.guardrail_id, a.target_type, a.target_id
    from targets t
    join public.workspace_guardrail_assignments a
      on a.workspace_id = p_workspace_id
     and a.target_type = t.target_type
     and a.target_id = t.target_id
  )
  select assigned.guardrail_id, assigned.target_type, assigned.target_id
  from assigned
  join public.workspace_guardrails g
    on g.id = assigned.guardrail_id
   and g.workspace_id = p_workspace_id
   and g.enabled
  order by assigned.guardrail_id, assigned.target_type, assigned.target_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) IS 'Enabled guardrails that apply to an API key, with the level each is assigned at: workspace, the key''s departments (as spend_scope_departments counts them), its principal member (even after they leave) or the key itself.';

REVOKE ALL ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";

-- ---- 3b. Resolution for a member's own keys (Chat shows what the gateway enforces)
CREATE OR REPLACE FUNCTION public.resolve_member_guardrails (
  p_workspace_id uuid,
  p_user_id      uuid
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
  -- The enabled guardrails that apply to a key this member creates without a department of its
  -- own (e.g. their Chat key): the workspace, the member's departments as spend_scope_departments
  -- counts them for a key with no department, and the member. One row per guardrail and level,
  -- the same shape as resolve_key_guardrails, so Chat shows what the gateway enforces.
  with targets as (
    select 'department'::text as target_type, departments.department_id as target_id
    from private.spend_scope_departments(p_workspace_id, null, p_user_id) as departments(department_id)
    union all
    select 'member', p_user_id where p_user_id is not null
  ),
  assigned as (
    select a.guardrail_id, a.target_type, a.target_id
    from public.workspace_guardrail_assignments a
    where a.workspace_id = p_workspace_id
      and a.target_type = 'workspace'
      and a.target_id is null
    union all
    select a.guardrail_id, a.target_type, a.target_id
    from targets t
    join public.workspace_guardrail_assignments a
      on a.workspace_id = p_workspace_id
     and a.target_type = t.target_type
     and a.target_id = t.target_id
  )
  select assigned.guardrail_id, assigned.target_type, assigned.target_id
  from assigned
  join public.workspace_guardrails g
    on g.id = assigned.guardrail_id
   and g.workspace_id = p_workspace_id
   and g.enabled
  order by assigned.guardrail_id, assigned.target_type, assigned.target_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) IS 'Enabled guardrails that apply to a key a member creates with no department of its own (such as their Chat key): the workspace, the member''s departments and the member, with the level each is assigned at.';

REVOKE ALL ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";

-- ---- 4. Assignment changes
CREATE OR REPLACE FUNCTION public.apply_guardrail_assignment_change (
  p_workspace_id         uuid,
  p_target_type          text,
  p_target_ids           uuid[],
  p_add_guardrail_ids    uuid[],
  p_remove_guardrail_ids uuid[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
-- Adds and removes guardrails on many targets in one transaction, leaving every other assignment
-- as it is. Target types:
-- * 'workspace': the workspace itself. p_target_ids must be empty (or NULL); any id is refused.
-- * 'department': departments of this workspace.
-- * 'member': users. The settings API checks they are current members before an add; a former
--   member's rows can still be removed, because the gateway keeps applying them to their keys.
-- * 'key': keys of this workspace.
-- Key and member assignments are written to key_guardrails and workspace_member_guardrails, whose
-- trigger (private.sync_guardrail_assignments) copies each change into
-- workspace_guardrail_assignments; workspace and department assignments are written there directly.
-- The copy only runs one way, so there is no trigger loop, and older code that still writes the
-- legacy tables stays in step.
declare
  v_add uuid[] := coalesce(p_add_guardrail_ids, '{}');
  v_remove uuid[] := coalesce(p_remove_guardrail_ids, '{}');
  v_targets uuid[] := coalesce(p_target_ids, '{}');
begin
  if p_target_type is null or p_target_type not in ('workspace', 'department', 'member', 'key') then
    raise exception 'invalid_guardrail_assignment_target';
  end if;

  if (
    select count(*)
    from public.workspace_guardrails
    where workspace_id = p_workspace_id
      and id = any(v_add || v_remove)
  ) <> cardinality(array(select distinct unnest(v_add || v_remove))) then
    raise exception 'guardrail_not_found';
  end if;

  if p_target_type = 'workspace' then
    if cardinality(v_targets) > 0 then
      raise exception 'invalid_guardrail_assignment_target';
    end if;

    delete from public.workspace_guardrail_assignments
    where workspace_id = p_workspace_id
      and target_type = 'workspace'
      and guardrail_id = any(v_remove);

    insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
    select p_workspace_id, guardrail_id, 'workspace', null
    from unnest(v_add) as guardrail_id
    on conflict do nothing;
  elsif p_target_type = 'department' then
    if exists (
      select 1 from unnest(v_targets) as target(id)
      where not exists (
        select 1 from public.workspace_departments d where d.id = target.id and d.workspace_id = p_workspace_id
      )
    ) then
      raise exception 'guardrail_assignment_target_not_found';
    end if;

    delete from public.workspace_guardrail_assignments
    where workspace_id = p_workspace_id
      and target_type = 'department'
      and target_id = any(v_targets)
      and guardrail_id = any(v_remove);

    insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
    select p_workspace_id, guardrail_id, 'department', target_id
    from unnest(v_targets) as target_id
    cross join unnest(v_add) as guardrail_id
    on conflict do nothing;
  elsif p_target_type = 'key' then
    if exists (
      select 1 from unnest(v_targets) as target(id)
      where not exists (select 1 from public.keys k where k.id = target.id and k.workspace_id = p_workspace_id)
    ) then
      raise exception 'guardrail_assignment_target_not_found';
    end if;

    delete from public.key_guardrails
    where key_id = any(v_targets)
      and guardrail_id = any(v_remove);

    insert into public.key_guardrails (key_id, guardrail_id)
    select target_id, guardrail_id
    from unnest(v_targets) as target_id
    cross join unnest(v_add) as guardrail_id
    on conflict (key_id, guardrail_id) do nothing;
  else
    delete from public.workspace_member_guardrails
    where workspace_id = p_workspace_id
      and user_id = any(v_targets)
      and guardrail_id = any(v_remove);

    insert into public.workspace_member_guardrails (workspace_id, user_id, guardrail_id)
    select p_workspace_id, target_id, guardrail_id
    from unnest(v_targets) as target_id
    cross join unnest(v_add) as guardrail_id
    on conflict (workspace_id, user_id, guardrail_id) do nothing;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) FROM PUBLIC, "anon", "authenticated";
