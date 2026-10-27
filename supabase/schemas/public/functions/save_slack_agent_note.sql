CREATE OR REPLACE FUNCTION public.save_slack_agent_note (
  p_installation_id uuid,
  p_kind            text,
  p_channel_id      text,
  p_text            text,
  p_created_by      text,
  p_expires_at      timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The Slack agent's remember tool: saves a short note, pin or to-do for one
-- conversation (p_channel_id) or the whole Slack workspace (null). An installation
-- keeps at most 500; the same open note already saved there is returned instead
-- of a second copy. Expired notes are deleted first, so they never count.
-- Locking the installation row makes saves take turns, so the cap holds, and
-- orders them against uninstalling, which deletes every note in the transaction
-- that marks the installation uninstalled (delete_slack_agent_memory).
-- Returns {status: saved | exists | full | not_installed, note?, limit?}.
-- Service role only: the Worker calls it for the installation it is answering for.
declare
  v_note public.slack_agent_notes%rowtype;
  v_text text := btrim(p_text);
begin
  if p_kind is null or p_kind not in ('note', 'pin', 'todo') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  perform 1 from public.slack_installations installation
  where installation.id = p_installation_id and installation.status <> 'uninstalled'
  for no key update;
  if not found then
    return jsonb_build_object('status', 'not_installed');
  end if;

  delete from public.slack_agent_notes note
  where note.installation_id = p_installation_id and note.expires_at <= now();

  select * into v_note
  from public.slack_agent_notes note
  where note.installation_id = p_installation_id
    and note.kind = p_kind
    and note.channel_id is not distinct from p_channel_id
    and note.done_at is null
    and lower(note.text) = lower(v_text)
  limit 1;
  if found then
    return jsonb_build_object('status', 'exists', 'note', to_jsonb(v_note) - 'installation_id');
  end if;

  if (select count(*) from public.slack_agent_notes note where note.installation_id = p_installation_id) >= 500 then
    return jsonb_build_object('status', 'full', 'limit', 500);
  end if;

  insert into public.slack_agent_notes (installation_id, kind, channel_id, text, created_by, expires_at)
  values (p_installation_id, p_kind, p_channel_id, v_text, p_created_by, p_expires_at)
  returning * into v_note;
  return jsonb_build_object('status', 'saved', 'note', to_jsonb(v_note) - 'installation_id');
end;
$function$;

COMMENT ON FUNCTION "public"."save_slack_agent_note"(uuid, text, text, text, text, timestamp with time zone) IS 'For the Slack Worker''s remember tool: saves a note, pin or to-do for a conversation or the whole Slack workspace, at most 500 per installation, without duplicating an open one. Returns {status: saved | exists | full | not_installed, note?, limit?}.';

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_note"(uuid, text, text, text, text, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_note"(uuid, text, text, text, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_note"(uuid, text, text, text, text, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_note"(uuid, text, text, text, text, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
