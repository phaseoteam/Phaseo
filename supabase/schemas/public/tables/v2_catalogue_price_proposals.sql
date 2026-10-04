CREATE TABLE "public"."v2_catalogue_price_proposals" (
  "proposal_id"       text                     NOT NULL,
  "provider_model_id" text                     NOT NULL,
  "source_url"        text                     NOT NULL,
  "sku"               jsonb                    NOT NULL,
  "expected_sku"      jsonb,
  "status"            text                     NOT NULL DEFAULT 'pending'::text,
  "reviewed_by"       uuid,
  "reviewed_at"       timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_catalogue_price_proposals_pkey" PRIMARY KEY (proposal_id),
  CONSTRAINT "v2_catalogue_price_proposals_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'dismissed'::text, 'superseded'::text]))),
  CONSTRAINT "v2_catalogue_price_proposals_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id)
);

ALTER TABLE "public"."v2_catalogue_price_proposals"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_catalogue_price_proposals_pending_family ON public.v2_catalogue_price_proposals USING btree (provider_model_id, ((sku ->> 'sku_code'::text)))
  WHERE (status = 'pending'::text);

REVOKE ALL ON TABLE "public"."v2_catalogue_price_proposals" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."v2_catalogue_price_proposals" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_catalogue_price_proposals" FROM "anon", "authenticated";
