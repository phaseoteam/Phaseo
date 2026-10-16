CREATE TABLE "public"."v2_model_successor_routing" (
  "model_slug"              text                     NOT NULL,
  "unserved_since"          timestamp with time zone,
  "auto_route_enabled"      boolean                  NOT NULL DEFAULT false,
  "approved_successor_slug" text,
  "approved_by"             uuid,
  "approved_at"             timestamp with time zone,
  "compatibility"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "notes"                   text,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_model_successor_routing_approval_check"
    CHECK (((NOT auto_route_enabled) OR ((approved_successor_slug IS NOT NULL) AND (approved_at IS NOT NULL)))),
  CONSTRAINT "v2_model_successor_routing_not_self_check" CHECK (((approved_successor_slug IS NULL) OR (approved_successor_slug <> model_slug))),
  CONSTRAINT "v2_model_successor_routing_pkey" PRIMARY KEY (model_slug),
  CONSTRAINT "v2_model_successor_routing_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "v2_model_successor_routing_approved_successor_slug_fkey" FOREIGN KEY (approved_successor_slug) REFERENCES public.v2_models(model_slug) ON DELETE SET NULL,
  CONSTRAINT "v2_model_successor_routing_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_model_successor_routing"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_model_successor_routing_approved_successor_idx ON public.v2_model_successor_routing USING btree (approved_successor_slug)
  WHERE (approved_successor_slug IS NOT NULL);

CREATE INDEX v2_model_successor_routing_unserved_idx ON public.v2_model_successor_routing USING btree (unserved_since)
  WHERE (unserved_since IS NOT NULL);

CREATE POLICY "service_role_full_access" ON "public"."v2_model_successor_routing"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE "public"."v2_model_successor_routing" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."v2_model_successor_routing" TO "service_role";

COMMENT ON TABLE "public"."v2_model_successor_routing" IS 'Admin approval to route requests for a model to its replacement_model_slug once no provider serves it, plus the time it stopped being served. Approval is tied to approved_successor_slug and lapses if replacement_model_slug changes.';

REVOKE ALL ON TABLE "public"."v2_model_successor_routing" FROM "anon", "authenticated";
