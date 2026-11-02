CREATE TABLE "public"."work_customers" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "name"         text                     NOT NULL,
  "domain"       text,
  "external_ref" text,
  "tier"         text,
  "notes"        text                     NOT NULL DEFAULT ''::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_customers_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200))),
  CONSTRAINT "work_customers_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_customers_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_customers"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX work_customers_workspace_domain_key ON public.work_customers USING btree (workspace_id, lower(domain))
  WHERE (domain IS NOT NULL);

CREATE INDEX work_customers_workspace_name_idx ON public.work_customers USING btree (workspace_id, name);

CREATE POLICY "deny_direct_client_access" ON "public"."work_customers"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_customers" IS 'A workspace''s own customers (companies or people), so requests can be attributed and demand counted. Private: never copied into GitHub.';

REVOKE ALL ON TABLE "public"."work_customers" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_customers" TO "service_role";

REVOKE ALL ON TABLE "public"."work_customers" FROM "anon", "authenticated";
