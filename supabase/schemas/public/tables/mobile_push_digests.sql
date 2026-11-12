CREATE TABLE "public"."mobile_push_digests" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "iso_week"     text                     NOT NULL,
  "time_zone"    text                     NOT NULL,
  "week_start"   timestamp with time zone NOT NULL,
  "week_cutoff"  timestamp with time zone NOT NULL,
  "status"       text                     NOT NULL,
  "workspace_id" uuid,
  "title"        text,
  "body"         text,
  "href"         text,
  "summary"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mobile_push_digests_iso_week_check" CHECK ((iso_week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'::text)),
  CONSTRAINT "mobile_push_digests_message_check"
    CHECK (((status = 'skipped'::text) OR ((title IS NOT NULL) AND (body IS NOT NULL) AND (href IS NOT NULL)))),
  CONSTRAINT "mobile_push_digests_pkey" PRIMARY KEY (id),
  CONSTRAINT "mobile_push_digests_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'skipped'::text]))),
  CONSTRAINT "mobile_push_digests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_digests_user_id_iso_week_key" UNIQUE (user_id, iso_week),
  CONSTRAINT "mobile_push_digests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL
);

ALTER TABLE "public"."mobile_push_digests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mobile_push_digests_workspace_idx ON public.mobile_push_digests USING btree (workspace_id)
  WHERE (workspace_id IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."mobile_push_digests"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."mobile_push_digests"."iso_week" IS 'ISO week the digest covers (YYYY-Www) in time_zone. One digest per user and week.';

COMMENT ON COLUMN "public"."mobile_push_digests"."summary" IS 'The figures the text was written from: spend, requests and tokens summed over the user''s owner and admin workspaces, the previous week''s spend over the same span, the active workspaces, the top model and the matching releases.';

COMMENT ON COLUMN "public"."mobile_push_digests"."week_cutoff" IS '18:00 on the Sunday in time_zone, when the digest became due. Figures cover week_start up to this moment.';

COMMENT ON COLUMN "public"."mobile_push_digests"."workspace_id" IS 'The workspace the push leads with and opens: the user''s most active one that week, or the one they used last when none was active.';

COMMENT ON TABLE "public"."mobile_push_digests" IS 'Weekly "Your Phaseo week" digests, one per user and ISO week, written when one of the user''s devices reaches 18:00 on Sunday. Queued digests are sent through mobile_push_deliveries (digest_id); skipped ones had nothing to report. Written only by build_mobile_push_digests.';

REVOKE ALL ON TABLE "public"."mobile_push_digests" FROM "service_role";

GRANT SELECT ON TABLE "public"."mobile_push_digests" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_push_digests" FROM "anon", "authenticated";
