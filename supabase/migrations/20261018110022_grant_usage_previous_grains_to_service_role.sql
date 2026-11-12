-- The usage overview and label RPCs (get_private_usage_overview and
-- get_private_usage_label_facets) run with the caller's privileges and, since
-- 20261015134806, read private.v2_analytics_previous_grains to find hours the
-- outbox processor has yet to rebuild. web-api calls them as service_role, which
-- had no SELECT on that table, so every usage overview failed with "permission
-- denied for table v2_analytics_previous_grains" (web-api answered 503
-- usage_unavailable and the dashboard showed "Usage data could not be loaded").
GRANT SELECT ON TABLE "private"."v2_analytics_previous_grains" TO "service_role";
