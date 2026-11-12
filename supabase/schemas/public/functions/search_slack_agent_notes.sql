CREATE OR REPLACE FUNCTION public.search_slack_agent_notes (
  p_installation_id uuid,
  p_channel_id      text,
  p_workspace_notes boolean,
  p_query           text,
  p_kind            text,
  p_include_done    boolean,
  p_limit           integer
)
  RETURNS SETOF public.slack_agent_notes
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The Slack agent's recall tool: the notes one conversation can see (its own
  -- and, with p_workspace_notes, the whole Slack workspace's), optionally of one
  -- kind. With search words (up to 8, of 2 characters or more, matched
  -- case-insensitively anywhere in the text), only notes holding at least one
  -- come back, those holding more first; then newest first. Done to-dos only with
  -- p_include_done, expired notes never, and nothing while the installation's
  -- memory is off. At most 50 (default 10). Service role only.
  with words as (
    select distinct word
    from regexp_split_to_table(lower(coalesce(p_query, '')), '[\s,.;:!?()"]+') as word
    where char_length(word) >= 2
    limit 8
  )
  select note.*
  from public.slack_agent_notes note
  join public.slack_installations installation on installation.id = note.installation_id and installation.memory_enabled
  cross join lateral (
    select count(*) as hits from words where strpos(lower(note.text), words.word) > 0
  ) matched
  where note.installation_id = p_installation_id
    and (note.channel_id = p_channel_id or (note.channel_id is null and coalesce(p_workspace_notes, false)))
    and (p_kind is null or note.kind = p_kind)
    and (coalesce(p_include_done, false) or note.done_at is null)
    and (note.expires_at is null or note.expires_at > now())
    and (matched.hits > 0 or not exists (select 1 from words))
  order by matched.hits desc, note.created_at desc, note.id
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$function$;

COMMENT ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, boolean, text, text, boolean, integer) IS 'For the Slack Worker''s recall tool: a conversation''s notes and, with p_workspace_notes, the Slack workspace''s, matching search words first, then newest first, at most 50. Leaves out done to-dos unless asked and expired notes always; none while the installation''s memory is off.';

GRANT EXECUTE ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, boolean, text, text, boolean, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, boolean, text, text, boolean, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, boolean, text, text, boolean, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, boolean, text, text, boolean, integer) FROM PUBLIC, "anon", "authenticated";
