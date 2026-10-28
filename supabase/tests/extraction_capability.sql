BEGIN;
DO $$ BEGIN
  ASSERT public.canonical_routing_capability_id('extraction.extract') = 'extraction.extract';
  ASSERT public.canonical_routing_capability_id('decisions.make') = 'decisions.make';
  ASSERT public.canonical_routing_capability_id('extraction.unknown') IS NULL;
END $$;
ROLLBACK;
