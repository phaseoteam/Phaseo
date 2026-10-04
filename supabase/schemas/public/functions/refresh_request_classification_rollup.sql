CREATE OR REPLACE FUNCTION public.refresh_request_classification_rollup (
  p_contribution_id uuid,
  p_classifier_id   uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_contribution public.data_contributions%rowtype;
  v_category text;
begin
  select * into v_contribution
  from public.data_contributions
  where id = p_contribution_id;
  if not found then return; end if;

  select primary_category into v_category
  from public.request_classifications
  where contribution_id = p_contribution_id
    and classifier_id = p_classifier_id;
  if not found then return; end if;

  if not exists (
    select 1 from public.workspace_classifiers where id = p_classifier_id
  ) then
    return;
  end if;

  insert into public.request_classification_daily (
    usage_date, workspace_id, classifier_id, primary_category, model_slug,
    provider_slug, request_count, input_tokens, output_tokens, updated_at
  )
  select
    contribution.occurred_at::date,
    contribution.workspace_id,
    classification.classifier_id,
    classification.primary_category,
    contribution.model_slug,
    coalesce(contribution.provider_slug, ''),
    count(*),
    coalesce(sum(contribution.input_tokens), 0),
    coalesce(sum(contribution.output_tokens), 0),
    now()
  from public.request_classifications classification
  join public.data_contributions contribution on contribution.id = classification.contribution_id
  where contribution.workspace_id = v_contribution.workspace_id
    and contribution.occurred_at::date = v_contribution.occurred_at::date
    and classification.classifier_id = p_classifier_id
    and classification.primary_category = v_category
    and contribution.model_slug = v_contribution.model_slug
    and coalesce(contribution.provider_slug, '') = coalesce(v_contribution.provider_slug, '')
  group by contribution.occurred_at::date, contribution.workspace_id,
    classification.classifier_id, classification.primary_category,
    contribution.model_slug, coalesce(contribution.provider_slug, '')
  on conflict (usage_date, workspace_id, classifier_id, primary_category, model_slug, provider_slug)
  do update set
    request_count = excluded.request_count,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    updated_at = excluded.updated_at;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_request_classification_rollup"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_request_classification_rollup"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_request_classification_rollup"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_request_classification_rollup"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";
