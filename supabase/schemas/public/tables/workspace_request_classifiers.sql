CREATE TABLE "public"."workspace_request_classifiers" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"         uuid                     NOT NULL,
  "name"                 text                     NOT NULL,
  "description"          text,
  "enabled"              boolean                  NOT NULL DEFAULT true,
  "model"                text                     NOT NULL,
  "instructions"         text                     NOT NULL DEFAULT '',
  "dimensions"           jsonb                    NOT NULL,
  "sample_rate_bps"      integer                  NOT NULL DEFAULT 10000,
  "sample_by"            text                     NOT NULL DEFAULT 'request',
  "input_scope"          text                     NOT NULL DEFAULT 'prompt',
  "scope"                jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "monthly_budget_nanos" bigint,
  "created_by"           uuid,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_request_classifiers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_request_classifiers_description_check" CHECK (((description IS NULL) OR (length(description) <= 500))),
  CONSTRAINT "workspace_request_classifiers_dimensions_check" CHECK (((jsonb_typeof(dimensions) = 'array'::text) AND (jsonb_array_length(dimensions) >= 1) AND (jsonb_array_length(dimensions) <= 12))),
  CONSTRAINT "workspace_request_classifiers_id_workspace_id_key" UNIQUE (id, workspace_id),
  CONSTRAINT "workspace_request_classifiers_input_scope_check" CHECK ((input_scope = ANY (ARRAY['prompt'::text, 'prompt_and_response'::text]))),
  CONSTRAINT "workspace_request_classifiers_instructions_check" CHECK ((length(instructions) <= 8000)),
  CONSTRAINT "workspace_request_classifiers_model_check" CHECK (((length(btrim(model)) >= 1) AND (length(model) <= 200))),
  CONSTRAINT "workspace_request_classifiers_monthly_budget_nanos_check" CHECK (((monthly_budget_nanos IS NULL) OR (monthly_budget_nanos > 0))),
  CONSTRAINT "workspace_request_classifiers_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 100))),
  CONSTRAINT "workspace_request_classifiers_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_request_classifiers_sample_by_check" CHECK ((sample_by = ANY (ARRAY['request'::text, 'session'::text]))),
  CONSTRAINT "workspace_request_classifiers_sample_rate_bps_check" CHECK (((sample_rate_bps >= 1) AND (sample_rate_bps <= 10000))),
  CONSTRAINT "workspace_request_classifiers_scope_check" CHECK ((jsonb_typeof(scope) = 'object'::text)),
  CONSTRAINT "workspace_request_classifiers_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_request_classifiers"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_request_classifiers_created_by_idx ON public.workspace_request_classifiers USING btree (created_by);

CREATE INDEX workspace_request_classifiers_workspace_created_idx ON public.workspace_request_classifiers USING btree (workspace_id, created_at, id);

CREATE UNIQUE INDEX workspace_request_classifiers_workspace_name_idx ON public.workspace_request_classifiers USING btree (workspace_id, lower(btrim(name)));

CREATE TRIGGER enforce_request_classifier_limit
  BEFORE INSERT OR UPDATE OF workspace_id ON public.workspace_request_classifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_request_classifier_limit();

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_request_classifiers
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE TRIGGER workspace_request_classifiers_set_updated_at
  BEFORE UPDATE ON public.workspace_request_classifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_request_classifiers"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_request_classifiers" IS 'Customer-defined request classifiers. After a request finishes, the gateway asks the chosen model to place the request in each dimension (a fixed list of allowed values) and writes the answers onto the request as labels, so they filter and group like caller-sent labels. A dimension the caller already labelled is skipped. Classifier calls are billed to the workspace at the model''s normal price. At most 5 per workspace (enforce_request_classifier_limit).';

COMMENT ON COLUMN "public"."workspace_request_classifiers"."dimensions" IS 'Array of 1 to 12 dimensions: {key, name, description?, multiple, allow_other, values: [{value, description?}]}. key becomes the request label key. Shape is validated by the management API.';

COMMENT ON COLUMN "public"."workspace_request_classifiers"."sample_rate_bps" IS 'Share of eligible requests to classify, in basis points (10000 = every request).';

COMMENT ON COLUMN "public"."workspace_request_classifiers"."sample_by" IS 'request samples each request independently; session keeps every request in a session in or out together.';

COMMENT ON COLUMN "public"."workspace_request_classifiers"."input_scope" IS 'prompt classifies the request only; prompt_and_response also shows the model the generated response.';

COMMENT ON COLUMN "public"."workspace_request_classifiers"."scope" IS 'Optional filters on which requests are eligible: {key_ids?, app_ids?, models?}. An empty object means every request.';

COMMENT ON COLUMN "public"."workspace_request_classifiers"."monthly_budget_nanos" IS 'Optional cap on classifier spend per UTC calendar month, in nanodollars. Classification pauses for the rest of the month once it is reached.';

REVOKE ALL ON TABLE "public"."workspace_request_classifiers" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_request_classifiers" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_request_classifiers" FROM "anon", "authenticated";
