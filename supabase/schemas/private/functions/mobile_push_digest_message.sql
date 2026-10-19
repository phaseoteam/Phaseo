CREATE OR REPLACE FUNCTION private.mobile_push_digest_message (
  p_facts jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The weekly digest's title and body from private.mobile_push_digest_facts, or null when the
  -- week had neither usage nor a release the user's rules match. Money is in US dollars
  -- ("$42.18") and counts are compact ("18.2M").
  --   * Usage: "Your Phaseo week: $42.18 spent, up 12%", with the change only when both weeks
  --     had spend, and "12,340 requests · 18.2M tokens · Top model: Claude Sonnet 5.5 · 6 new
  --     models launched". A user with more than one workspace is told which were active, most
  --     active first: "Acme: …" or "Acme and 2 other workspaces: …".
  --   * No usage: "Your Phaseo week" and "A quiet week: 6 new models launched, including A and B".
  select case
    when f.requests = 0 and f.spend_nanos = 0 and f.releases = 0 then null
    when f.requests = 0 and f.spend_nanos = 0 then jsonb_build_object(
      'title', 'Your Phaseo week',
      'body', 'A quiet week: ' || f.releases
        || case when f.releases = 1 then ' new model launched, ' else ' new models launched, ' end
        || case
          when f.releases = 1 or f.second_release is null then f.first_release
          when f.releases = 2 then f.first_release || ' and ' || f.second_release
          else 'including ' || f.first_release || ' and ' || f.second_release
        end)
    else jsonb_build_object(
      'title', 'Your Phaseo week' || case when f.spend_nanos > 0 then ': ' || f.money || ' spent' || coalesce(', ' || f.change, '') else '' end,
      'body', f.scope || array_to_string(f.parts, ' · '))
  end
  from (
    select
      t.requests,
      t.spend_nanos,
      t.releases,
      coalesce(t.release_names ->> 0, 'new models') as first_release,
      t.release_names ->> 1 as second_release,
      case
        when t.spend_nanos < 5000000 then 'under $0.01'
        else '$' || to_char(round(t.spend_nanos / 1e9, 2), 'FM999,999,999,990.00')
      end as money,
      case when t.spend_nanos > 0 and t.previous_spend_nanos > 0 then
        case sign(change.percent)
          when 1 then 'up ' || to_char(change.percent, 'FM999,999,990') || '%'
          when -1 then 'down ' || to_char(-change.percent, 'FM999,999,990') || '%'
          else 'same as last week'
        end
      end as change,
      case when t.workspace_count > 1 and t.active_count > 0 then
        coalesce(nullif(btrim(t.active -> 0 ->> 'name'), ''), 'Your workspace')
          || case
            when t.active_count = 2 then ' and 1 other workspace'
            when t.active_count > 2 then ' and ' || (t.active_count - 1) || ' other workspaces'
            else ''
          end
          || ': '
      else '' end as scope,
      array_remove(array[
        private.mobile_push_compact_number(t.requests) || case when t.requests = 1 then ' request' else ' requests' end,
        case when round(t.tokens) > 0 then private.mobile_push_compact_number(t.tokens) || case when round(t.tokens) = 1 then ' token' else ' tokens' end end,
        'Top model: ' || t.top_model,
        case when t.releases > 0 then t.releases || case when t.releases = 1 then ' new model launched' else ' new models launched' end end
      ], null) as parts
    from (
      select
        coalesce((p_facts ->> 'requests')::numeric, 0) as requests,
        coalesce((p_facts ->> 'spendNanos')::numeric, 0) as spend_nanos,
        coalesce((p_facts ->> 'previousSpendNanos')::numeric, 0) as previous_spend_nanos,
        coalesce((p_facts ->> 'tokens')::numeric, 0) as tokens,
        coalesce((p_facts ->> 'workspaceCount')::integer, 0) as workspace_count,
        coalesce(p_facts -> 'activeWorkspaces', '[]'::jsonb) as active,
        coalesce(jsonb_array_length(p_facts -> 'activeWorkspaces'), 0) as active_count,
        nullif(btrim(p_facts -> 'topModel' ->> 'name'), '') as top_model,
        coalesce((p_facts ->> 'releaseCount')::integer, 0) as releases,
        coalesce(p_facts -> 'releaseNames', '[]'::jsonb) as release_names
    ) t
    cross join lateral (
      select round((t.spend_nanos - t.previous_spend_nanos) * 100 / nullif(t.previous_spend_nanos, 0)) as percent
    ) change
  ) f;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_message"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_message"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_digest_message"(jsonb) TO "postgres";
