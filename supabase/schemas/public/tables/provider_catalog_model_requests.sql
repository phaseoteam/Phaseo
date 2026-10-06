CREATE TABLE public.provider_catalog_model_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug text NOT NULL REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE,
  model_slug text NOT NULL,
  source_run_id uuid NOT NULL REFERENCES public.provider_catalog_sync_runs(id) ON DELETE CASCADE,
  model jsonb NOT NULL CHECK (jsonb_typeof(model) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','needs_changes','withdrawn')),
  reason text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notification_sent_at timestamptz,
  notification_lease uuid,
  notification_retry_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_slug, model_slug)
);
ALTER TABLE public.provider_catalog_model_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_direct_client_access ON public.provider_catalog_model_requests AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX provider_catalog_model_requests_queue_idx ON public.provider_catalog_model_requests(status, created_at);
REVOKE ALL ON public.provider_catalog_model_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_catalog_model_requests TO service_role;
