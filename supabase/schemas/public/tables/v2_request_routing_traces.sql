CREATE TABLE "public"."v2_request_routing_traces" (
  "request_event_id"      uuid                     NOT NULL,
  "algorithm_version"     text,
  "random_seed"           bigint,
  "selection_method"      text,
  "routing_mode"          text,
  "priority"              text,
  "requested_model"       text,
  "endpoint"              text,
  "final_candidate_count" integer,
  "pool_bounds"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "requested_routing"     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "sticky_routing"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_request_routing_traces_candidate_count_check" CHECK (((final_candidate_count IS NULL) OR (final_candidate_count >= 0))),
  CONSTRAINT "v2_request_routing_traces_pkey" PRIMARY KEY (request_event_id),
  CONSTRAINT "v2_request_routing_traces_pool_bounds_check" CHECK (((jsonb_typeof(pool_bounds) = 'object'::text) AND (pg_column_size(pool_bounds) <= 4096))),
  CONSTRAINT "v2_request_routing_traces_request_event_id_fkey" FOREIGN KEY (request_event_id) REFERENCES public.v2_request_facts(request_event_id) ON DELETE CASCADE,
  CONSTRAINT "v2_request_routing_traces_requested_routing_check" CHECK (((jsonb_typeof(requested_routing) = 'object'::text) AND (pg_column_size(requested_routing) <= 8192))),
  CONSTRAINT "v2_request_routing_traces_sticky_routing_check" CHECK (((jsonb_typeof(sticky_routing) = 'object'::text) AND (pg_column_size(sticky_routing) <= 4096)))
);

ALTER TABLE "public"."v2_request_routing_traces"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_request_routing_traces_workspace_select" ON "public"."v2_request_routing_traces"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_request_facts request
  WHERE ((request.request_event_id = v2_request_routing_traces.request_event_id) AND ( SELECT public.is_workspace_member(request.workspace_id) AS is_workspace_member)))));

COMMENT ON TABLE "public"."v2_request_routing_traces" IS 'One content-free, versioned routing algorithm envelope per gateway request.';

REVOKE ALL ON TABLE "public"."v2_request_routing_traces" FROM "authenticated";

GRANT SELECT ON TABLE "public"."v2_request_routing_traces" TO "authenticated";

REVOKE ALL ON TABLE "public"."v2_request_routing_traces" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."v2_request_routing_traces" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_request_routing_traces" FROM "anon";
