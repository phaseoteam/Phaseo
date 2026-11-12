CREATE TABLE "public"."gateway_provider_health_states" (
  "provider_id"        text                     NOT NULL,
  "model_id"           text                     NOT NULL,
  "endpoint"           text                     NOT NULL,
  "breaker_state"      text                     NOT NULL DEFAULT 'closed'::text,
  "is_deranked"        boolean                  NOT NULL DEFAULT false,
  "open_until_ms"      bigint                   NOT NULL DEFAULT 0,
  "open_until"         timestamp with time zone,
  "last_transition_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "last_reason"        text,
  CONSTRAINT "gateway_provider_health_states_breaker_state_chk" CHECK ((breaker_state = ANY (ARRAY['closed'::text, 'open'::text, 'half_open'::text]))),
  CONSTRAINT "gateway_provider_health_states_pkey" PRIMARY KEY (provider_id, model_id, endpoint)
);

ALTER TABLE "public"."gateway_provider_health_states"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_provider_health_states_deranked_idx ON public.gateway_provider_health_states USING btree (provider_id, is_deranked, updated_at DESC);

CREATE INDEX gateway_provider_health_states_provider_updated_idx ON public.gateway_provider_health_states USING btree (provider_id, updated_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."gateway_provider_health_states"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_provider_health_states" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_provider_health_states" FROM "anon", "authenticated";
