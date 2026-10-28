CREATE OR REPLACE FUNCTION public.get_workspace_spend_block_entry (
  p_workspace_id uuid,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The compact entry the gateway enforces spend blocks from (KV spend-blocks:v1:{workspace}),
  -- or null when the workspace has nothing active, so the publisher deletes the key:
  --   * blocks: active blocks that have not reached their reset;
  --   * warnings: enabled block rules past their last warn threshold this period (every
  --     threshold_percents value, or threshold_amount_nanos) without an active block, i.e. in
  --     the grace margin. Requests they cover get the x-phaseo-spend-warning header;
  --   * departments: for each department scope above, who counts toward it, so the gateway can
  --     match a request without Postgres (private.spend_scope_departments as of now):
  --       keys          standard keys whose own department is this one (always count);
  --       users         actors (key creators, OAuth users) whose departments include it;
  --       exclude_keys  standard keys of those users that belong to another department.
  --     A request counts when its key is in keys, or its key is not in exclude_keys and its
  --     actor is in users.
  --   * expires_at: the earliest reset, which the KV entry's expiry must not pass.
  with blocks as (
    select block.id, block.rule_id, coalesce(rule.name, 'Deleted spend rule') as rule_name, block.scope_type, block.scope_id,
      block.resets_at, block.block_free_models, block.limit_nanos
    from public.workspace_spend_blocks block
    left join public.workspace_spend_rules rule on rule.id = block.rule_id
    where block.workspace_id = p_workspace_id
      and block.lifted_at is null
      and (block.resets_at is null or block.resets_at > p_now)
  ),
  warnings as (
    select rule.id as rule_id, rule.name as rule_name, rule.scope_type, rule.scope_id, state.period_end as resets_at, rule.block_free_models
    from public.workspace_spend_rules rule
    join public.workspace_spend_rule_state state
      on state.rule_id = rule.id
      and state.period_start <= p_now
      and state.period_end > p_now
    where rule.workspace_id = p_workspace_id
      and rule.enabled
      and rule.deleted_at is null
      and rule.action = 'block'
      and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
      and case rule.metric
        when 'spend' then state.amount_fired_at is not null
        when 'budget_percent' then state.highest_percent_fired >= (select max(threshold) from unnest(rule.threshold_percents) threshold)
        else false
      end
      and not exists (select 1 from blocks where blocks.rule_id = rule.id)
  ),
  department_ids as materialized (
    select distinct lower(item.scope_id)::uuid as id
    from (select scope_type, scope_id from blocks union all select scope_type, scope_id from warnings) item
    where item.scope_type = 'department'
      and item.scope_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  actor_departments as materialized (
    select candidate.user_id, scope.department_id
    from (
      select grant_row.user_id from public.workspace_department_grants grant_row where grant_row.workspace_id = p_workspace_id
      union
      select override.user_id from public.workspace_member_overrides override
      where override.workspace_id = p_workspace_id and override.department_override_enabled
    ) candidate
    cross join lateral private.spend_scope_departments(p_workspace_id, null, candidate.user_id) scope(department_id)
    where exists (select 1 from department_ids)
  ),
  departments as (
    select department_ids.id,
      coalesce((
        select jsonb_agg(key.id order by key.id) from public.keys key
        where key.workspace_id = p_workspace_id and key.key_kind = 'standard' and key.department_id = department_ids.id
          and key.status <> 'deleted'
      ), '[]'::jsonb) as keys,
      coalesce((
        select jsonb_agg(actor.user_id order by actor.user_id) from actor_departments actor
        where actor.department_id = department_ids.id
      ), '[]'::jsonb) as users,
      coalesce((
        select jsonb_agg(key.id order by key.id) from public.keys key
        where key.workspace_id = p_workspace_id and key.key_kind = 'standard'
          and key.department_id is not null and key.department_id <> department_ids.id
          and key.status <> 'deleted'
          and key.created_by in (select actor.user_id from actor_departments actor where actor.department_id = department_ids.id)
      ), '[]'::jsonb) as exclude_keys
    from department_ids
  )
  select case when exists (select 1 from blocks) or exists (select 1 from warnings) then jsonb_build_object(
    'v', 1,
    'workspace_id', p_workspace_id,
    'generated_at', p_now,
    'expires_at', (select min(item.resets_at) from (select resets_at from blocks union all select resets_at from warnings) item),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', blocks.id,
        'rule_id', blocks.rule_id,
        'rule_name', left(blocks.rule_name, 100),
        'scope_type', blocks.scope_type,
        'scope_id', blocks.scope_id,
        'resets_at', blocks.resets_at,
        'block_free_models', blocks.block_free_models,
        'limit_nanos', blocks.limit_nanos
      ) order by blocks.resets_at nulls last, blocks.id)
      from blocks
    ), '[]'::jsonb),
    'warnings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rule_id', warnings.rule_id,
        'rule_name', left(warnings.rule_name, 100),
        'scope_type', warnings.scope_type,
        'scope_id', warnings.scope_id,
        'resets_at', warnings.resets_at,
        'block_free_models', warnings.block_free_models
      ) order by warnings.resets_at, warnings.rule_id)
      from warnings
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_object_agg(departments.id, jsonb_build_object(
        'keys', departments.keys, 'users', departments.users, 'exclude_keys', departments.exclude_keys))
      from departments
    ), '{}'::jsonb)
  ) end;
$function$;

COMMENT ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) IS 'The gateway''s spend block entry for a workspace (active blocks, grace-margin warnings and department membership for department scopes), or null when nothing is active. Published to KV spend-blocks:v1:{workspace} by the API. Service role only.';

REVOKE ALL ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) TO "service_role";
