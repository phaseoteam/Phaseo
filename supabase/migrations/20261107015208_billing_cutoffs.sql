SET LOCAL lock_timeout = '10s';

-- When readers stop treating a gateway_requests row's JSON billing_status as pending
-- reconciliation. Rows the new gateway writes as pending always set expected_cost_nanos; older
-- Workers, which still serve requests for a few minutes after the migrations (CI deploys the
-- Workers right after supabase db push), write the JSON flag only. The marker is set when this
-- migration runs, two hours ahead, so it follows the rollout instead of a calendar date: rows
-- written before it are also pending by the flag, rows written from it only by the column.
-- A new table and a function: no existing table is locked.
CREATE TABLE IF NOT EXISTS "private"."billing_cutoffs" (
  "singleton"          boolean                  NOT NULL DEFAULT true,
  "pending_json_cutoff" timestamp with time zone NOT NULL,
  CONSTRAINT "billing_cutoffs_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "billing_cutoffs_singleton_check" CHECK (singleton)
);

-- Set once: a replay keeps the first deploy's marker.
INSERT INTO "private"."billing_cutoffs" ("singleton", "pending_json_cutoff")
VALUES (true, now() + interval '2 hours')
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION private.pending_json_cutoff ()
  RETURNS timestamp with time zone
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Rows created before this are pending reconciliation by their JSON billing_status as well as
-- by expected_cost_nanos; see private.billing_cutoffs. -infinity (the flag is never read) if the
-- marker is missing.
  select coalesce((select pending_json_cutoff from private.billing_cutoffs where singleton), '-infinity'::timestamptz);
$function$;

GRANT EXECUTE ON FUNCTION "private"."pending_json_cutoff"() TO "service_role";

REVOKE ALL ON FUNCTION "private"."pending_json_cutoff"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."pending_json_cutoff"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."pending_json_cutoff"() TO "postgres";

-- Only the service role (the gateway, and the refund claim and budget readers it calls) reads it.
REVOKE ALL ON FUNCTION "private"."pending_json_cutoff"() FROM "anon", "authenticated";
