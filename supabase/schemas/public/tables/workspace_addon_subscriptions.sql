CREATE TABLE "public"."workspace_addon_subscriptions" (
  "id"                          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"                uuid                     NOT NULL,
  "addon_key"                   text                     NOT NULL,
  "provider"                    text                     NOT NULL DEFAULT 'stripe'::text,
  "provider_customer_id"        text,
  "provider_subscription_id"    text,
  "provider_price_id"           text,
  "quote_id"                    uuid,
  "plan_key"                    text,
  "pricing_version"             text,
  "included_members"            integer,
  "fee_policy"                  text,
  "included_card_top_up_nanos"  bigint                   NOT NULL DEFAULT 0,
  "status"                      text                     NOT NULL DEFAULT 'incomplete'::text,
  "current_period_start"        timestamp with time zone,
  "current_period_end"          timestamp with time zone,
  "cancel_at_period_end"        boolean                  NOT NULL DEFAULT false,
  "grace_until"                 timestamp with time zone,
  "last_provider_event_created" bigint                   NOT NULL DEFAULT 0,
  "metadata"                    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_addon_subscriptions_addon_key_check" CHECK ((addon_key ~ '^[a-z][a-z0-9_]{1,63}$'::text)),
  CONSTRAINT "workspace_addon_subscriptions_fee_policy_check" CHECK (((fee_policy IS NULL) OR (fee_policy = ANY (ARRAY['standard_5_percent'::text, 'included_allowance'::text])))),
  CONSTRAINT "workspace_addon_subscriptions_included_card_top_up_nanos_check" CHECK ((included_card_top_up_nanos >= 0)),
  CONSTRAINT "workspace_addon_subscriptions_included_members_check" CHECK (((included_members IS NULL) OR (included_members > 0))),
  CONSTRAINT "workspace_addon_subscriptions_metadata_check" CHECK ((jsonb_typeof(metadata) = 'object'::text)),
  CONSTRAINT "workspace_addon_subscriptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_addon_subscriptions_provider_check" CHECK ((provider = ANY (ARRAY['stripe'::text, 'manual'::text]))),
  CONSTRAINT "workspace_addon_subscriptions_provider_provider_subscriptio_key" UNIQUE (PROVIDER, provider_subscription_id),
  CONSTRAINT "workspace_addon_subscriptions_status_check"
    CHECK
    ((status = ANY (ARRAY['incomplete'::text, 'incomplete_expired'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'paused'::text, 'canceled'::text, 'unpaid'::text]))),
  CONSTRAINT "workspace_addon_subscriptions_workspace_id_addon_key_key" UNIQUE (workspace_id, addon_key),
  CONSTRAINT "workspace_addon_subscriptions_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES public.workspace_enterprise_quotes(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_addon_subscriptions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_addon_subscriptions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_addon_subscriptions_quote_id_idx ON public.workspace_addon_subscriptions USING btree (quote_id);

CREATE INDEX workspace_addon_subscriptions_workspace_status_idx ON public.workspace_addon_subscriptions USING btree (workspace_id, status);

CREATE TRIGGER workspace_enterprise_member_overage_seed
  AFTER INSERT OR UPDATE OF status, included_members, current_period_start ON public.workspace_addon_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION private.seed_workspace_enterprise_member_overages();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_addon_subscriptions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_addon_subscriptions" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_addon_subscriptions" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_addon_subscriptions" FROM "anon", "authenticated";
