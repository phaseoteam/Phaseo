CREATE VIEW "public"."oauth_apps_with_stats" WITH (security_invoker=true) AS  SELECT oam.id,
    oam.client_id,
    oam.workspace_id,
    oam.name,
    oam.description,
    oam.homepage_url,
    oam.logo_url,
    oam.privacy_policy_url,
    oam.terms_of_service_url,
    oam.created_by,
    oam.created_at,
    oam.updated_at,
    oam.status,
    oam.redirect_uris,
    count(DISTINCT oa.id) FILTER (WHERE (oa.revoked_at IS NULL)) AS active_authorizations,
    count(DISTINCT oa.id) AS total_authorizations,
    max(oa.last_used_at) AS last_used_at,
    count(DISTINCT gr.id) AS requests_last_30d
   FROM ((public.oauth_app_metadata oam
     LEFT JOIN public.oauth_authorizations oa ON ((oa.client_id = oam.client_id)))
     LEFT JOIN public.gateway_requests gr ON (((gr.oauth_client_id = oam.client_id) AND (gr.created_at > (now() - '30 days'::interval)))))
  WHERE (oam.status = 'active'::text)
  GROUP BY oam.id;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oauth_apps_with_stats" TO "anon", "authenticated", "service_role";

COMMENT ON VIEW "public"."oauth_apps_with_stats" IS 'OAuth apps with authorization and usage statistics. SECURITY INVOKER - respects RLS policies on underlying tables.';
