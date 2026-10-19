CREATE OR REPLACE FUNCTION private.workspace_push_message (
  p_kind           text,
  p_category       text,
  p_payload        jsonb,
  p_is_actor       boolean,
  p_workspace_name text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
-- Writes one workspace push for one recipient: kind, category, title, body, href and modelSlug,
-- or null for a kind it cannot write.
--   p_is_actor        the recipient did what the push is about: "You created API key 'prod'".
--   p_workspace_name  set when the recipient belongs to more than one workspace. The title then
--                     starts with it, and an ordinary first word is lower-cased: "Acme: balance
--                     is $3.20", but "Acme: GPT-4o retires Nov 30".
-- Money is in US format ($3.20) and dates are UTC (Nov 30). Kinds not written here carry their
-- own text in payload.push: title, body, href, modelSlug and lowerLead.
-- Low balance says how long the balance lasts at the pace of the last spend_window_days days
-- (recent_spend_nanos), as the web's credit runway does: not below a cent a day, and "more than
-- 90 days" past that.
declare
  v_number constant text := '^-?[0-9]+(\.[0-9]+)?$';
  v_title text;
  v_body text;
  v_href text;
  v_model text;
  v_lower boolean := false;
  v_name text := nullif(btrim(coalesce(p_payload ->> 'key_name', '')), '');
  v_key text;
  v_actor text := left(nullif(btrim(coalesce(p_payload ->> 'actor_name', '')), ''), 40);
  v_source text := nullif(btrim(coalesce(p_payload ->> 'reported_source', '')), '');
  v_count numeric;
  v_retires timestamptz;
  v_deprecates timestamptz;
  v_expires timestamptz;
  v_balance numeric;
  v_daily numeric;
  v_days numeric;
begin
  v_key := '''' || case when v_name is null then 'unnamed' when char_length(v_name) > 40 then left(v_name, 39) || '…' else v_name end || '''';

  if p_kind = 'low_balance' then
    v_lower := true;
    v_balance := case when p_payload ->> 'balance_nanos' ~ v_number then (p_payload ->> 'balance_nanos')::numeric end;
    v_daily := case when p_payload ->> 'recent_spend_nanos' ~ v_number and p_payload ->> 'spend_window_days' ~ '^[1-9][0-9]*$'
      then (p_payload ->> 'recent_spend_nanos')::numeric / (p_payload ->> 'spend_window_days')::numeric end;
    v_days := case when v_balance > 0 and v_daily >= 10000000 then v_balance / v_daily end;
    v_title := 'Balance is ' || coalesce(private.workspace_push_usd(greatest(0, v_balance)), 'low');
    v_body := case
        when v_days is null then ''
        when v_days < 1 then 'Less than a day left at this week''s pace. '
        when v_days > 90 then 'More than 90 days left at this week''s pace. '
        when round(v_days) = 1 then 'About 1 day left at this week''s pace. '
        else 'About ' || round(v_days) || ' days left at this week''s pace. '
      end || 'Add credits to keep requests running.';
    v_href := '/settings/credits';

  elsif p_kind = 'auto_top_up_failed' then
    v_lower := true;
    v_title := 'Auto top-up failed';
    v_body := left(coalesce(nullif(btrim(p_payload ->> 'reason'), ''), 'The saved payment method could not be charged.'), 200);
    v_href := '/settings/credits';

  elsif p_kind = 'payment_method_expiring' then
    v_lower := true;
    v_title := coalesce('Card ending ' || nullif(btrim(p_payload ->> 'last4'), '') || ' expires soon', 'Your card expires soon');
    v_body := 'Your ' || coalesce(initcap(replace(nullif(btrim(p_payload ->> 'brand'), ''), '_', ' ')), 'card')
      || ' expires ' || coalesce(nullif(btrim(p_payload ->> 'expiry'), ''), 'soon') || '. Update it to keep top-ups working.';
    v_href := '/settings/payment-methods';

  elsif p_kind = 'model_deprecation' then
    v_model := nullif(btrim(p_payload ->> 'model_id'), '');
    v_name := coalesce(nullif(btrim(p_payload ->> 'model_name'), ''), v_model, 'A model you use');
    v_retires := case when p_payload ->> 'retirement_date' ~ '^\d{4}-\d{2}-\d{2}' then (p_payload ->> 'retirement_date')::timestamptz end;
    v_deprecates := case when p_payload ->> 'deprecation_date' ~ '^\d{4}-\d{2}-\d{2}' then (p_payload ->> 'deprecation_date')::timestamptz end;
    v_title := v_name || case
      when v_retires > now() then ' retires ' || to_char(v_retires at time zone 'UTC', 'Mon FMDD')
      when v_deprecates > now() then ' is deprecated from ' || to_char(v_deprecates at time zone 'UTC', 'Mon FMDD')
      else ' is deprecated'
    end;
    v_body := coalesce('Switch to ' || nullif(btrim(coalesce(p_payload ->> 'replacement_model_name', p_payload ->> 'replacement_model_id')), '')
      || case when v_retires > now() then ' before then.' else '.' end, 'Choose a supported replacement.');
    v_href := coalesce('/models/' || v_model, '/');

  elsif p_kind = 'model_substitution' then
    v_model := nullif(btrim(p_payload ->> 'replacement_model_id'), '');
    v_name := coalesce(nullif(btrim(p_payload ->> 'model_name'), ''), nullif(btrim(p_payload ->> 'model_id'), ''), 'A retired model');
    v_title := v_name || ' requests now go to ' || coalesce(nullif(btrim(p_payload ->> 'replacement_model_name'), ''), v_model, 'its replacement');
    v_body := 'No provider serves ' || v_name || ' any more.';
    v_href := coalesce('/models/' || v_model, '/');

  elsif p_kind = 'rate_limit_throttled' then
    v_lower := true;
    v_count := case when p_payload ->> 'throttled_requests' ~ v_number then (p_payload ->> 'throttled_requests')::numeric end;
    v_title := 'Rate limits blocked ' || coalesce(to_char(v_count, 'FM999,999,999,990') || case when v_count = 1 then ' request' else ' requests' end, 'requests');
    v_body := 'In the last ' || coalesce(case when p_payload ->> 'window_minutes' ~ '^[0-9]+$' then p_payload ->> 'window_minutes' end, '15') || ' minutes.'
      || coalesce(' Most were under ''' || (
        select left(nullif(btrim(p ->> 'policy_name'), ''), 40)
        from jsonb_array_elements(case when jsonb_typeof(p_payload -> 'policies') = 'array' then p_payload -> 'policies' else '[]'::jsonb end) p
        order by case when p ->> 'throttled_requests' ~ v_number then (p ->> 'throttled_requests')::numeric end desc nulls last
        limit 1
      ) || '''.', '');
    v_href := '/settings/usage/overview';

  elsif p_kind = 'security_leaked_key' then
    v_title := case when p_payload ->> 'key_type' = 'management_key' then 'Management key ' else 'API key ' end || v_key || ' was exposed';
    v_body := coalesce('Reported by ' || case
        when v_source ~* 'github' then 'GitHub'
        when v_source ~* 'gitlab' then 'GitLab'
        else left(btrim(regexp_replace(v_source, '[_-]+', ' ', 'g')), 40)
      end || '. ', 'Reported as public. ')
      || case when p_payload ->> 'auto_revoked' = 'true' then 'It has been revoked, so replace it.' else 'Rotate it now.' end;
    v_href := case when p_payload ->> 'key_type' = 'management_key' then '/settings/management-api-keys' else '/settings/keys' end;

  elsif p_kind in ('api_key_created', 'api_key_rotated', 'api_key_deleted', 'api_key_paused', 'api_key_resumed') then
    if coalesce(p_is_actor, false) then
      v_lower := true;
      v_title := 'You ' || substr(p_kind, 9) || ' API key ' || v_key;
    elsif p_kind = 'api_key_created' then
      v_lower := true;
      v_title := 'New API key ' || v_key || ' created' || coalesce(' by ' || v_actor, '');
    else
      v_title := 'API key ' || v_key || ' ' || substr(p_kind, 9) || coalesce(' by ' || v_actor, '');
    end if;
    v_expires := case when p_payload ->> 'previous_key_expires_at' ~ '^\d{4}-\d{2}-\d{2}' then (p_payload ->> 'previous_key_expires_at')::timestamptz end;
    v_body := case p_kind
      when 'api_key_created' then case
        when nullif(btrim(p_payload ->> 'app_name'), '') is not null then 'Issued to ' || left(btrim(p_payload ->> 'app_name'), 60) || ' through OAuth.'
        when coalesce(p_is_actor, false) then 'Owners and admins get this alert too.'
        else 'Review your keys if you didn''t expect this.'
      end
      when 'api_key_rotated' then coalesce('The new key is ''' || left(nullif(btrim(p_payload ->> 'replacement_key_name'), ''), 40) || '''. ', '')
        || coalesce('The old one stops working ' || to_char(v_expires at time zone 'UTC', 'Mon FMDD, HH24:MI') || ' UTC.', 'The old one works until you delete it.')
      when 'api_key_deleted' then 'Requests using it are now rejected.'
      when 'api_key_paused' then 'Requests using it are rejected until it''s resumed.'
      else 'It can make requests again.'
    end;
    v_href := '/settings/keys';

  elsif jsonb_typeof(p_payload -> 'push') = 'object' then
    v_title := nullif(btrim(p_payload -> 'push' ->> 'title'), '');
    v_body := p_payload -> 'push' ->> 'body';
    v_href := p_payload -> 'push' ->> 'href';
    v_model := nullif(btrim(p_payload -> 'push' ->> 'modelSlug'), '');
    v_lower := coalesce(p_payload -> 'push' ->> 'lowerLead' = 'true', false);
  end if;

  if v_title is null then
    return null;
  end if;
  if nullif(btrim(p_workspace_name), '') is not null then
    v_title := left(btrim(p_workspace_name), 40) || ': '
      || case when v_lower then lower(left(v_title, 1)) || substr(v_title, 2) else v_title end;
  end if;

  return jsonb_build_object('kind', p_kind, 'category', p_category, 'title', left(v_title, 300), 'body', left(coalesce(v_body, ''), 1000),
    'href', coalesce(nullif(btrim(v_href), ''), '/'), 'modelSlug', v_model);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."workspace_push_message"(text, text, jsonb, boolean, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."workspace_push_message"(text, text, jsonb, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."workspace_push_message"(text, text, jsonb, boolean, text) TO "postgres";
