CREATE TABLE "public"."workspace_department_budgets" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  uuid                     NOT NULL,
  "department_id" uuid                     NOT NULL,
  "interval"      text                     NOT NULL,
  "limit_nanos"   bigint                   NOT NULL,
  "created_by"    uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_department_budgets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_department_budgets_department_id_interval_key" UNIQUE (department_id, "interval"),
  CONSTRAINT "workspace_department_budgets_department_id_workspace_id_fkey" FOREIGN KEY (department_id, workspace_id) REFERENCES public.workspace_departments(id, workspace_id)
    ON DELETE CASCADE,
  CONSTRAINT "workspace_department_budgets_interval_check" CHECK (("interval" = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "workspace_department_budgets_limit_nanos_check" CHECK ((limit_nanos > 0)),
  CONSTRAINT "workspace_department_budgets_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_department_budgets_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_department_budgets"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_department_budgets_created_by_idx ON public.workspace_department_budgets USING btree (created_by);

CREATE INDEX workspace_department_budgets_workspace_id_idx ON public.workspace_department_budgets USING btree (workspace_id, department_id);

CREATE TRIGGER workspace_department_budgets_lock_change
  BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_department_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_workspace_budget_change();

CREATE POLICY "workspace_department_budgets_select_member" ON "public"."workspace_department_budgets"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

REVOKE ALL ON TABLE "public"."workspace_department_budgets" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_department_budgets" TO "service_role";

COMMENT ON TABLE "public"."workspace_department_budgets" IS 'Department spend budgets. A department''s spend is what its linked API keys cost, plus the keys and OAuth requests of its members when the key is not linked to a department. Budgets block the department''s API-key requests once its spend reaches 100% (batch, realtime and OAuth requests excepted) and send alerts at about 80% and 100% (sweep_department_budget_alerts).';

REVOKE ALL ON TABLE "public"."workspace_department_budgets" FROM "authenticated";

GRANT SELECT ON TABLE "public"."workspace_department_budgets" TO "authenticated";

REVOKE ALL ON TABLE "public"."workspace_department_budgets" FROM "anon";
