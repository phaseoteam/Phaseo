CREATE TABLE "public"."scim_audit_events" (
  "id"             bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "workspace_id"   uuid                     NOT NULL,
  "endpoint_id"    uuid,
  "token_id"       uuid,
  "request_id"     text                     NOT NULL,
  "correlation_id" text,
  "action"         text                     NOT NULL,
  "resource_type"  text,
  "resource_id"    text,
  "outcome"        text                     NOT NULL,
  "http_status"    integer                  NOT NULL,
  "scim_type"      text,
  "detail"         text,
  "source_ip_hash" text,
  "user_agent"     text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scim_audit_events_action_length_check" CHECK (((char_length(action) >= 1) AND (char_length(action) <= 100))),
  CONSTRAINT "scim_audit_events_http_status_check" CHECK (((http_status >= 100) AND (http_status <= 599))),
  CONSTRAINT "scim_audit_events_outcome_check" CHECK ((outcome = ANY (ARRAY['success'::text, 'failure'::text, 'denied'::text]))),
  CONSTRAINT "scim_audit_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."scim_audit_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX scim_audit_events_endpoint_id_idx ON public.scim_audit_events USING btree (endpoint_id);

CREATE INDEX scim_audit_events_token_id_idx ON public.scim_audit_events USING btree (token_id);

CREATE INDEX scim_audit_events_workspace_created_at_idx ON public.scim_audit_events USING btree (workspace_id, created_at DESC);

CREATE TRIGGER scim_audit_events_append_only
  BEFORE DELETE OR UPDATE ON public.scim_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_scim_audit_event_mutation();

CREATE POLICY "deny_direct_client_access" ON "public"."scim_audit_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON SEQUENCE "public"."scim_audit_events_id_seq" FROM "service_role";

GRANT SELECT, USAGE ON SEQUENCE "public"."scim_audit_events_id_seq" TO "service_role";

COMMENT ON TABLE "public"."scim_audit_events" IS 'Append-only, sanitized SCIM provisioning audit history. Credentials and request bodies must never be stored here.';

REVOKE ALL ON TABLE "public"."scim_audit_events" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."scim_audit_events" TO "service_role";

REVOKE ALL ON TABLE "public"."scim_audit_events" FROM "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."scim_audit_events_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."scim_audit_events_id_seq" FROM "authenticated";
