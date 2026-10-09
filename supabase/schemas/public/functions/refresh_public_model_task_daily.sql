CREATE OR REPLACE FUNCTION public.refresh_public_model_task_daily (
  p_since date DEFAULT (CURRENT_DATE - 1)
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('refresh_public_model_task_daily')
  );

  delete from public.public_model_task_daily
  where usage_date >= coalesce(p_since, current_date - 1);

  insert into public.public_model_task_daily (
    usage_date, taxonomy_slug, primary_category, model_slug, provider_slug,
    workspace_count, request_count, input_tokens, output_tokens, updated_at
  )
  select
    daily.usage_date,
    classifier.slug,
    daily.primary_category,
    daily.model_slug,
    daily.provider_slug,
    count(*) as workspace_count,
    sum(daily.request_count) as request_count,
    sum(daily.input_tokens) as input_tokens,
    sum(daily.output_tokens) as output_tokens,
    now()
  from public.reporting_classification_daily daily
  join public.workspace_classifiers classifier on classifier.id = daily.classifier_id
  where daily.usage_date >= coalesce(p_since, current_date - 1)
    and classifier.kind = 'phaseo_task'
  group by daily.usage_date, classifier.slug, daily.primary_category,
    daily.model_slug, daily.provider_slug
  on conflict (usage_date, taxonomy_slug, primary_category, model_slug, provider_slug)
  do update set
    workspace_count = excluded.workspace_count,
    request_count = excluded.request_count,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    updated_at = excluded.updated_at;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_public_model_task_daily"(date) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_public_model_task_daily"(date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_public_model_task_daily"(date) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_public_model_task_daily"(date) FROM PUBLIC, "anon", "authenticated";
