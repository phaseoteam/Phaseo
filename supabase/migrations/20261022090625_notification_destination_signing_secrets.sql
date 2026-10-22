-- Signed notification webhooks.
--   * custom_webhook notification destinations gain a signing secret, encrypted with the
--     same AES-GCM key material as gateway_webhook_endpoints secrets. Deliveries send
--     x-phaseo-timestamp and x-phaseo-signature (hex HMAC-SHA256 of "<timestamp>.<body>"),
--     the scheme batch and video webhooks already use.
--   * Existing destinations keep a NULL secret and keep sending unsigned until an admin
--     generates one. No backfill: a secret nobody has seen would make receivers that
--     verify reject every delivery.
--   * Only custom_webhook destinations may hold a secret; ciphertext and IV are set together.
SET local check_function_bodies = off;

ALTER TABLE "public"."notification_destinations"
  ADD COLUMN "signing_secret_ciphertext" text,
  ADD COLUMN "signing_secret_iv" text,
  ADD COLUMN "signing_secret_key_version" text,
  ADD COLUMN "signing_secret_rotated_at" timestamp with time zone,
  ADD CONSTRAINT "notification_destinations_signing_secret_check" CHECK ((((signing_secret_ciphertext IS NULL) = (signing_secret_iv IS NULL)) AND ((signing_secret_ciphertext IS NULL) OR (type = 'custom_webhook'::text))));
