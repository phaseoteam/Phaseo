-- phaseo:allow-destructive-migration reason: the DELETEs are inside the new Slack agent memory functions: forget_slack_agent_note deletes the one note a person asks the agent to forget, save_slack_agent_note and load_slack_agent_turn_memory delete an installation's expired notes, and the delete_slack_agent_memory trigger deletes an installation's notes and saved skills when it is uninstalled (Slack's API terms). The migration deletes no existing data.

-- Phaseo Slack agent: memory and saved skills.
-- * slack_agent_notes: short notes, pins and to-dos the agent saves when asked, for one conversation or the
--   whole Slack workspace, at most 500 per installation; slack_agent_skills: named instructions people ask it
--   to save, at most 100. Service role only, like the other slack_* tables; inserts only through the save
--   functions, which enforce the caps.
-- * Functions for the Worker's tools (save, search, update_todo, forget, save/get skill) and each turn's pins
--   and skill list.
-- * Marking an installation uninstalled, by either path, deletes its notes and skills in the same transaction.

SET local check_function_bodies = off;

CREATE TABLE "public"."slack_agent_notes" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "installation_id" uuid                     NOT NULL,
  "kind"            text                     NOT NULL,
  "channel_id"      text,
  "text"            text                     NOT NULL,
  "done_at"         timestamp with time zone,
  "created_by"      text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"      timestamp with time zone,
  CONSTRAINT "slack_agent_notes_channel_id_check" CHECK (((channel_id IS NULL) OR (channel_id ~ '^[CDG][A-Z0-9]{2,31}$'::text))),
  CONSTRAINT "slack_agent_notes_created_by_check" CHECK ((created_by ~ '^[UW][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_agent_notes_done_check" CHECK (((kind = 'todo'::text) OR (done_at IS NULL))),
  CONSTRAINT "slack_agent_notes_expires_check" CHECK (((expires_at IS NULL) OR (expires_at > created_at))),
  CONSTRAINT "slack_agent_notes_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_agent_notes_kind_check" CHECK ((kind = ANY (ARRAY['note'::text, 'pin'::text, 'todo'::text]))),
  CONSTRAINT "slack_agent_notes_pkey" PRIMARY KEY (id),
  CONSTRAINT "slack_agent_notes_text_check" CHECK (((char_length(text) >= 1) AND (char_length(text) <= 500)))
);

ALTER TABLE "public"."slack_agent_notes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX slack_agent_notes_installation_idx ON public.slack_agent_notes USING btree (installation_id, created_at DESC);

CREATE TRIGGER slack_agent_notes_set_updated_at
  BEFORE UPDATE ON public.slack_agent_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_agent_notes"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_agent_notes" IS 'The Slack agent''s memory: short notes, pins and to-dos it saved because someone asked it to remember something, never copies of Slack messages. A null channel_id is for the whole Slack workspace, otherwise one conversation. At most 500 per installation (save_slack_agent_note, the only way in). Admins see and delete them in Settings > Slack; uninstalling deletes them (delete_slack_agent_memory).';

COMMENT ON COLUMN "public"."slack_agent_notes"."created_by" IS 'The Slack user (U... or W...) who asked the agent to save it.';

COMMENT ON COLUMN "public"."slack_agent_notes"."expires_at" IS 'When set, the note is hidden from then on and deleted on the agent''s next turn or save in the installation.';

REVOKE ALL ON TABLE "public"."slack_agent_notes" FROM "service_role";

GRANT DELETE, SELECT, UPDATE ON TABLE "public"."slack_agent_notes" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_agent_notes" FROM "anon", "authenticated";

CREATE TABLE "public"."slack_agent_skills" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "installation_id" uuid                     NOT NULL,
  "name"            text                     NOT NULL,
  "description"     text                     NOT NULL,
  "instructions"    text                     NOT NULL,
  "created_by"      text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_agent_skills_created_by_check" CHECK ((created_by ~ '^[UW][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_agent_skills_description_check" CHECK (((char_length(description) >= 1) AND (char_length(description) <= 200))),
  CONSTRAINT "slack_agent_skills_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_agent_skills_instructions_check" CHECK (((char_length(instructions) >= 1) AND (char_length(instructions) <= 4000))),
  CONSTRAINT "slack_agent_skills_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60) AND (name = btrim(name)) AND (name !~ '[[:cntrl:]]'::text))),
  CONSTRAINT "slack_agent_skills_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."slack_agent_skills"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX slack_agent_skills_name_idx ON public.slack_agent_skills USING btree (installation_id, lower(name));

CREATE TRIGGER slack_agent_skills_set_updated_at
  BEFORE UPDATE ON public.slack_agent_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_agent_skills"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_agent_skills" IS 'Instructions the Slack agent saved for a task people repeat, when someone asked it to save one. Names are unique per installation whatever their case. At most 100 per installation (save_slack_agent_skill, the only way in). Admins edit and delete them in Settings > Slack; uninstalling deletes them (delete_slack_agent_memory).';

COMMENT ON COLUMN "public"."slack_agent_skills"."created_by" IS 'The Slack user (U... or W...) who asked the agent to save it.';

REVOKE ALL ON TABLE "public"."slack_agent_skills" FROM "service_role";

GRANT DELETE, SELECT, UPDATE ON TABLE "public"."slack_agent_skills" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_agent_skills" FROM "anon", "authenticated";

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

CREATE OR REPLACE FUNCTION public.search_slack_agent_notes (
  p_installation_id uuid,
  p_channel_id      text,
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
  -- The Slack agent's recall tool: the notes one conversation can see (its own and
  -- the whole Slack workspace's), optionally of one kind. With search words (up to
  -- 8, of 2 characters or more, matched case-insensitively anywhere in the text),
  -- only notes holding at least one come back, those holding more first; then
  -- newest first. Done to-dos only with p_include_done, expired notes never. At
  -- most 50 (default 10). Service role only.
  with words as (
    select distinct word
    from regexp_split_to_table(lower(coalesce(p_query, '')), '[\s,.;:!?()"]+') as word
    where char_length(word) >= 2
    limit 8
  )
  select note.*
  from public.slack_agent_notes note
  cross join lateral (
    select count(*) as hits from words where strpos(lower(note.text), words.word) > 0
  ) matched
  where note.installation_id = p_installation_id
    and (note.channel_id is null or note.channel_id = p_channel_id)
    and (p_kind is null or note.kind = p_kind)
    and (coalesce(p_include_done, false) or note.done_at is null)
    and (note.expires_at is null or note.expires_at > now())
    and (matched.hits > 0 or not exists (select 1 from words))
  order by matched.hits desc, note.created_at desc, note.id
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$function$;

COMMENT ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, text, text, boolean, integer) IS 'For the Slack Worker''s recall tool: a conversation''s and the Slack workspace''s notes, matching search words first, then newest first, at most 50. Leaves out done to-dos unless asked and expired notes always.';

GRANT EXECUTE ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, text, text, boolean, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, text, text, boolean, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, text, text, boolean, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."search_slack_agent_notes"(uuid, text, text, text, boolean, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.set_slack_agent_todo_done (
  p_installation_id uuid,
  p_channel_id      text,
  p_note_id         uuid,
  p_done            boolean
)
  RETURNS SETOF public.slack_agent_notes
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  -- The Slack agent's update_todo tool: marks a to-do done or not done. Only a
  -- to-do the conversation can see (its own or the whole Slack workspace's) that
  -- hasn't expired; no row when there is none. Marking a done to-do done again
  -- keeps when it was done. Service role only.
  update public.slack_agent_notes note
  set done_at = case when coalesce(p_done, false) then coalesce(note.done_at, now()) end
  where note.id = p_note_id
    and note.installation_id = p_installation_id
    and note.kind = 'todo'
    and (note.channel_id is null or note.channel_id = p_channel_id)
    and (note.expires_at is null or note.expires_at > now())
  returning note.*;
$function$;

COMMENT ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, uuid, boolean) IS 'For the Slack Worker''s update_todo tool: marks a to-do the conversation can see done or not done. Returns the to-do, or no row when there is none.';

GRANT EXECUTE ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, uuid, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, uuid, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.forget_slack_agent_note (
  p_installation_id uuid,
  p_channel_id      text,
  p_note_id         uuid
)
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  -- The Slack agent's forget tool: deletes one note, pin or to-do the conversation
  -- can see (its own or the whole Slack workspace's). False when there was none.
  -- Service role only.
  with deleted as (
    delete from public.slack_agent_notes note
    where note.id = p_note_id
      and note.installation_id = p_installation_id
      and (note.channel_id is null or note.channel_id = p_channel_id)
    returning note.id
  )
  select exists (select 1 from deleted);
$function$;

COMMENT ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) IS 'For the Slack Worker''s forget tool: deletes one note the conversation can see. Returns whether there was one.';

GRANT EXECUTE ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.load_slack_agent_turn_memory (
  p_installation_id uuid,
  p_channel_id      text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- What the Slack agent is shown of its memory on every turn: the conversation's
-- pins and the whole Slack workspace's, newest first and 10 of each at most, and
-- the names and descriptions of the 20 saved skills changed most recently, with
-- how many there are. Expired notes are deleted here first, so none outlasts its
-- date by more than a turn. Returns {pins: [{id, scope, text, created_at}],
-- skills: [{name, description}], skills_total}. Service role only.
begin
  delete from public.slack_agent_notes note
  where note.installation_id = p_installation_id and note.expires_at <= now();

  return jsonb_build_object(
    'pins', coalesce((
      select jsonb_agg(jsonb_build_object('id', pin.id, 'scope', pin.scope, 'text', pin.text, 'created_at', pin.created_at)
        order by pin.scope, pin.created_at desc, pin.id)
      from (
        (select note.id, 'channel'::text as scope, note.text, note.created_at
          from public.slack_agent_notes note
          where note.installation_id = p_installation_id and note.kind = 'pin' and note.channel_id = p_channel_id
          order by note.created_at desc, note.id
          limit 10)
        union all
        (select note.id, 'workspace'::text, note.text, note.created_at
          from public.slack_agent_notes note
          where note.installation_id = p_installation_id and note.kind = 'pin' and note.channel_id is null
          order by note.created_at desc, note.id
          limit 10)
      ) pin
    ), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object('name', skill.name, 'description', skill.description) order by skill.updated_at desc, skill.name)
      from (
        select recent.name, recent.description, recent.updated_at
        from public.slack_agent_skills recent
        where recent.installation_id = p_installation_id
        order by recent.updated_at desc, recent.name
        limit 20
      ) skill
    ), '[]'::jsonb),
    'skills_total', (select count(*) from public.slack_agent_skills skill where skill.installation_id = p_installation_id)
  );
end;
$function$;

COMMENT ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text) IS 'For the Slack Worker on every turn: up to 10 of the conversation''s pins and 10 of the Slack workspace''s, and the 20 most recently changed saved skills'' names and descriptions with the total. Deletes the installation''s expired notes first.';

GRANT EXECUTE ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.save_slack_agent_skill (
  p_installation_id uuid,
  p_name            text,
  p_description     text,
  p_instructions    text,
  p_created_by      text,
  p_replace         boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The Slack agent's save_skill tool: saves instructions for a task people repeat,
-- under a name unique in the installation whatever its case. A skill with that
-- name is only overwritten with p_replace (it keeps who first saved it). An
-- installation keeps at most 100. Locks the installation row like
-- save_slack_agent_note, so the cap holds and uninstalling can't miss one.
-- Returns {status: saved | replaced | name_taken | full | not_installed, skill?,
-- limit?}, without the instructions. Service role only.
declare
  v_skill public.slack_agent_skills%rowtype;
  v_name text := btrim(p_name);
begin
  perform 1 from public.slack_installations installation
  where installation.id = p_installation_id and installation.status <> 'uninstalled'
  for no key update;
  if not found then
    return jsonb_build_object('status', 'not_installed');
  end if;

  select * into v_skill
  from public.slack_agent_skills skill
  where skill.installation_id = p_installation_id and lower(skill.name) = lower(v_name);
  if found then
    if not coalesce(p_replace, false) then
      return jsonb_build_object('status', 'name_taken', 'skill', jsonb_build_object('name', v_skill.name, 'description', v_skill.description));
    end if;
    update public.slack_agent_skills skill
    set name = v_name, description = btrim(p_description), instructions = btrim(p_instructions)
    where skill.id = v_skill.id
    returning * into v_skill;
    return jsonb_build_object('status', 'replaced', 'skill', to_jsonb(v_skill) - 'installation_id' - 'instructions');
  end if;

  if (select count(*) from public.slack_agent_skills skill where skill.installation_id = p_installation_id) >= 100 then
    return jsonb_build_object('status', 'full', 'limit', 100);
  end if;

  insert into public.slack_agent_skills (installation_id, name, description, instructions, created_by)
  values (p_installation_id, v_name, btrim(p_description), btrim(p_instructions), p_created_by)
  returning * into v_skill;
  return jsonb_build_object('status', 'saved', 'skill', to_jsonb(v_skill) - 'installation_id' - 'instructions');
end;
$function$;

COMMENT ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) IS 'For the Slack Worker''s save_skill tool: saves a named skill, at most 100 per installation, overwriting one with the same name only when asked to. Returns {status: saved | replaced | name_taken | full | not_installed, skill?, limit?}.';

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_slack_agent_skill (
  p_installation_id uuid,
  p_name            text
)
  RETURNS SETOF public.slack_agent_skills
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The Slack agent's use_skill tool: a saved skill by name, whatever its case.
  -- No row when there is none. Service role only.
  select skill.*
  from public.slack_agent_skills skill
  where skill.installation_id = p_installation_id and lower(skill.name) = lower(btrim(p_name))
  limit 1;
$function$;

COMMENT ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) IS 'For the Slack Worker''s use_skill tool: one saved skill by name, case-insensitively, or no row.';

GRANT EXECUTE ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.delete_slack_agent_memory()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Uninstalling, from Phaseo settings (web-api) or in Slack
  -- (uninstall_slack_agent_from_slack), deletes what the agent kept: its notes,
  -- pins and to-dos and its saved skills. As a trigger it runs in the transaction
  -- that marks the installation uninstalled, so neither path can leave them
  -- behind, and the save functions, which lock the installation row, wait for it.
  delete from public.slack_agent_notes note where note.installation_id = new.id;
  delete from public.slack_agent_skills skill where skill.installation_id = new.id;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."delete_slack_agent_memory"() IS 'Deletes a Slack agent installation''s notes and saved skills when it is marked uninstalled, whichever path uninstalls it.';

REVOKE ALL ON FUNCTION "public"."delete_slack_agent_memory"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_slack_agent_memory"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."delete_slack_agent_memory"() FROM PUBLIC, "anon", "authenticated";

CREATE TRIGGER slack_installations_delete_agent_memory
  AFTER UPDATE OF status ON public.slack_installations
  FOR EACH ROW
  WHEN (((new.status = 'uninstalled'::text) AND (old.status IS DISTINCT FROM 'uninstalled'::text)))
  EXECUTE FUNCTION public.delete_slack_agent_memory();
