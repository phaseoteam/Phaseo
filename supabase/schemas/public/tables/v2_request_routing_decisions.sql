CREATE TABLE "public"."v2_request_routing_decisions" (
  "routing_decision_id"     bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "request_event_id"        uuid                     NOT NULL,
  "decision_order"          smallint                 NOT NULL,
  "provider_model_id"       text,
  "provider_slug"           text                     NOT NULL,
  "provider_api_model_id"   text,
  "decision"                text                     NOT NULL,
  "rank"                    smallint,
  "score"                   numeric(20,12),
  "selected"                boolean                  NOT NULL DEFAULT false,
  "attempted"               boolean                  NOT NULL DEFAULT false,
  "breaker"                 text,
  "breaker_until"           timestamp with time zone,
  "provider_status"         text,
  "provider_routing_status" text,
  "model_routing_status"    text,
  "capability_status"       text,
  "exclusion_stage"         text,
  "exclusion_reason"        text,
  "score_factors"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "score_trace"             jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "v2_request_routing_decisions_decision_check" CHECK ((decision = ANY (ARRAY['ranked'::text, 'excluded'::text]))),
  CONSTRAINT "v2_request_routing_decisions_factors_check" CHECK (((jsonb_typeof(score_factors) = 'object'::text) AND (pg_column_size(score_factors) <= 4096))),
  CONSTRAINT "v2_request_routing_decisions_order_check" CHECK ((decision_order > 0)),
  CONSTRAINT "v2_request_routing_decisions_pkey" PRIMARY KEY (routing_decision_id),
  CONSTRAINT "v2_request_routing_decisions_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE SET NULL,
  CONSTRAINT "v2_request_routing_decisions_rank_check" CHECK (((rank IS NULL) OR (rank > 0))),
  CONSTRAINT "v2_request_routing_decisions_request_event_id_fkey" FOREIGN KEY (request_event_id) REFERENCES public.v2_request_facts(request_event_id) ON DELETE CASCADE,
  CONSTRAINT "v2_request_routing_decisions_request_order_key" UNIQUE (request_event_id, decision_order),
  CONSTRAINT "v2_request_routing_decisions_score_check" CHECK (((score IS NULL) OR (score >= (0)::numeric))),
  CONSTRAINT "v2_request_routing_decisions_score_trace_check" CHECK (((jsonb_typeof(score_trace) = 'object'::text) AND (pg_column_size(score_trace) <= 16384)))
);

ALTER TABLE "public"."v2_request_routing_decisions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_request_routing_decisions_excluded_idx ON public.v2_request_routing_decisions USING btree (exclusion_reason, created_at DESC)
  WHERE (decision = 'excluded'::text);

CREATE INDEX v2_request_routing_decisions_route_idx ON public.v2_request_routing_decisions USING btree (provider_model_id, created_at DESC)
  WHERE (provider_model_id IS NOT NULL);

CREATE POLICY "v2_request_routing_decisions_workspace_select" ON "public"."v2_request_routing_decisions"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_request_facts request
  WHERE ((request.request_event_id = v2_request_routing_decisions.request_event_id) AND ( SELECT public.is_workspace_member(request.workspace_id) AS is_workspace_member)))));

REVOKE ALL ON SEQUENCE "public"."v2_request_routing_decisions_routing_decision_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."v2_request_routing_decisions_routing_decision_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."v2_request_routing_decisions_routing_decision_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."v2_request_routing_decisions_routing_decision_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."v2_request_routing_decisions_routing_decision_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."v2_request_routing_decisions_routing_decision_id_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_request_routing_decisions" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_request_routing_decisions"."score_factors" IS 'Bounded scalar score components only; request content, secrets, provider payloads, and error bodies are prohibited.';

COMMENT ON COLUMN "public"."v2_request_routing_decisions"."score_trace" IS 'Bounded raw inputs, normalization values, weights, contributions, and intermediate calculations for one candidate.';

COMMENT ON TABLE "public"."v2_request_routing_decisions" IS 'Content-free scored/ranked and excluded provider decisions used to explain routing for one gateway request.';
