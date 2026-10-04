CREATE TABLE "public"."workspace_budgets" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "interval"     text                     NOT NULL,
  "limit_nanos"  bigint                   NOT NULL,
  "created_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_budgets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_budgets_interval_check" CHECK (("interval" = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'lifetime'::text]))),
  CONSTRAINT "workspace_budgets_limit_nanos_check" CHECK ((limit_nanos > 0)),
  CONSTRAINT "workspace_budgets_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_budgets_workspace_id_interval_key" UNIQUE (workspace_id, "interval"),
  CONSTRAINT "workspace_budgets_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_budgets"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_budgets_created_by_idx ON public.workspace_budgets USING btree (created_by);

CREATE INDEX workspace_budgets_workspace_id_idx ON public.workspace_budgets USING btree (workspace_id);

CREATE TRIGGER workspace_budgets_lock_change
  BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_workspace_budget_change();

CREATE POLICY "workspace_budgets_select_member" ON "public"."workspace_budgets"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_budgets" TO "service_role";

COMMENT ON TABLE "public"."workspace_budgets" IS 'Workspace-wide cost ceilings enforced across synchronous and reserved gateway workloads.';

REVOKE ALL ON TABLE "public"."workspace_budgets" FROM "authenticated";

GRANT SELECT ON TABLE "public"."workspace_budgets" TO "authenticated";

REVOKE ALL ON TABLE "public"."workspace_budgets" FROM "anon";
