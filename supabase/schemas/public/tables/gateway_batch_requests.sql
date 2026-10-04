CREATE TABLE "public"."gateway_batch_requests" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "batch_id"          text                     NOT NULL,
  "provider"          text                     NOT NULL,
  "native_batch_id"   text,
  "custom_id"         text                     NOT NULL,
  "request_index"     integer                  NOT NULL DEFAULT 0,
  "method"            text,
  "endpoint"          text,
  "model"             text,
  "status"            text                     NOT NULL DEFAULT 'queued'::text,
  "request_body_hash" text,
  "response_status"   integer,
  "response_body"     jsonb,
  "error_body"        jsonb,
  "usage"             jsonb,
  "cost_nanos"        bigint,
  "cost_usd"          numeric,
  "meta"              jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at"      timestamp with time zone,
  CONSTRAINT "gateway_batch_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_batch_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_batch_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_batch_requests_provider_native_idx ON public.gateway_batch_requests USING btree (PROVIDER, native_batch_id)
  WHERE (native_batch_id IS NOT NULL);

CREATE UNIQUE INDEX gateway_batch_requests_workspace_batch_custom_idx ON public.gateway_batch_requests USING btree (workspace_id, batch_id, custom_id);

CREATE INDEX gateway_batch_requests_workspace_batch_status_idx ON public.gateway_batch_requests USING btree (workspace_id, batch_id, status, request_index);

CREATE POLICY "gateway_batch_requests_select_workspace_members" ON "public"."gateway_batch_requests"
  FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE ((wm.workspace_id = gateway_batch_requests.workspace_id) AND (wm.user_id = ( SELECT auth.uid() AS uid))))) OR public.is_workspace_admin(workspace_id)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_batch_requests" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."gateway_batch_requests" IS 'Per-request lifecycle rows for provider batch jobs. Request bodies are represented by hash by default to avoid retaining prompt payloads.';
