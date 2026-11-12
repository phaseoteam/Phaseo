CREATE OR REPLACE FUNCTION private.mobile_push_group_message (
  p_group_key text,
  p_items     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
-- Writes the push for one group. p_items lists every event in it, oldest first, including those
-- already sent to the device since midnight UTC: the new push replaces that notification on
-- screen, so it counts them all. Items carry kind, modelSlug, labSlug, providerSlug, modelName,
-- labName, providerName, title, body and href. Returns kind, modelSlug, title, body, href and
-- count (models for release and provider groups, changes for price groups).
--   one        the event as written.
--   2 or 3     every model named: "OpenAI released GPT-6 Astra and GPT-6 Astra Pro".
--   4 or more  counted, the first three named in the body, and the lab or provider page opened:
--              "DeepSeek released 12 models", "DeepSeek V5, V5 Lite, V5 Coder and 9 more".
-- Names after the first drop a leading lab name when the model is from the first model's lab.
declare
  v_size integer := coalesce(jsonb_array_length(p_items), 0);
  v_first jsonb := p_items -> 0;
  v_last jsonb := p_items -> (coalesce(jsonb_array_length(p_items), 0) - 1);
  v_scope text := split_part(coalesce(p_group_key, ''), ':', 1);
  v_names text[];
  v_count integer;
  v_joined text;
  v_released boolean;
  v_on_phaseo boolean;
  v_owner text;
begin
  if v_size = 0 then
    return null;
  end if;

  if v_size > 1 and v_scope = 'price' then
    return jsonb_build_object(
      'kind', 'price_changed',
      'modelSlug', v_last ->> 'modelSlug',
      'title', left(coalesce(v_last ->> 'modelName', v_last ->> 'modelSlug') || ' prices changed', 300),
      'body', left(rtrim(v_last ->> 'title', '.') || coalesce(' at ' || (v_last ->> 'providerName'), '') || '. '
        || (v_size - 1) || case when v_size = 2 then ' other change today.' else ' other changes today.' end, 1000),
      'href', v_last ->> 'href',
      'count', v_size);
  end if;

  if v_size > 1 and v_scope in ('release', 'provider') then
    -- Each model once, in the order it first appeared.
    select array_agg(n.name order by n.ord), count(*)::integer
      into v_names, v_count
    from (
      select distinct on (coalesce(i.item ->> 'modelSlug', i.item ->> 'modelName'))
        i.ord,
        case
          when i.ord > 1 and (i.item ->> 'labSlug') = (v_first ->> 'labSlug') and nullif(i.item ->> 'labName', '') is not null
            and char_length(i.item ->> 'modelName') > char_length(i.item ->> 'labName') + 1
            and left(i.item ->> 'modelName', char_length(i.item ->> 'labName') + 1) = (i.item ->> 'labName') || ' '
            then substr(i.item ->> 'modelName', char_length(i.item ->> 'labName') + 2)
          else coalesce(i.item ->> 'modelName', i.item ->> 'modelSlug')
        end as name
      from jsonb_array_elements(p_items) with ordinality as i(item, ord)
      order by coalesce(i.item ->> 'modelSlug', i.item ->> 'modelName'), i.ord
    ) n;

    if v_count > 1 then
      v_joined := case
        when v_count <= 3 then array_to_string(v_names[1:v_count - 1], ', ') || ' and ' || v_names[v_count]
        else array_to_string(v_names[1:3], ', ') || ' and ' || (v_count - 3) || ' more'
      end;

      if v_scope = 'release' then
        v_owner := coalesce(nullif(v_first ->> 'labName', ''), v_first ->> 'labSlug');
        select bool_or(i ->> 'kind' = 'model_released'),
               bool_and(i ->> 'kind' = 'gateway_available' or i ->> 'body' = 'You can use it on Phaseo now.')
          into v_released, v_on_phaseo
        from jsonb_array_elements(p_items) as i;
        return jsonb_build_object(
          'kind', case when v_released then 'model_released' else 'gateway_available' end,
          'modelSlug', null,
          'title', left(case
            when v_released and v_count <= 3 then v_owner || ' released ' || v_joined
            when v_released then v_owner || ' released ' || v_count || ' models'
            when v_count <= 3 then v_joined || ' are now on Phaseo'
            else v_count || ' ' || v_owner || ' models are now on Phaseo'
          end, 300),
          'body', left(case
            when v_count > 3 then v_joined
            when not v_released then 'You can now use them through Phaseo.'
            when v_on_phaseo then 'You can use them on Phaseo now.'
            else 'See the details on Phaseo.'
          end, 1000),
          'href', '/organisations/' || (v_first ->> 'labSlug'),
          'count', v_count);
      end if;

      v_owner := coalesce(nullif(v_first ->> 'providerName', ''), v_first ->> 'providerSlug');
      return jsonb_build_object(
        'kind', 'provider_added',
        'modelSlug', null,
        'title', left(case
          when v_count <= 3 then v_joined || ' are now available from ' || v_owner
          else v_count || ' models are now available from ' || v_owner
        end, 300),
        'body', left(case when v_count <= 3 then v_owner || ' is now a provider for them on Phaseo.' else v_joined end, 1000),
        'href', '/api-providers/' || (v_first ->> 'providerSlug'),
        'count', v_count);
    end if;
  end if;

  -- One event, or one model told about twice: the newest event as written.
  return jsonb_build_object('kind', v_last ->> 'kind', 'modelSlug', v_last ->> 'modelSlug', 'title', v_last ->> 'title',
    'body', v_last ->> 'body', 'href', v_last ->> 'href', 'count', 1);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_group_message"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_group_message"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_group_message"(text, jsonb) TO "postgres";
