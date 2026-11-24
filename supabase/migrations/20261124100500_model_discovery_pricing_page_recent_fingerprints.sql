-- Earlier fingerprints for each watched pricing page.
--
-- Some pricing pages are served in more than one version at once. From the model watcher's
-- Cloudflare Worker, cohere.com/pricing alternated between two sets of prices every few hours,
-- and each switch sent a pricing-page alert. The watcher now keeps the last few fingerprints a
-- page replaced and does not report a page that returns to one of them.
--
-- One jsonb array column with a constant default: a catalogue-only change.

ALTER TABLE "public"."model_discovery_pricing_pages"
  ADD COLUMN "recent_fingerprints" jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN "public"."model_discovery_pricing_pages"."recent_fingerprints" IS 'Fingerprints this page had before the current one, newest first, capped by the model watcher. A page that returns to one of them is not reported as a pricing change.';
