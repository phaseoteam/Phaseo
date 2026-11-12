CREATE TABLE "public"."updates" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "type"       text                     NOT NULL,
  "who"        text                     NOT NULL,
  "title"      text                     NOT NULL,
  "link"       text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT "updates_link_key" UNIQUE (link),
  CONSTRAINT "updates_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."updates"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON "public"."updates"
  FOR SELECT
  TO PUBLIC
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."updates" TO "anon", "authenticated", "service_role";
