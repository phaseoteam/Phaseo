-- Allow the Broadcast destination types Axiom, Dynatrace, Elastic, Honeycomb and
-- Respan. The CHECK only grows, so every existing row still satisfies it.
alter table "public"."workspace_broadcast_destinations" drop constraint "workspace_broadcast_destinations_destination_id_check";

alter table "public"."workspace_broadcast_destinations" add constraint "workspace_broadcast_destinations_destination_id_check" CHECK ((destination_id = ANY (ARRAY['arize'::text, 'axiom'::text, 'braintrust'::text, 'clickhouse'::text, 'comet_opik'::text, 'datadog'::text, 'dynatrace'::text, 'elastic'::text, 'grafana_cloud'::text, 'honeycomb'::text, 'langfuse'::text, 'langsmith'::text, 'new_relic'::text, 'otel_collector'::text, 'posthog'::text, 'respan'::text, 's3'::text, 'sentry'::text, 'snowflake'::text, 'wandb_weave'::text, 'webhook'::text]))) not valid;

alter table "public"."workspace_broadcast_destinations" validate constraint "workspace_broadcast_destinations_destination_id_check";
