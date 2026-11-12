CREATE TABLE public.provider_catalog_edit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_slug text NOT NULL REFERENCES public.v2_providers(provider_slug),
  model_slug text NOT NULL,
  field text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('phaseo', 'provider')),
  actor_name text,
  action text NOT NULL CHECK (action IN ('override', 'revert')),
  previous_value jsonb,
  value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_catalog_edit_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX provider_catalog_edit_events_provider_idx ON public.provider_catalog_edit_events(provider_slug, created_at DESC, id DESC);
REVOKE ALL ON TABLE public.provider_catalog_edit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.provider_catalog_edit_events TO service_role;
