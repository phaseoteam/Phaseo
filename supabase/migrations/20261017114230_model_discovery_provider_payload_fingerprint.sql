-- Fingerprint of the last provider /models response whose models the watcher processed and persisted.
-- A sweep that receives a byte-identical response skips re-extracting it, which was most of the
-- watcher's Worker CPU.

ALTER TABLE "public"."model_discovery_provider_status"
  ADD COLUMN "payload_fingerprint" text;
