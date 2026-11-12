-- The provider's error type on v2_request_attempts.
--
-- Follow-up to 20261109123943, which added the provider's error code, message and description
-- but not its error type (for example invalid_request_error, rate_limit or permission_error).
-- gateway_upstream_requests.error_type has it, and request detail reads v2_request_attempts
-- after the 2026-11-09 cut-over, so newer requests showed no error type.
--
-- 1. One nullable text column, upstream_error_type. Adding a nullable column without a default
--    is a catalogue-only change.
-- 2. ingest_v2_gateway_request stores it, capped at 120 characters. As in 20261109123943, the
--    deployed definition is patched at the attempts insert only, so edits to other sections of
--    the function are preserved.

SET local check_function_bodies = off;

ALTER TABLE "public"."v2_request_attempts"
  ADD COLUMN "upstream_error_type" text;

COMMENT ON COLUMN "public"."v2_request_attempts"."upstream_error_type" IS 'Error type from the provider response body for this attempt, for example invalid_request_error or rate_limit, capped at 120 characters. Null when the provider sent none and on rows recorded before the gateway sent it.';

do $migration$
declare
  definition text := pg_get_functiondef('public.ingest_v2_gateway_request(jsonb)'::regprocedure);
  column_anchor text := $anchor$    upstream_error_code, upstream_error_message, upstream_error_description
  )
  select$anchor$;
  column_replacement text := $replacement$    upstream_error_code, upstream_error_message, upstream_error_description,
    upstream_error_type
  )
  select$replacement$;
  value_anchor text := $anchor$    left(nullif(item.value->>'upstream_error_description', ''), 1024)
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)$anchor$;
  value_replacement text := $replacement$    left(nullif(item.value->>'upstream_error_description', ''), 1024),
    left(nullif(item.value->>'upstream_error_type', ''), 120)
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)$replacement$;
begin
  -- The anchors are LF-only, whatever line endings this file was checked out with.
  column_anchor := replace(column_anchor, chr(13), '');
  column_replacement := replace(column_replacement, chr(13), '');
  value_anchor := replace(value_anchor, chr(13), '');
  value_replacement := replace(value_replacement, chr(13), '');
  if strpos(definition, 'upstream_error_type') > 0 then
    raise exception 'Attempt upstream error type ingestion is already installed';
  end if;
  if (length(definition) - length(replace(definition, column_anchor, ''))) / length(column_anchor) <> 1 then
    raise exception 'Expected exactly one attempts insert column list ending with upstream_error_description';
  end if;
  if (length(definition) - length(replace(definition, value_anchor, ''))) / length(value_anchor) <> 1 then
    raise exception 'Expected exactly one attempts upstream_error_description value';
  end if;
  execute replace(replace(definition,
    column_anchor, column_replacement),
    value_anchor, value_replacement);
end;
$migration$;
