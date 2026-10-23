SET local check_function_bodies = off;

-- Public catalogue revision for website cache purges. Unlike the routing
-- revision, it ignores rewrites that change nothing but updated_at and bumps
-- once per transaction, so sync jobs that rewrite identical rows do not
-- empty the Cloudflare and Vercel caches.

CREATE TABLE "private"."public_catalogue_revision" (
  "singleton"       boolean                  NOT NULL DEFAULT true,
  "revision"        bigint                   NOT NULL DEFAULT 0,
  "changed_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "changed_xid"     xid8,
  "pending_since"   timestamp with time zone,
  "purged_revision" bigint                   NOT NULL DEFAULT 0,
  "purged_at"       timestamp with time zone,
  CONSTRAINT "public_catalogue_revision_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "public_catalogue_revision_singleton_check" CHECK (singleton)
);

COMMENT ON TABLE "private"."public_catalogue_revision" IS 'Bumped once per transaction that changes public catalogue content. The web-api cron purges the website caches when revision passes purged_revision.';

INSERT INTO private.public_catalogue_revision (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION private.bump_public_catalogue_revision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Rewrites that only touch updated_at change nothing a visitor can see, so
  -- they must not empty the website caches.
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return null;
  end if;
  -- One bump per transaction: after the first changed row, the singleton
  -- already carries this transaction's id and the update matches nothing.
  update private.public_catalogue_revision
  set revision = revision + 1, changed_at = clock_timestamp(), changed_xid = pg_current_xact_id(),
    pending_since = coalesce(pending_since, clock_timestamp())
  where singleton and changed_xid is distinct from pg_current_xact_id();
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."bump_public_catalogue_revision"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."bump_public_catalogue_revision"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."bump_public_catalogue_revision"() TO "postgres";

CREATE OR REPLACE FUNCTION public.get_public_catalogue_purge_state()
  RETURNS TABLE (
    revision        bigint,
    changed_at      timestamp with time zone,
    purged_revision bigint,
    pending_since   timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select r.revision, r.changed_at, r.purged_revision, r.pending_since
  from private.public_catalogue_revision r
  where r.singleton;
$function$;

COMMENT ON FUNCTION "public"."get_public_catalogue_purge_state"() IS 'Public catalogue revision and the last revision the web-api cron purged from the website caches.';

GRANT EXECUTE ON FUNCTION "public"."get_public_catalogue_purge_state"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_catalogue_purge_state"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_catalogue_purge_state"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_catalogue_purge_state"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.mark_public_catalogue_purged(
  p_revision bigint
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Never move backwards: a slow cron run must not undo a newer purge.
  update private.public_catalogue_revision
  set purged_revision = greatest(purged_revision, p_revision), purged_at = now(),
    -- Writes committed after the cron read the state keep their start time.
    pending_since = case when revision > greatest(purged_revision, p_revision) then pending_since end
  where singleton;
$function$;

COMMENT ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) IS 'Records that the website caches were purged up to a public catalogue revision.';

GRANT EXECUTE ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) FROM PUBLIC, "anon", "authenticated";

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_benchmark_results
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_benchmarks
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_lab_links
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_labs
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_aliases
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_details
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_families
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_links
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_page_notices
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_provider_routes
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_models
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_pricing_sku_meters
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_pricing_skus
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_provider_regions
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_providers
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_route_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_route_parameter_support
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_route_variants
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_service_tiers
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_subscription_plan_models
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();

CREATE TRIGGER public_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_public_catalogue_revision();
