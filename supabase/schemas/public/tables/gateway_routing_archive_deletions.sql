CREATE TABLE public.gateway_routing_archive_deletions (
  object_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gateway_routing_archive_deletions ENABLE ROW LEVEL SECURITY;
CREATE INDEX gateway_routing_archive_deletions_created_idx ON public.gateway_routing_archive_deletions(created_at);
CREATE POLICY gateway_routing_archive_deletions_service_select
  ON public.gateway_routing_archive_deletions FOR SELECT TO service_role USING (true);
CREATE POLICY gateway_routing_archive_deletions_service_delete
  ON public.gateway_routing_archive_deletions FOR DELETE TO service_role USING (true);
GRANT SELECT, DELETE ON public.gateway_routing_archive_deletions TO service_role;
COMMENT ON TABLE public.gateway_routing_archive_deletions IS 'Durable private-object deletion queue, retained after the source request or workspace disappears.';
