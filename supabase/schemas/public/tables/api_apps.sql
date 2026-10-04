CREATE TABLE "public"."api_apps" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "app_key"      text                     NOT NULL,
  "title"        text                     NOT NULL,
  "url"          text                     NOT NULL DEFAULT 'about:blank'::text,
  "is_active"    boolean                  NOT NULL DEFAULT true,
  "first_seen"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen"    timestamp with time zone NOT NULL DEFAULT now(),
  "meta"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "is_public"    boolean                  NOT NULL DEFAULT true,
  "image_url"    text,
  "category"     text,
  "docs_url"     text,
  CONSTRAINT "api_apps_category_check"
    CHECK
    (((category IS NULL) OR (category ~
    '^(chat|developer-tools|research|productivity|education|commerce|media|finance|other)(,(chat|developer-tools|research|productivity|education|commerce|media|finance|other)){0,2}$'::text))),
  CONSTRAINT "api_apps_workspace_appkey_unique" UNIQUE (workspace_id, app_key),
  CONSTRAINT "data_api_apps_pkey" PRIMARY KEY (id),
  CONSTRAINT "api_apps_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."api_apps"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."api_apps"
  ADD COLUMN "slug" text GENERATED ALWAYS AS
    (COALESCE(NULLIF(TRIM(BOTH '-'::text FROM regexp_replace(lower(COALESCE(title, ''::text)), '[^a-z0-9]+'::text, '-'::text, 'g'::text)), ''::text), 'app'::text)) STORED;

ALTER TABLE "public"."api_apps"
  ADD CONSTRAINT "api_apps_slug_format_check" CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));

CREATE INDEX api_apps_last_seen_idx ON public.api_apps USING btree (last_seen);

CREATE INDEX api_apps_public_slug_idx ON public.api_apps USING btree (slug, last_seen DESC)
  WHERE ((is_public = true) AND (is_active = true));

CREATE INDEX api_apps_workspace_id_idx ON public.api_apps USING btree (workspace_id);

CREATE UNIQUE INDEX api_apps_workspace_id_url_key ON public.api_apps USING btree (workspace_id, url);

CREATE INDEX idx_api_apps_public_active_category ON public.api_apps USING btree (category)
  WHERE ((is_public = true) AND (is_active = true) AND (category IS NOT NULL));

CREATE INDEX idx_api_apps_public_active_docs_url ON public.api_apps USING btree (docs_url)
  WHERE ((is_public = true) AND (is_active = true) AND (docs_url IS NOT NULL));

CREATE INDEX idx_api_apps_public_active ON public.api_apps USING btree (is_public, is_active);

CREATE POLICY "api_apps_delete_own_team" ON "public"."api_apps"
  FOR DELETE
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "api_apps_insert_own_team" ON "public"."api_apps"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "api_apps_select_own_team" ON "public"."api_apps"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "api_apps_update_own_team" ON "public"."api_apps"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."api_apps" TO "anon", "authenticated", "service_role";
