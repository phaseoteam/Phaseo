SET LOCAL lock_timeout = '10s';

-- When readers stop treating a gateway_requests row's JSON billing_status as pending
-- reconciliation. Rows the new gateway writes as pending always set expected_cost_nanos; older
-- Workers write the JSON flag only, and they keep serving until the deploy after these migrations
-- completes, which a failed later step can delay indefinitely. So the marker starts NULL: no
-- cutoff, the flag is always read. A later migration sets it once the deploy is verified and the
-- older Workers are gone; rows written before it are pending by the flag too, rows written from it
-- only by the column.
-- A new table and a function: no existing table is locked.
CREATE TABLE IF NOT EXISTS "private"."billing_cutoffs" (
  "singleton"          boolean                  NOT NULL DEFAULT true,
  "pending_json_cutoff" timestamp with time zone,
  CONSTRAINT "billing_cutoffs_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "billing_cutoffs_singleton_check" CHECK (singleton)
);

-- A replay keeps a marker that was set since.
INSERT INTO "private"."billing_cutoffs" ("singleton", "pending_json_cutoff")
VALUES (true, NULL)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION private.pending_json_cutoff ()
  RETURNS timestamp with time zone
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Rows created before this are pending reconciliation by their JSON billing_status as well as
-- by expected_cost_nanos; see private.billing_cutoffs. infinity (the flag is always read) while the
-- marker is NULL or missing.
  select coalesce((select pending_json_cutoff from private.billing_cutoffs where singleton), 'infinity'::timestamptz);
$function$;

GRANT EXECUTE ON FUNCTION "private"."pending_json_cutoff"() TO "service_role";

REVOKE ALL ON FUNCTION "private"."pending_json_cutoff"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."pending_json_cutoff"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."pending_json_cutoff"() TO "postgres";

-- Only the service role (the gateway, and the refund claim and budget readers it calls) reads it.
REVOKE ALL ON FUNCTION "private"."pending_json_cutoff"() FROM "anon", "authenticated";
