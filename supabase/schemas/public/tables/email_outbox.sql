CREATE TABLE "public"."email_outbox" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "kind"         text                     NOT NULL,
  "template"     text                     NOT NULL DEFAULT 'generic'::text,
  "to_email"     text                     NOT NULL,
  "subject"      text,
  "workspace_id" uuid,
  "user_id"      uuid,
  "payload"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "attempts"     integer                  NOT NULL DEFAULT 0,
  "last_error"   text,
  "sent_at"      timestamp with time zone,
  "dedupe_key"   text,
  CONSTRAINT "email_outbox_pkey" PRIMARY KEY (id),
  CONSTRAINT "email_outbox_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "email_outbox_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL
);

ALTER TABLE "public"."email_outbox"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX email_outbox_dedupe_key_unique ON public.email_outbox USING btree (dedupe_key);

CREATE INDEX email_outbox_pending_idx ON public.email_outbox USING btree (sent_at, created_at);

CREATE INDEX email_outbox_user_id_idx ON public.email_outbox USING btree (user_id);

CREATE INDEX email_outbox_workspace_id_idx ON public.email_outbox USING btree (workspace_id);

CREATE POLICY "email_outbox_insert_service" ON "public"."email_outbox"
  FOR INSERT
  TO "service_role"
  WITH CHECK (true);

CREATE POLICY "email_outbox_select_service" ON "public"."email_outbox"
  FOR SELECT
  TO "service_role"
  USING (true);

CREATE POLICY "email_outbox_update_service" ON "public"."email_outbox"
  FOR UPDATE
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."email_outbox" TO "service_role";

COMMENT ON COLUMN "public"."email_outbox"."dedupe_key" IS 'Stable event identity used to suppress duplicate transactional email delivery.';

REVOKE ALL ON TABLE "public"."email_outbox" FROM "anon", "authenticated";
