CREATE INDEX CONCURRENTLY v2_request_facts_public_ranking_idx ON public.v2_request_facts USING btree (occurred_at)
  INCLUDE (request_event_id, routed_model_slug, requested_model_slug, provider_model_id, app_id, success, tool_call_count);
