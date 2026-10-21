CREATE TABLE "public"."workspace_spend_blocks" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "rule_id"           uuid,
  "scope_type"        text                     NOT NULL,
  "scope_id"          text,
  "block_free_models" boolean                  NOT NULL DEFAULT false,
  "period_start"      timestamp with time zone NOT NULL,
  "resets_at"         timestamp with time zone,
  "spend_nanos"       bigint                   NOT NULL,
  "limit_nanos"       bigint                   NOT NULL,
  "started_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "lifted_at"         timestamp with time zone,
  "lifted_by"         uuid,
  "lift_reason"       text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_blocks_amounts_check" CHECK (((spend_nanos >= 0) AND (limit_nanos > 0))),
  CONSTRAINT "workspace_spend_blocks_lift_check" CHECK ((((lifted_at IS NULL) = (lift_reason IS NULL)) AND ((lifted_by IS NULL) OR (lift_reason = 'manual'::text)) AND ((lifted_at IS NULL) OR (lifted_at >= started_at)))),
  CONSTRAINT "workspace_spend_blocks_lift_reason_check" CHECK (((lift_reason IS NULL) OR (lift_reason = ANY (ARRAY['manual'::text, 'period_reset'::text, 'below_limit'::text, 'rule_changed'::text, 'rule_disabled'::text, 'rule_deleted'::text])))),
  CONSTRAINT "workspace_spend_blocks_lifted_by_fkey" FOREIGN KEY (lifted_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_spend_blocks_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_spend_blocks_resets_at_check" CHECK (((resets_at IS NULL) OR (resets_at > period_start))),
  CONSTRAINT "workspace_spend_blocks_rule_fkey" FOREIGN KEY (rule_id, workspace_id) REFERENCES public.workspace_spend_rules(id, workspace_id) ON DELETE SET NULL (rule_id),
  CONSTRAINT "workspace_spend_blocks_scope_check" CHECK (((scope_type = ANY (ARRAY['workspace'::text, 'key'::text, 'member'::text, 'department'::text, 'model'::text, 'provider'::text])) AND ((scope_type = 'workspace'::text) = (scope_id IS NULL)))),
  CONSTRAINT "workspace_spend_blocks_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_blocks"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX workspace_spend_blocks_active_rule_uidx ON public.workspace_spend_blocks USING btree (rule_id)
  WHERE ((lifted_at IS NULL) AND (rule_id IS NOT NULL));

CREATE INDEX workspace_spend_blocks_lifted_by_idx ON public.workspace_spend_blocks USING btree (lifted_by)
  WHERE (lifted_by IS NOT NULL);

CREATE INDEX workspace_spend_blocks_rule_period_idx ON public.workspace_spend_blocks USING btree (rule_id, period_start);

CREATE INDEX workspace_spend_blocks_workspace_active_idx ON public.workspace_spend_blocks USING btree (workspace_id)
  WHERE (lifted_at IS NULL);

CREATE INDEX workspace_spend_blocks_workspace_started_idx ON public.workspace_spend_blocks USING btree (workspace_id, started_at DESC);

CREATE TRIGGER workspace_spend_blocks_set_updated_at
  BEFORE UPDATE ON public.workspace_spend_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "workspace_spend_blocks_select_member" ON "public"."workspace_spend_blocks"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

COMMENT ON TABLE "public"."workspace_spend_blocks" IS 'Blocks started by spend rules, active (lifted_at null) and lifted. Scope and block_free_models are copied from the rule when the block starts, so the request path can match it without the rule. At most one active block per rule. A block lifted manually is not restarted in the same period (same rule_id and period_start).';

COMMENT ON COLUMN "public"."workspace_spend_blocks"."resets_at" IS 'When the block''s period ends and it lifts by itself (the 429 Retry-After). Null for rolling rules, which lift once spend in the window falls below the limit.';

COMMENT ON COLUMN "public"."workspace_spend_blocks"."limit_nanos" IS 'The spend at which the rule blocks: block_at_amount_nanos, or block_at_percent of the base when the block started.';

COMMENT ON COLUMN "public"."workspace_spend_blocks"."lift_reason" IS 'manual (lifted_by set), period_reset, below_limit (rolling window or a raised base), rule_changed, rule_disabled or rule_deleted.';

REVOKE ALL ON TABLE "public"."workspace_spend_blocks" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_blocks" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_blocks" FROM "anon", "authenticated";

GRANT SELECT ON TABLE "public"."workspace_spend_blocks" TO "authenticated";
