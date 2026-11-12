CREATE TABLE public.provider_catalog_policy_approvals (
  provider_slug text PRIMARY KEY REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  catalog_url text,
  management_mode text NOT NULL CHECK (management_mode IN ('remote', 'managed')),
  privacy_policy_url text NOT NULL CHECK (privacy_policy_url LIKE 'https://%'),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_catalog_policy_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_catalog_policy_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_catalog_policy_approvals TO service_role;
CREATE INDEX provider_catalog_policy_approvals_approved_by_idx ON public.provider_catalog_policy_approvals(approved_by);

CREATE TRIGGER invalidate_catalog_policy_approval AFTER INSERT OR UPDATE OR DELETE ON public.provider_catalog_policy_approvals
FOR EACH STATEMENT EXECUTE FUNCTION private.invalidate_routing_catalogue();
