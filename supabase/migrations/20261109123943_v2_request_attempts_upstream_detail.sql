-- Per-attempt request-detail fields on v2_request_attempts.
--
-- Step 1 of retiring public.gateway_upstream_requests, which duplicates v2_request_attempts
-- row for row. This migration only adds: no reader changes and the old table is still written.
--
-- 1. Four nullable text columns the request-detail views show for each provider attempt:
--    status_text (HTTP reason phrase), upstream_error_code, upstream_error_message and
--    upstream_error_description (the provider's own error, as the gateway summarises it; the
--    existing error_code column holds the gateway failure type). Adding nullable columns
--    without defaults is a catalogue-only change.
-- 2. ingest_v2_gateway_request stores them, fills the existing started_at / completed_at columns
--    from the attempt's started_at_unix_ms and latency_ms (never written until now), and keeps
--    provider_api_model_id and fallback_attempted in safe_metadata. As in 20261104194200, the
--    deployed definition is patched at the attempts insert only, so edits to other sections of
--    the function are preserved.

SET local check_function_bodies = off;

ALTER TABLE "public"."v2_request_attempts"
  ADD COLUMN "status_text" text,
  ADD COLUMN "upstream_error_code" text,
  ADD COLUMN "upstream_error_message" text,
  ADD COLUMN "upstream_error_description" text;

COMMENT ON COLUMN "public"."v2_request_attempts"."status_text" IS 'HTTP reason phrase the provider returned for this attempt, for example Too Many Requests. Null when the provider sent none and on rows recorded before the gateway sent it.';

COMMENT ON COLUMN "public"."v2_request_attempts"."upstream_error_code" IS 'Error code from the provider response body for this attempt, for example rate_limit_exceeded. error_code holds the gateway failure type instead.';

COMMENT ON COLUMN "public"."v2_request_attempts"."upstream_error_message" IS 'Provider error message for this attempt as summarised by the gateway (at most 320 characters from the executor, capped at 1024 here). Never the raw provider payload.';

COMMENT ON COLUMN "public"."v2_request_attempts"."upstream_error_description" IS 'Provider error description or offending parameter for this attempt as summarised by the gateway, capped at 1024 characters.';

do $migration$
declare
  definition text := pg_get_functiondef('public.ingest_v2_gateway_request(jsonb)'::regprocedure);
  column_anchor text := $anchor$    health_class, health_reason
  )
  select$anchor$;
  column_replacement text := $replacement$    health_class, health_reason, started_at, completed_at, status_text,
    upstream_error_code, upstream_error_message, upstream_error_description
  )
  select$replacement$;
  metadata_anchor text := $anchor$      'was_probe', coalesce((item.value->>'was_probe')::boolean, false)
    )),$anchor$;
  metadata_replacement text := $replacement$      'was_probe', coalesce((item.value->>'was_probe')::boolean, false),
      'provider_api_model_id', left(nullif(item.value->>'provider_api_model_id', ''), 256),
      'fallback_attempted', case when item.value->>'fallback_attempted' = 'true' then true end
    )),$replacement$;
  value_anchor text := $anchor$      then item.value->>'health_reason'
    end
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)$anchor$;
  value_replacement text := $replacement$      then item.value->>'health_reason'
    end,
    case
      when item.value->>'started_at_unix_ms' ~ '^[0-9]{12,14}$'
      then to_timestamp((item.value->>'started_at_unix_ms')::numeric / 1000)
    end,
    case
      when item.value->>'started_at_unix_ms' ~ '^[0-9]{12,14}$'
        and item.value->>'latency_ms' ~ '^[0-9]{1,9}$'
      then to_timestamp(((item.value->>'started_at_unix_ms')::numeric + (item.value->>'latency_ms')::numeric) / 1000)
    end,
    left(nullif(trim(item.value->>'status_text'), ''), 120),
    left(nullif(item.value->>'upstream_error_code', ''), 120),
    left(nullif(item.value->>'upstream_error_message', ''), 1024),
    left(nullif(item.value->>'upstream_error_description', ''), 1024)
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)$replacement$;
begin
  -- The anchors are LF-only, whatever line endings this file was checked out with.
  column_anchor := replace(column_anchor, chr(13), '');
  column_replacement := replace(column_replacement, chr(13), '');
  metadata_anchor := replace(metadata_anchor, chr(13), '');
  metadata_replacement := replace(metadata_replacement, chr(13), '');
  value_anchor := replace(value_anchor, chr(13), '');
  value_replacement := replace(value_replacement, chr(13), '');
  if strpos(definition, 'upstream_error_message') > 0 then
    raise exception 'Attempt upstream detail ingestion is already installed';
  end if;
  if (length(definition) - length(replace(definition, column_anchor, ''))) / length(column_anchor) <> 1 then
    raise exception 'Expected exactly one attempts insert column list ending with health_reason';
  end if;
  if (length(definition) - length(replace(definition, metadata_anchor, ''))) / length(metadata_anchor) <> 1 then
    raise exception 'Expected exactly one attempts safe_metadata object ending with was_probe';
  end if;
  if (length(definition) - length(replace(definition, value_anchor, ''))) / length(value_anchor) <> 1 then
    raise exception 'Expected exactly one attempts health_reason value';
  end if;
  execute replace(replace(replace(definition,
    column_anchor, column_replacement),
    metadata_anchor, metadata_replacement),
    value_anchor, value_replacement);
end;
$migration$;
