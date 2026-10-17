CREATE TABLE "public"."mobile_notification_rules" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"               uuid                     NOT NULL,
  "name"                  text,
  "enabled"               boolean                  NOT NULL DEFAULT true,
  "action"                text                     NOT NULL DEFAULT 'notify'::text,
  "event_kinds"           text[]                   NOT NULL,
  "lab_mode"              text                     NOT NULL DEFAULT 'all'::text,
  "lab_slugs"             text[]                   NOT NULL DEFAULT '{}'::text[],
  "provider_mode"         text                     NOT NULL DEFAULT 'all'::text,
  "provider_slugs"        text[]                   NOT NULL DEFAULT '{}'::text[],
  "model_slugs"           text[]                   NOT NULL DEFAULT '{}'::text[],
  "input_modalities"      text[]                   NOT NULL DEFAULT '{}'::text[],
  "output_modalities"     text[]                   NOT NULL DEFAULT '{}'::text[],
  "only_on_phaseo"        boolean                  NOT NULL DEFAULT false,
  "include_free_variants" boolean                  NOT NULL DEFAULT false,
  "position"              integer                  NOT NULL DEFAULT 0,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mobile_notification_rules_action_check" CHECK ((action = ANY (ARRAY['notify'::text, 'mute'::text]))),
  CONSTRAINT "mobile_notification_rules_event_kinds_check"
    CHECK
    (((cardinality(event_kinds) > 0) AND (event_kinds <@ ARRAY['model_released'::text, 'gateway_available'::text, 'price_changed'::text, 'deprecation_announced'::text,
    'provider_added'::text]))),
  CONSTRAINT "mobile_notification_rules_lab_mode_check" CHECK ((lab_mode = ANY (ARRAY['all'::text, 'only'::text, 'except'::text]))),
  CONSTRAINT "mobile_notification_rules_lists_check"
    CHECK
    (((cardinality(lab_slugs) <= 200) AND (cardinality(provider_slugs) <= 200) AND (cardinality(model_slugs) <= 200) AND (cardinality(input_modalities) <= 20) AND
    (cardinality(output_modalities) <= 20))),
  CONSTRAINT "mobile_notification_rules_name_check" CHECK (((name IS NULL) OR ((char_length(name) >= 1) AND (char_length(name) <= 80)))),
  CONSTRAINT "mobile_notification_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "mobile_notification_rules_position_check" CHECK ((("position" >= 0) AND ("position" <= 10000))),
  CONSTRAINT "mobile_notification_rules_provider_mode_check" CHECK ((provider_mode = ANY (ARRAY['all'::text, 'only'::text, 'except'::text]))),
  CONSTRAINT "mobile_notification_rules_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mobile_notification_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mobile_notification_rules_user_idx ON public.mobile_notification_rules USING btree (user_id, "position", created_at);

CREATE POLICY "deny_direct_client_access" ON "public"."mobile_notification_rules"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."mobile_notification_rules" IS 'User-written mobile push rules. A device is notified when one enabled notify rule matches an event and no enabled mute rule does. Lists left empty match anything; at most 50 rules per user, enforced by the API.';

REVOKE ALL ON TABLE "public"."mobile_notification_rules" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mobile_notification_rules" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_notification_rules" FROM "anon", "authenticated";
