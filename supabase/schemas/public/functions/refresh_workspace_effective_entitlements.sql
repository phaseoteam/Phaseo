CREATE OR REPLACE FUNCTION public.refresh_workspace_effective_entitlements (
  p_workspace_id uuid,
  p_changed_by   uuid DEFAULT NULL::uuid,
  p_reason       text DEFAULT 'reconcile'::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  candidate record;
  previous record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_workspace_id::text)::bigint
  );

  for candidate in
    select wm.workspace_id,wm.user_id,
      case when w.owner_user_id=wm.user_id then 'owner'
           when o.access_role is not null then o.access_role
           else lower(wm.role::text) end as access_role,
      case when o.department_override_enabled then o.department_id else dg.department_id end as department_id,
      case when o.department_override_enabled then o.department_position else dg.position end as department_position,
      case when w.owner_user_id=wm.user_id then 'owner'
           when o.access_role is not null then 'manual_override'
           when exists(select 1 from public.workspace_access_grants ag where ag.workspace_id=wm.workspace_id and ag.user_id=wm.user_id and ag.source_type='scim_group') then 'scim'
           else 'workspace' end as access_source,
      case when o.department_override_enabled then 'manual_override'
           when dg.department_id is null then 'none'
           when dg.source_type='scim_group' then 'scim'
           else dg.source_type end as department_source
    from public.workspace_members wm
    join public.workspaces w on w.id=wm.workspace_id
    left join public.workspace_member_overrides o on o.workspace_id=wm.workspace_id and o.user_id=wm.user_id
    left join lateral (
      select g.department_id,g.position,g.source_type
      from public.workspace_department_grants g
      where g.workspace_id=wm.workspace_id and g.user_id=wm.user_id
      order by g.is_primary desc,(g.source_type='manual') desc,g.created_at asc
      limit 1
    ) dg on true
    where wm.workspace_id=p_workspace_id
  loop
    select * into previous from public.workspace_member_effective_entitlements
      where workspace_id=candidate.workspace_id and user_id=candidate.user_id;

    if previous is null
       or previous.access_role is distinct from candidate.access_role
       or previous.department_id is distinct from candidate.department_id
       or previous.department_position is distinct from candidate.department_position
       or previous.access_source is distinct from candidate.access_source
       or previous.department_source is distinct from candidate.department_source then
      update public.workspace_member_entitlement_history
        set effective_to=now()
        where workspace_id=candidate.workspace_id and user_id=candidate.user_id and effective_to is null;

      insert into public.workspace_member_entitlement_history(
        workspace_id,user_id,access_role,department_id,department_name,department_color,department_icon,
        department_position,access_source,department_source,changed_by,change_reason
      )
      select candidate.workspace_id,candidate.user_id,candidate.access_role,candidate.department_id,
        d.name,d.color,d.icon,candidate.department_position,candidate.access_source,candidate.department_source,
        p_changed_by,left(coalesce(p_reason,'reconcile'),200)
      from (select 1) seed left join public.workspace_departments d on d.id=candidate.department_id;
    end if;

    insert into public.workspace_member_effective_entitlements(
      workspace_id,user_id,access_role,department_id,department_position,access_source,department_source,computed_at
    ) values (
      candidate.workspace_id,candidate.user_id,candidate.access_role,candidate.department_id,
      candidate.department_position,candidate.access_source,candidate.department_source,now()
    ) on conflict(workspace_id,user_id) do update set
      access_role=excluded.access_role,department_id=excluded.department_id,
      department_position=excluded.department_position,access_source=excluded.access_source,
      department_source=excluded.department_source,computed_at=excluded.computed_at;
  end loop;

  update public.workspace_member_entitlement_history h set effective_to=now()
  where h.workspace_id=p_workspace_id and h.effective_to is null
    and not exists(select 1 from public.workspace_members wm where wm.workspace_id=h.workspace_id and wm.user_id=h.user_id);
  -- phaseo:allow-destructive-migration reason: Remove derived entitlement rows for members that no longer exist in the authoritative workspace membership set.
  delete from public.workspace_member_effective_entitlements e
  where e.workspace_id=p_workspace_id
    and not exists(select 1 from public.workspace_members wm where wm.workspace_id=e.workspace_id and wm.user_id=e.user_id);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_workspace_effective_entitlements"(uuid, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_workspace_effective_entitlements"(uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_workspace_effective_entitlements"(uuid, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_workspace_effective_entitlements"(uuid, uuid, text) FROM PUBLIC, "anon", "authenticated";
