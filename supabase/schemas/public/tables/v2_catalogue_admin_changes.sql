CREATE TABLE "public"."v2_catalogue_admin_changes" (
  "change_id"     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" uuid,
  "resource_type" text                     NOT NULL,
  "resource_id"   text                     NOT NULL,
  "action"        text                     NOT NULL,
  "before_state"  jsonb,
  "after_state"   jsonb,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_catalogue_admin_changes_action_check" CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'save'::text]))),
  CONSTRAINT "v2_catalogue_admin_changes_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "v2_catalogue_admin_changes_pkey" PRIMARY KEY (change_id),
  CONSTRAINT "v2_catalogue_admin_changes_resource_type_check"
    CHECK
    ((resource_type = ANY (ARRAY['pricing_sku'::text, 'organisations'::text, 'providers'::text, 'benchmarks'::text, 'subscription-plans'::text, 'models'::text, 'model_graph'::text,
    'provider_route'::text, 'model_notice'::text, 'model_aliases'::text])))
);

ALTER TABLE "public"."v2_catalogue_admin_changes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_catalogue_admin_changes_actor_idx ON public.v2_catalogue_admin_changes USING btree (actor_user_id, created_at DESC);

CREATE INDEX v2_catalogue_admin_changes_resource_idx ON public.v2_catalogue_admin_changes USING btree (resource_type, resource_id, created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."v2_catalogue_admin_changes"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_catalogue_admin_changes" TO "service_role";

COMMENT ON TABLE "public"."v2_catalogue_admin_changes" IS 'Immutable audit trail for database-authored catalogue mutations made by internal admins.';

REVOKE ALL ON TABLE "public"."v2_catalogue_admin_changes" FROM "anon", "authenticated";
