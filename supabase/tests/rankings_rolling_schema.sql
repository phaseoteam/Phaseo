-- Exercise every query branch against the actual replayed schema and privileges.
begin;
set local role service_role;
do $$
declare metric text; days integer; period text; dimension text;
begin
  perform * from public.get_public_context_length_distribution(30, 1, 1);
  perform * from public.get_public_geography_usage(now() - interval '30 days', now(), 1, 1);
  assert (select indisvalid from pg_index where indexrelid = 'public.v2_request_facts_public_distribution_idx'::regclass);
  assert (select indisvalid from pg_index where indexrelid = 'public.v2_request_usage_public_tokens_idx'::regclass);
  assert (select indisvalid from pg_index where indexrelid = 'public.v2_request_facts_public_ranking_idx'::regclass);
  assert (select indisvalid from pg_index where indexrelid = 'public.v2_request_usage_public_ranking_idx'::regclass);
  foreach metric in array array['text_tokens','image_inputs','image_outputs','audio_tokens',
    'audio_seconds','speech_seconds','transcription_seconds','video_tokens','video_seconds',
    'cached_tokens','embedding_tokens','rerank_quad_tokens','tool_calls','users'] loop
    foreach days in array array[1,7,30] loop
      perform * from public.get_public_period_leaderboard(metric, days, now());
    end loop;
  end loop;
  foreach period in array array['today','24h','week','4w','month','year'] loop
    perform * from public.get_public_top_apps_rolling(20, period, now());
    foreach dimension in array array['organization','provider'] loop
      perform * from public.get_public_market_share_rolling(dimension, period, now());
    end loop;
  end loop;
  assert not has_function_privilege('anon', 'public.get_public_period_leaderboard(text,integer,timestamptz)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.get_public_period_leaderboard(text,integer,timestamptz)', 'EXECUTE');
end $$;
rollback;
