CREATE TABLE "public"."wallets" (
  "workspace_id"           uuid                     NOT NULL,
  "stripe_customer_id"     text                     NOT NULL,
  "balance_nanos"          bigint                   NOT NULL DEFAULT '0'::bigint,
  "auto_top_up_enabled"    boolean                  NOT NULL DEFAULT false,
  "low_balance_threshold"  bigint                   NOT NULL DEFAULT '0'::bigint,
  "auto_top_up_amount"     bigint                   NOT NULL DEFAULT '0'::bigint,
  "updated_at"             timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "auto_top_up_account_id" text,
  "reserved_nanos"         bigint                   NOT NULL DEFAULT 0,
  CONSTRAINT "wallets_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "wallets_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."wallets"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX wallets_stripe_customer_id_idx ON public.wallets USING btree (stripe_customer_id);

CREATE POLICY "wallets: insert by owner once" ON "public"."wallets"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.is_team_owner(workspace_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.wallets w
  WHERE (w.workspace_id = wallets.workspace_id))))));

CREATE POLICY "wallets: update settings if owner" ON "public"."wallets"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_team_owner(workspace_id))
  WITH CHECK (public.is_team_owner(workspace_id));

CREATE POLICY "wallets_select_own_team" ON "public"."wallets"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."wallets" TO "service_role";

COMMENT ON COLUMN "public"."wallets"."auto_top_up_account_id" IS 'Stripe account id that is to be charged when auto top up is enabled';

REVOKE ALL ON TABLE "public"."wallets" FROM "anon";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."wallets" TO "anon";

REVOKE ALL ON TABLE "public"."wallets" FROM "authenticated";

REVOKE ALL ("auto_top_up_amount") ON TABLE "public"."wallets" FROM "authenticated";

GRANT INSERT ("auto_top_up_amount"), UPDATE ("auto_top_up_amount") ON TABLE "public"."wallets" TO "authenticated";

REVOKE ALL ("auto_top_up_enabled") ON TABLE "public"."wallets" FROM "authenticated";

GRANT INSERT ("auto_top_up_enabled"), UPDATE ("auto_top_up_enabled") ON TABLE "public"."wallets" TO "authenticated";

REVOKE ALL ("low_balance_threshold") ON TABLE "public"."wallets" FROM "authenticated";

GRANT INSERT ("low_balance_threshold"), UPDATE ("low_balance_threshold") ON TABLE "public"."wallets" TO "authenticated";

REVOKE ALL ("updated_at") ON TABLE "public"."wallets" FROM "authenticated";

GRANT INSERT ("updated_at"), UPDATE ("updated_at") ON TABLE "public"."wallets" TO "authenticated";

REVOKE ALL ("workspace_id") ON TABLE "public"."wallets" FROM "authenticated";

GRANT INSERT ("workspace_id") ON TABLE "public"."wallets" TO "authenticated";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."wallets" TO "authenticated";
