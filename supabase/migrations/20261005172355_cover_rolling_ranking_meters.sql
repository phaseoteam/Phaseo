CREATE INDEX CONCURRENTLY v2_request_usage_public_ranking_idx ON public.v2_request_usage USING btree (request_event_id, meter_key) INCLUDE (quantity);
