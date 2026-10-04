CREATE TABLE "public"."v2_catalogue_row_history" (
  "event_id"       bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "table_name"     text                     NOT NULL,
  "model_slug"     text,
  "operation"      text                     NOT NULL,
  "actor_user_id"  uuid,
  "transaction_id" bigint                   NOT NULL DEFAULT txid_current(),
  "before_state"   jsonb,
  "after_state"    jsonb,
  "recorded_at"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "v2_catalogue_row_history_operation_check" CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text, 'BASELINE'::text]))),
  CONSTRAINT "v2_catalogue_row_history_pkey" PRIMARY KEY (event_id)
);

ALTER TABLE "public"."v2_catalogue_row_history"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_catalogue_row_history_model_idx ON public.v2_catalogue_row_history USING btree (model_slug, event_id DESC);

CREATE INDEX v2_catalogue_row_history_table_time_idx ON public.v2_catalogue_row_history USING btree (table_name, recorded_at DESC);

CREATE TRIGGER catalogue_history_immutable
  BEFORE DELETE OR UPDATE OR TRUNCATE ON public.v2_catalogue_row_history
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.reject_catalogue_history_change();

CREATE POLICY "deny_direct_client_access" ON "public"."v2_catalogue_row_history"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."v2_catalogue_row_history" FROM "service_role";

GRANT SELECT ON TABLE "public"."v2_catalogue_row_history" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_catalogue_row_history" FROM "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."v2_catalogue_row_history_event_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."v2_catalogue_row_history_event_id_seq" FROM "authenticated";

REVOKE ALL ON SEQUENCE "public"."v2_catalogue_row_history_event_id_seq" FROM "service_role";
