CREATE TABLE "public"."users" (
  "user_id"                 uuid                     NOT NULL,
  "display_name"            text,
  "default_workspace_id"    uuid,
  "obfuscate_info"          boolean                  NOT NULL DEFAULT false,
  "created_at"              timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "beta_opt_in"             boolean                  NOT NULL DEFAULT false,
  "beta_features"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "public_profile_enabled"  boolean                  NOT NULL DEFAULT false,
  "public_profile_slug"     text,
  "onboarding_state"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "onboarding_completed_at" timestamp with time zone,
  "declared_country_code"   text,
  "country_declared_at"     timestamp with time zone,
  "display_locale"          text                     NOT NULL DEFAULT 'system'::text,
  "display_date_style"      text                     NOT NULL DEFAULT 'medium'::text,
  "display_time_zone"       text                     NOT NULL DEFAULT 'system'::text,
  "display_hour_cycle"      text                     NOT NULL DEFAULT 'system'::text,
  "display_relative_time"   text                     NOT NULL DEFAULT 'contextual'::text,
  "display_number_notation" text                     NOT NULL DEFAULT 'standard'::text,
  "display_light_palette"   text                     NOT NULL DEFAULT 'phaseo'::text,
  "display_dark_palette"    text                     NOT NULL DEFAULT 'phaseo'::text,
  "display_light_accent"    text                     NOT NULL DEFAULT '#0069a8'::text,
  "display_dark_accent"     text                     NOT NULL DEFAULT '#0078b8'::text,
  "display_density"         text                     NOT NULL DEFAULT 'comfortable'::text,
  "display_code_language"   text                     NOT NULL DEFAULT 'typescript'::text,
  "display_landing_page"    text                     NOT NULL DEFAULT 'home'::text,
  CONSTRAINT "users_declared_country_code_check" CHECK (((declared_country_code IS NULL) OR (declared_country_code ~ '^[A-Z]{2}$'::text))),
  CONSTRAINT "users_display_code_language_check" CHECK ((display_code_language = ANY (ARRAY['typescript'::text, 'python'::text, 'curl'::text]))),
  CONSTRAINT "users_display_dark_accent_check" CHECK ((display_dark_accent ~ '^#[0-9A-Fa-f]{6}$'::text)),
  CONSTRAINT "users_display_dark_palette_check" CHECK ((display_dark_palette = ANY (ARRAY['phaseo'::text, 'slate'::text, 'midnight'::text]))),
  CONSTRAINT "users_display_date_style_check" CHECK ((display_date_style = ANY (ARRAY['short'::text, 'medium'::text, 'long'::text, 'iso'::text]))),
  CONSTRAINT "users_display_density_check" CHECK ((display_density = ANY (ARRAY['comfortable'::text, 'compact'::text]))),
  CONSTRAINT "users_display_hour_cycle_check" CHECK ((display_hour_cycle = ANY (ARRAY['system'::text, '12h'::text, '24h'::text]))),
  CONSTRAINT "users_display_landing_page_check" CHECK ((display_landing_page = ANY (ARRAY['home'::text, 'models'::text, 'chat'::text, 'monitor'::text]))),
  CONSTRAINT "users_display_light_accent_check" CHECK ((display_light_accent ~ '^#[0-9A-Fa-f]{6}$'::text)),
  CONSTRAINT "users_display_light_palette_check" CHECK ((display_light_palette = ANY (ARRAY['phaseo'::text, 'paper'::text, 'warm'::text]))),
  CONSTRAINT "users_display_locale_check" CHECK ((display_locale = ANY (ARRAY['system'::text, 'en-GB'::text, 'en-US'::text]))),
  CONSTRAINT "users_display_number_notation_check" CHECK ((display_number_notation = ANY (ARRAY['standard'::text, 'compact'::text]))),
  CONSTRAINT "users_display_relative_time_check" CHECK ((display_relative_time = ANY (ARRAY['contextual'::text, 'relative'::text, 'absolute'::text]))),
  CONSTRAINT "users_display_time_zone_check"
    CHECK
    ((((char_length(display_time_zone) >= 1) AND (char_length(display_time_zone) <= 100)) AND ((display_time_zone = ANY (ARRAY['system'::text, 'UTC'::text])) OR (display_time_zone
    ~ '^[A-Za-z0-9._+-]+(/[A-Za-z0-9._+-]+)+$'::text)))),
  CONSTRAINT "users_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."users"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."users"
  ADD COLUMN "role" public.user_role NOT NULL DEFAULT 'user'::public.user_role;

CREATE INDEX users_declared_country_code_idx ON public.users USING btree (declared_country_code)
  WHERE (declared_country_code IS NOT NULL);

CREATE INDEX users_default_workspace_id_idx ON public.users USING btree (default_workspace_id)
  WHERE (default_workspace_id IS NOT NULL);

CREATE INDEX users_onboarding_completed_at_idx ON public.users USING btree (onboarding_completed_at)
  WHERE (onboarding_completed_at IS NOT NULL);

CREATE UNIQUE INDEX users_public_profile_slug_key ON public.users USING btree (public_profile_slug)
  WHERE (public_profile_slug IS NOT NULL);

CREATE TRIGGER handle_updated_at_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  WHEN ((old.* IS DISTINCT FROM new.*))
  EXECUTE FUNCTION extensions.moddatetime('updated_at');

CREATE TRIGGER protect_users_global_role
  BEFORE UPDATE OF ROLE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_users_global_role();

CREATE POLICY "users: delete self" ON "public"."users"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "users: insert self" ON "public"."users"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "users_select_authorized_context" ON "public"."users"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (public.workspace_members my_membership
     JOIN public.workspace_members other_membership ON (((other_membership.workspace_id = my_membership.workspace_id) AND (other_membership.user_id = users.user_id))))
  WHERE (my_membership.user_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM (public.workspace_members my_membership
     JOIN public.workspace_join_requests request ON (((request.workspace_id = my_membership.workspace_id) AND (request.requester_user_id = users.user_id))))
  WHERE (my_membership.user_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM (public.workspace_members my_membership
     JOIN public.workspace_join_requests request ON (((request.workspace_id = my_membership.workspace_id) AND (request.decided_by = users.user_id))))
  WHERE (my_membership.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "users_update_self" ON "public"."users"
  FOR UPDATE
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "service_role";

COMMENT ON COLUMN "public"."users"."country_declared_at" IS 'Time at which the user most recently confirmed their declared country.';

COMMENT ON COLUMN "public"."users"."declared_country_code" IS 'ISO 3166-1 alpha-2 country explicitly selected by the user; separate from request-origin geography.';

COMMENT ON COLUMN "public"."users"."display_code_language" IS 'Preferred language for code samples.';

COMMENT ON COLUMN "public"."users"."display_dark_accent" IS 'Preferred hexadecimal accent colour for dark mode.';

COMMENT ON COLUMN "public"."users"."display_dark_palette" IS 'Preferred neutral surface palette for dark mode.';

COMMENT ON COLUMN "public"."users"."display_date_style" IS 'Preferred date presentation style.';

COMMENT ON COLUMN "public"."users"."display_density" IS 'Preferred interface spacing density.';

COMMENT ON COLUMN "public"."users"."display_hour_cycle" IS 'Preferred 12-hour, 24-hour, or system clock.';

COMMENT ON COLUMN "public"."users"."display_landing_page" IS 'Preferred destination after an ordinary sign-in.';

COMMENT ON COLUMN "public"."users"."display_light_accent" IS 'Preferred hexadecimal accent colour for light mode.';

COMMENT ON COLUMN "public"."users"."display_light_palette" IS 'Preferred neutral surface palette for light mode.';

COMMENT ON COLUMN "public"."users"."display_locale" IS 'Preferred locale for display formatting; system follows the browser.';

COMMENT ON COLUMN "public"."users"."display_number_notation" IS 'Preferred standard or compact number notation.';

COMMENT ON COLUMN "public"."users"."display_relative_time" IS 'Preferred relative versus absolute timestamp presentation.';

COMMENT ON COLUMN "public"."users"."display_time_zone" IS 'Preferred IANA time zone; system follows the browser.';

REVOKE ALL ON TABLE "public"."users" FROM "anon";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."users" TO "anon";

REVOKE ALL ON TABLE "public"."users" FROM "authenticated";

REVOKE ALL ("beta_features") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("beta_features"), UPDATE ("beta_features") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("beta_opt_in") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("beta_opt_in"), UPDATE ("beta_opt_in") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("country_declared_at") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("country_declared_at"), UPDATE ("country_declared_at") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("created_at") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("created_at") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("declared_country_code") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("declared_country_code"), UPDATE ("declared_country_code") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("default_workspace_id") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("default_workspace_id"), UPDATE ("default_workspace_id") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("display_name") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("display_name"), UPDATE ("display_name") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("obfuscate_info") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("obfuscate_info"), UPDATE ("obfuscate_info") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("onboarding_completed_at") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("onboarding_completed_at"), UPDATE ("onboarding_completed_at") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("onboarding_state") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("onboarding_state"), UPDATE ("onboarding_state") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("public_profile_enabled") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("public_profile_enabled"), UPDATE ("public_profile_enabled") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("public_profile_slug") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("public_profile_slug"), UPDATE ("public_profile_slug") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("updated_at") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("updated_at"), UPDATE ("updated_at") ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ("user_id") ON TABLE "public"."users" FROM "authenticated";

GRANT INSERT ("user_id") ON TABLE "public"."users" TO "authenticated";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."users" TO "authenticated";
