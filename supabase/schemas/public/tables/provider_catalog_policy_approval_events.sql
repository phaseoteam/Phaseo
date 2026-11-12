CREATE TABLE public.provider_catalog_policy_approval_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_slug text NOT NULL,
  previous_approval jsonb,
  current_approval jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_catalog_policy_approval_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_catalog_policy_approval_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.provider_catalog_policy_approval_events TO service_role;
CREATE INDEX provider_catalog_policy_approval_events_provider_idx ON public.provider_catalog_policy_approval_events(provider_slug, created_at DESC);
