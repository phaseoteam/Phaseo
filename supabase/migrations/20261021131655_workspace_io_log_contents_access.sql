ALTER TABLE "public"."workspace_settings"
  ADD COLUMN "io_logging_contents_access" text NOT NULL DEFAULT 'members'::text;

ALTER TABLE "public"."workspace_settings"
  ADD CONSTRAINT "workspace_settings_io_logging_contents_access_check" CHECK ((io_logging_contents_access = ANY (ARRAY['members'::text, 'admins'::text])));

COMMENT ON COLUMN "public"."workspace_settings"."io_logging_contents_access" IS 'Who may read stored request and response payloads: members (any workspace member) or admins (owners and admins only).';
