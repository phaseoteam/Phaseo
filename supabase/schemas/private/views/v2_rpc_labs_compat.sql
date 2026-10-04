CREATE VIEW "private"."v2_rpc_labs_compat" WITH (security_invoker=true) AS  SELECT lab_slug,
    name,
    country_code,
    description,
    status,
    routable,
    metadata,
    created_at,
    updated_at,
    lab_slug AS organisation_id,
    (metadata ->> 'colour'::text) AS colour,
    (metadata ->> 'link'::text) AS link
   FROM public.v2_labs lab;

GRANT SELECT ON TABLE "private"."v2_rpc_labs_compat" TO "service_role";
