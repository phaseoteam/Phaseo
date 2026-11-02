CREATE OR REPLACE FUNCTION public.create_work_item (
  p_workspace_id uuid,
  p_title        text,
  p_description  text DEFAULT ''::text,
  p_state        text DEFAULT 'triage'::text,
  p_priority     smallint DEFAULT 0,
  p_source       text DEFAULT 'manual'::text,
  p_created_by   uuid DEFAULT NULL::uuid,
  p_author_kind  text DEFAULT 'user'::text,
  p_fields       jsonb DEFAULT '{}'::jsonb
)
  RETURNS public.work_items
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Creates a work item with the workspace's next number and its "created" timeline event, in one
-- transaction. p_fields may set labels (text array), assignee_user_id, assignee_agent,
-- error_group_id, github_repo, github_issue_number, github_issue_url, due_at, project_id, cycle_id,
-- parent_id, estimate and sla_due_at; other keys are
-- ignored. Numbers are never reused, even when items are deleted.
declare
  v_number integer;
  v_item public.work_items;
begin
  insert into public.work_item_counters as counter (workspace_id, last_number)
  values (p_workspace_id, 1)
  on conflict (workspace_id) do update set last_number = counter.last_number + 1
  returning counter.last_number into v_number;

  insert into public.work_items (
    workspace_id, number, title, description, state, priority, source, labels,
    assignee_user_id, assignee_agent, error_group_id, github_repo, github_issue_number,
    github_issue_url, due_at, project_id, cycle_id, parent_id, estimate, sla_due_at, created_by
  ) values (
    p_workspace_id, v_number, p_title, coalesce(p_description, ''), coalesce(p_state, 'triage'),
    coalesce(p_priority, 0), coalesce(p_source, 'manual'),
    coalesce(array(select jsonb_array_elements_text(p_fields -> 'labels')), '{}'::text[]),
    nullif(p_fields ->> 'assignee_user_id', '')::uuid,
    nullif(p_fields ->> 'assignee_agent', ''),
    nullif(p_fields ->> 'error_group_id', '')::uuid,
    nullif(p_fields ->> 'github_repo', ''),
    nullif(p_fields ->> 'github_issue_number', '')::integer,
    nullif(p_fields ->> 'github_issue_url', ''),
    nullif(p_fields ->> 'due_at', '')::timestamp with time zone,
    nullif(p_fields ->> 'project_id', '')::uuid,
    nullif(p_fields ->> 'cycle_id', '')::uuid,
    nullif(p_fields ->> 'parent_id', '')::uuid,
    nullif(p_fields ->> 'estimate', '')::smallint,
    nullif(p_fields ->> 'sla_due_at', '')::timestamp with time zone,
    p_created_by
  )
  returning * into v_item;

  insert into public.work_item_events (workspace_id, work_item_id, kind, author_kind, author_user_id, data)
  values (p_workspace_id, v_item.id, 'created', coalesce(p_author_kind, 'user'), p_created_by,
    jsonb_build_object('source', v_item.source, 'state', v_item.state));

  return v_item;
end;
$function$;

COMMENT ON FUNCTION public.create_work_item(uuid, text, text, text, smallint, text, uuid, text, jsonb) IS 'Creates a numbered work item and its created event. Service role only.';

REVOKE ALL ON FUNCTION public.create_work_item(uuid, text, text, text, smallint, text, uuid, text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_work_item(uuid, text, text, text, smallint, text, uuid, text, jsonb) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.create_work_item(uuid, text, text, text, smallint, text, uuid, text, jsonb) TO "service_role";
