type Row = Record<string, unknown>;
export function buildEnumSnapshot(tables: ReadonlyMap<string, Row[]>, now = Date.now()) {
  const sorted = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))].sort();
  const models = (tables.get("v2_models") ?? []).filter((row) => !row.hidden);
  const modelIds = new Set(models.map((row) => row.model_slug));
  const active = (from: unknown, to: unknown) => (!from || Date.parse(String(from)) <= now) && (!to || Date.parse(String(to)) > now);
  return {
    models: sorted(models.map((row) => row.model_slug)),
    callableModels: sorted((tables.get("v2_model_provider_routes") ?? []).filter((row) => modelIds.has(row.model_slug) && row.is_stealth !== true && row.routing_enabled === true && row.phaseo_status === "enabled" && row.access_scope === "public" && ["available", "preview", "limited_access"].includes(String(row.provider_availability_status)) && active(row.effective_from, row.effective_to)).map((row) => row.model_slug)),
    organisations: sorted((tables.get("v2_labs") ?? []).map((row) => row.lab_slug)),
    api_providers: sorted((tables.get("v2_providers") ?? []).map((row) => row.provider_slug)),
    subscription_plans: sorted((tables.get("v2_subscription_plans") ?? []).filter((row) => active(null, row.effective_to)).map((row) => row.plan_id)),
    benchmarks: sorted((tables.get("v2_benchmarks") ?? []).map((row) => row.benchmark_id)),
  };
}
