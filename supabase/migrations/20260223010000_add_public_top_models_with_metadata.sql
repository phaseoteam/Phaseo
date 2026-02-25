-- Public helper for homepage "Most used models" with robust model/org resolution.
-- Resolves internal model IDs via provider mappings and falls back to org prefix hints.

DROP FUNCTION IF EXISTS public.get_public_top_models_with_metadata(text, integer);

CREATE OR REPLACE FUNCTION public.get_public_top_models_with_metadata(
  p_time_range text DEFAULT 'week',
  p_limit integer DEFAULT 6
)
RETURNS TABLE (
  model_id text,
  model_name text,
  organisation_id text,
  organisation_name text,
  total_tokens bigint
) AS $$
DECLARE
  v_since timestamptz;
  v_now timestamptz := now();
BEGIN
  CASE p_time_range
    WHEN 'today' THEN
      v_since := date_trunc('day', v_now);
    WHEN 'week' THEN
      v_since := v_now - interval '7 days';
    WHEN 'month' THEN
      v_since := date_trunc('month', v_now);
    ELSE
      v_since := v_now - interval '7 days';
  END CASE;

  RETURN QUERY
  WITH base_requests AS (
    SELECT
      gr.created_at,
      gr.provider,
      gr.model_id AS raw_model_id,
      COALESCE(
        CASE
          WHEN (gr.usage->>'total_tokens') ~ '^\d+$'
            THEN (gr.usage->>'total_tokens')::bigint
        END,
        (
          COALESCE(
            CASE
              WHEN (gr.usage->>'input_tokens') ~ '^\d+$'
                THEN (gr.usage->>'input_tokens')::bigint
            END,
            0
          ) +
          COALESCE(
            CASE
              WHEN (gr.usage->>'output_tokens') ~ '^\d+$'
                THEN (gr.usage->>'output_tokens')::bigint
            END,
            0
          )
        ),
        0
      ) AS tokens
    FROM public.gateway_requests gr
    WHERE gr.created_at >= v_since
      AND gr.model_id IS NOT NULL
      AND gr.provider IS NOT NULL
      AND gr.provider <> ''
  ),
  resolved AS (
    SELECT
      br.raw_model_id,
      br.tokens,
      COALESCE(dm_direct.model_id, map.internal_model_id) AS internal_model_id,
      COALESCE(dm_direct.name, dm_internal.name, br.raw_model_id) AS resolved_model_name,
      COALESCE(dm_direct.organisation_id, dm_internal.organisation_id, org_guess.organisation_id) AS resolved_org_id,
      COALESCE(org_direct.name, org_internal.name, org_guess.name) AS resolved_org_name
    FROM base_requests br
    LEFT JOIN public.data_models dm_direct
      ON dm_direct.model_id = br.raw_model_id
    LEFT JOIN public.data_organisations org_direct
      ON org_direct.organisation_id = dm_direct.organisation_id
    LEFT JOIN LATERAL (
      SELECT dapm.internal_model_id
      FROM public.data_api_provider_models dapm
      WHERE dapm.provider_id = br.provider
        AND (
          dapm.api_model_id = br.raw_model_id
          OR dapm.provider_api_model_id = br.raw_model_id
          OR dapm.provider_model_slug = br.raw_model_id
          OR dapm.internal_model_id = br.raw_model_id
        )
        AND (dapm.effective_from IS NULL OR dapm.effective_from <= br.created_at)
        AND (dapm.effective_to IS NULL OR dapm.effective_to > br.created_at)
      ORDER BY dapm.is_active_gateway DESC, dapm.updated_at DESC NULLS LAST
      LIMIT 1
    ) map ON TRUE
    LEFT JOIN public.data_models dm_internal
      ON dm_internal.model_id = map.internal_model_id
    LEFT JOIN public.data_organisations org_internal
      ON org_internal.organisation_id = dm_internal.organisation_id
    LEFT JOIN LATERAL (
      SELECT o.organisation_id, o.name
      FROM public.data_organisations o
      WHERE lower(o.organisation_id) = lower(split_part(br.raw_model_id, '/', 1))
         OR lower(o.name) = lower(split_part(br.raw_model_id, '/', 1))
      ORDER BY
        CASE
          WHEN lower(o.organisation_id) = lower(split_part(br.raw_model_id, '/', 1))
            THEN 0
          ELSE 1
        END
      LIMIT 1
    ) org_guess ON TRUE
  ),
  aggregated AS (
    SELECT
      COALESCE(r.internal_model_id, r.raw_model_id) AS resolved_model_id,
      MAX(r.resolved_model_name) AS resolved_model_name,
      MAX(r.resolved_org_id) AS resolved_org_id,
      MAX(r.resolved_org_name) AS resolved_org_name,
      SUM(r.tokens)::bigint AS summed_tokens
    FROM resolved r
    WHERE r.tokens > 0
    GROUP BY COALESCE(r.internal_model_id, r.raw_model_id)
  )
  SELECT
    a.resolved_model_id AS model_id,
    a.resolved_model_name AS model_name,
    a.resolved_org_id AS organisation_id,
    a.resolved_org_name AS organisation_name,
    a.summed_tokens AS total_tokens
  FROM aggregated a
  ORDER BY a.summed_tokens DESC
  LIMIT GREATEST(1, p_limit);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_public_top_models_with_metadata(text, integer)
  IS 'Public top models by token usage with internal model + organisation metadata resolution.';
