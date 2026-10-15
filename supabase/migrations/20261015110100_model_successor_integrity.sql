-- Recommended successors (v2_models.replacement_model_slug) will drive deprecation notices and,
-- later, rerouting of unserved models, so they must point at real models and never loop.
--
-- The 2026-10-12 audit found 236 models with a successor, no self-references and no loops, and
-- 3 successors naming models that do not exist. Each fix below is guarded on the observed value,
-- so a newer admin edit is never overwritten. Row history is recorded by catalogue_row_history.
SET local check_function_bodies = off;

with fixes (model_slug, old_replacement_model_slug, new_replacement_model_slug) as (
values
  ('minimax/speech-2.6-hd'::text, 'minimax/speech-2.8'::text, 'minimax/speech-2.8-hd'::text),
  ('minimax/speech-2.6-turbo'::text, 'minimax/speech-2.8'::text, 'minimax/speech-2.8-turbo'::text),
  ('google/gemini-omni-flash-preview'::text, 'google/gemini-omni-1.1-flash'::text, 'google/gemini-omni-flash'::text)
), applied as (
  update public.v2_models m
  set replacement_model_slug = f.new_replacement_model_slug,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.replacement_model_slug is not distinct from f.old_replacement_model_slug
    and exists (select 1 from public.v2_models target where target.model_slug = f.new_replacement_model_slug)
  returning m.model_slug
)
select count(*) as updated_rows, 3 as expected_rows from applied;

-- Anything still dangling (for example an edit made after the audit) is cleared rather than
-- blocking the constraint below; the history trigger keeps the old value.
update public.v2_models m
set replacement_model_slug = null,
    updated_at = now()
where m.replacement_model_slug is not null
  and not exists (select 1 from public.v2_models target where target.model_slug = m.replacement_model_slug);

update public.v2_models
set replacement_model_slug = null,
    updated_at = now()
where replacement_model_slug = model_slug;

CREATE OR REPLACE FUNCTION private.guard_model_replacement_cycle()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_current text := new.replacement_model_slug;
  v_seen text[] := array[new.model_slug];
begin
  -- Serialise successor edits so two concurrent writes cannot close a loop
  -- that neither sees on its own.
  perform pg_advisory_xact_lock(hashtext('v2_models.replacement_model_slug'));
  -- Follow the chain, remembering every model visited. Reaching the edited
  -- model again is a loop; reaching any other visited model means the chain
  -- loops further on without this model, so the walk stops there. Chains of
  -- any length that end are accepted.
  while v_current is not null loop
    if v_current = new.model_slug then
      raise exception 'recommended successor % would loop back to %', new.replacement_model_slug, new.model_slug
        using errcode = '23514';
    end if;
    exit when v_current = any (v_seen);
    v_seen := v_seen || v_current;
    select model.replacement_model_slug into v_current
    from public.v2_models model
    where model.model_slug = v_current;
  end loop;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."guard_model_replacement_cycle"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."guard_model_replacement_cycle"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."guard_model_replacement_cycle"() TO "postgres";

ALTER TABLE "public"."v2_models"
  ADD CONSTRAINT "v2_models_replacement_model_slug_fkey" FOREIGN KEY (replacement_model_slug) REFERENCES public.v2_models(model_slug) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."v2_models"
  ADD CONSTRAINT "v2_models_replacement_not_self_check" CHECK ((replacement_model_slug IS DISTINCT FROM model_slug));

CREATE TRIGGER guard_replacement_cycle
  BEFORE INSERT OR UPDATE OF replacement_model_slug ON public.v2_models
  FOR EACH ROW
  WHEN ((new.replacement_model_slug IS NOT NULL))
  EXECUTE FUNCTION private.guard_model_replacement_cycle();

COMMENT ON COLUMN "public"."v2_models"."replacement_model_slug" IS 'Recommended successor shown to customers when this model is deprecated or retired. Must be an existing model; chains may not loop.';
