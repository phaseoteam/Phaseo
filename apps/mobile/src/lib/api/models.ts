import { z } from "zod";
import { request } from "./http";

const num = z.coerce.number().nullish();
const count = z.coerce.number().default(0);
const str = z.string().nullish();
const strings = z.array(z.string().nullish()).nullish().transform((values) => (values ?? []).filter((value): value is string => Boolean(value)));
const option = z.object({ value: z.string(), count: z.coerce.number().default(0) });

/** One row of the catalogue (`/api/_web/models?shape=page&projection=5`). */
const modelCardSchema = z.object({
  model_id: z.string(),
  name: str,
  status: str,
  description: str,
  organisation_id: str,
  organisation_name: str,
  organisation_colour: str,
  primary_date: str,
  primary_timestamp: num,
  deprecation_date: str,
  retirement_date: str,
  gateway_status: str,
  gateway_provider_count: num,
  gateway_active_provider_count: num,
  gateway_endpoints: strings,
  gateway_input_modalities: strings,
  gateway_output_modalities: strings,
  gateway_features: strings,
  gateway_tiers: strings,
  gateway_provider_names: strings,
  gateway_active_provider_names: strings,
  context_lengths: z.array(z.coerce.number()).nullish(),
  lowest_input_price: num,
  lowest_output_price: num,
  lowest_from_price: num,
  lowest_from_price_unit: str,
  pricing_detail_rows: z.array(z.object({ label: z.string(), value: z.string() })).nullish(),
  popularity_tokens_week: num,
  throughput_week: num,
  latency_week: num,
}).passthrough();

export type ModelCard = z.infer<typeof modelCardSchema>;

const facetsSchema = z.object({
  statusCounts: z.record(z.string(), z.coerce.number()).default({}),
  endpointOptions: z.array(option).default([]),
  inputModalityOptions: z.array(option).default([]),
  outputModalityOptions: z.array(option).default([]),
  providerOptions: z.array(option).default([]),
  creatorOptions: z.array(option).default([]),
  yearOptions: z.array(option).default([]),
}).passthrough();

export type CatalogueFacets = z.infer<typeof facetsSchema>;

const catalogueSchema = z.object({
  models: z.array(modelCardSchema),
  facets: facetsSchema.default({} as never),
  total: z.coerce.number().default(0),
});

export type Catalogue = z.infer<typeof catalogueSchema>;

/** The whole catalogue in one response (~250 KB gzipped); filtering happens on the device, as on the web. */
export async function getCatalogue(): Promise<Catalogue> {
  const raw = await request("/api/_web/models", { query: { shape: "page", projection: 5, limit: 2000, offset: 0 } });
  return catalogueSchema.parse(raw);
}

const linkSchema = z.object({ url: z.string(), platform: str, kind: str, title: str }).passthrough();
const detailSchema = z.object({ detail_name: z.string(), detail_value: z.union([z.string(), z.number(), z.null()]).optional() }).passthrough();

const modelSchema = z.object({
  id: z.string().optional(),
  model_id: z.string().optional(),
  name: str,
  organisation: z.object({ name: str, country_code: str, colour: str, logo_url: str }).passthrough().nullish(),
  organisation_id: str,
  organisation_name: str,
  description: str,
  aliases: z.array(z.string()).nullish(),
  announcement_date: str,
  release_date: str,
  deprecation_date: str,
  retirement_date: str,
  license: str,
  license_url: str,
  input_modalities: z.array(z.string()).nullish(),
  output_modalities: z.array(z.string()).nullish(),
  input_types: str,
  output_types: str,
  previous_model_id: str,
  family_id: str,
  is_private: z.boolean().nullish(),
  variants: z.array(z.object({ model_id: z.string(), name: str, variant_kind: str }).passthrough()).nullish(),
  model_links: z.array(linkSchema).nullish(),
  model_family: z.object({ display_name: str }).passthrough().nullish(),
  model_details: z.array(detailSchema).nullish(),
  context_length: num,
  status: str,
}).passthrough().transform((model) => ({
  ...model,
  id: model.id ?? model.model_id ?? "",
  input_modalities: model.input_modalities ?? model.input_types?.split(",").filter(Boolean) ?? [],
  output_modalities: model.output_modalities ?? model.output_types?.split(",").filter(Boolean) ?? [],
}));

export type ModelDetail = z.infer<typeof modelSchema>;

const path = (id: string, suffix = "") => `/api/_web/models/${encodeURIComponent(id)}${suffix}`;

export async function getModel(id: string): Promise<ModelDetail> {
  const raw = await request<{ model?: unknown }>(path(id));
  return modelSchema.parse(raw?.model ?? raw);
}

const gatewayRouteSchema = z.object({
  api_provider_id: str,
  provider_model_slug: str,
  endpoint: str,
  is_active_gateway: z.boolean().nullish(),
  availability_status: str,
  context_length: num,
  max_output_tokens: num,
  credential_mode: str,
  provider: z.object({ api_provider_id: str, api_provider_name: str, status: str }).passthrough().nullish(),
}).passthrough();

export type GatewayRoute = z.infer<typeof gatewayRouteSchema>;

const supportedParameterSchema = z.object({ param_id: z.string(), provider_count_supported: z.coerce.number().default(0) }).passthrough();

const gatewayMetadataSchema = z.object({
  modelId: str,
  aliases: z.array(z.string()).default([]),
  primaryModelIdentifier: str,
  acceptedModelIdentifiers: z.array(z.string()).default([]),
  supportedParametersByEndpoint: z.record(z.string(), z.array(supportedParameterSchema)).default({}),
  providers: z.array(gatewayRouteSchema).default([]),
  activeProviders: z.array(gatewayRouteSchema).default([]),
  comingSoonProviders: z.array(gatewayRouteSchema).default([]),
}).passthrough();

export type GatewayMetadata = z.infer<typeof gatewayMetadataSchema>;

export async function getModelGatewayMetadata(id: string): Promise<GatewayMetadata> {
  const raw = await request<{ metadata?: unknown }>(path(id, "/gateway-metadata"));
  return gatewayMetadataSchema.parse(raw?.metadata ?? {});
}

const pricingRuleSchema = z.object({
  meter: str,
  unit: str,
  unit_size: num,
  price_per_unit: num,
  currency: str,
  pricing_plan: str,
  note: str,
  effective_from: str,
  effective_to: str,
}).passthrough();

const pricingProviderSchema = z.object({
  api_provider_id: str,
  api_provider_name: str,
  status: str,
  routing_status: str,
  offer_label: str,
  offer_scope: str,
  colour: str,
  provider_family_id: str,
  data_policy_tier: str,
  residency_mode: str,
  default_execution_regions: z.array(z.string()).nullish(),
  default_data_regions: z.array(z.string()).nullish(),
  prompt_training_policy: str,
  zero_data_retention: z.boolean().nullish(),
}).passthrough();

const providerModelSchema = z.object({
  is_active_gateway: z.boolean().nullish(),
  endpoint: str,
  service_tier: str,
  phaseo_status: str,
  routing_status: str,
  capability_status: str,
  provider_availability_status: str,
  access_scope: str,
  effective_from: str,
  effective_to: str,
  context_length: num,
  max_output_tokens: num,
  execution_region: str,
  provider_model_slug: str,
  model_id: str,
}).passthrough();

const providerPricingSchema = z.object({
  provider: pricingProviderSchema,
  provider_models: z.array(providerModelSchema).default([]),
  pricing_rules: z.array(pricingRuleSchema).default([]),
}).passthrough();

export type ProviderPricing = z.infer<typeof providerPricingSchema>;
export type ProviderModel = z.infer<typeof providerModelSchema>;
export type PricingRule = z.infer<typeof pricingRuleSchema>;

export async function getModelPricing(id: string): Promise<ProviderPricing[]> {
  const raw = await request(path(id, "/pricing"));
  return z.object({ providers: z.array(providerPricingSchema).default([]) }).passthrough().parse(raw).providers;
}

const performanceSummarySchema = z.object({
  avgThroughput: num,
  avgLatencyMs: num,
  avgGenerationMs: num,
  uptimePct: num,
  totalRequests: z.coerce.number().default(0),
}).passthrough();

/** Metric values shared by the hourly, daily and percentile series. */
const trendValues = {
  avgThroughput: num,
  avgLatencyMs: num,
  avgEndToEndMs: num,
  cachedInputPct: num,
  requests: count,
};

const providerTrendPointSchema = z.object({
  bucket: z.string().optional(),
  day: z.string().optional(),
  provider: z.string().default(""),
  providerName: z.string().nullish(),
  providerColor: str,
  percentile: num,
  ...trendValues,
}).passthrough();

export type ProviderTrendPoint = z.infer<typeof providerTrendPointSchema>;

const performanceSchema = z.object({
  cloudflareColo: str,
  percentile: num,
  rangeDays: num,
  summary: performanceSummarySchema,
  hourly: z.array(z.object({ bucket: z.string(), successPct: num, ...trendValues }).passthrough()).default([]),
  successSeries: z.array(z.object({
    bucket: z.string(),
    overallSuccessPct: num,
    worstProviderSuccessPct: num,
    worstProviderRequests: count,
    providerCount: count,
    requests: count,
  }).passthrough()).default([]),
  providerHourly7d: z.array(providerTrendPointSchema).default([]),
  providerDaily7d: z.array(providerTrendPointSchema).default([]),
  providerPercentileDaily7d: z.array(providerTrendPointSchema).default([]),
  qualitySeries: z.array(z.object({ bucket: z.string(), toolCallErrorPct: num, structuredOutputErrorPct: num, requests: count }).passthrough()).default([]),
}).passthrough();

export type ModelPerformance = z.infer<typeof performanceSchema>;
export type SuccessPoint = ModelPerformance["successSeries"][number];

export async function getModelPerformance(id: string, options: { percentile?: number; colo?: string | null; range?: 1 | 3 | 7 } = {}): Promise<ModelPerformance | null> {
  const raw = await request(path(id, "/performance"), { query: { percentile: options.percentile ?? 50, range: options.range ?? 3, colo: options.colo ?? undefined } });
  return z.object({ metrics: performanceSchema.nullish() }).passthrough().parse(raw).metrics ?? null;
}

/** Cloudflare locations that served enough requests to show their own charts. */
export async function getModelPerformanceColos(id: string): Promise<{ colo: string; requests: number }[]> {
  const raw = await request(path(id, "/performance/colos"));
  return z.object({ colos: z.array(z.object({ colo: z.string(), requests: count })).default([]) }).passthrough().parse(raw).colos;
}

const providerHealthRowSchema = z.object({
  provider_id: z.string(),
  service_tier: str,
  requests: count,
  requests_30m: count,
  health_requests: count,
  uptime_pct: num,
  request_success_pct: num,
  percentile_latency_ms_30m: num,
  p50_latency_ms_30m: num,
  median_latency_ms_30m: num,
  avg_latency_ms_30m: num,
  percentile_latency_ms: num,
  avg_latency_ms: num,
  percentile_throughput_30m: num,
  p50_throughput_30m: num,
  median_throughput_30m: num,
  avg_throughput_30m: num,
  percentile_throughput: num,
  avg_throughput: num,
  last_request_at: str,
}).passthrough();

export type ProviderHealthRow = z.infer<typeof providerHealthRowSchema>;

/** Three days of routing health per provider and service tier, as the website's provider table reads it. */
export async function getModelProviderHealth(id: string, providerIds: string[], percentile = 50): Promise<ProviderHealthRow[]> {
  const ids = [...new Set(providerIds.filter(Boolean))].sort();
  if (!ids.length) return [];
  const raw = await request(path(id, "/provider-health"), { query: { provider_ids: ids.join(","), window_days: 3, bucket_hours: 1, percentile } });
  return z.object({ rows: z.array(providerHealthRowSchema).default([]) }).passthrough().parse(raw).rows;
}

const pricingHistoryRuleSchema = z.object({
  providerId: z.string(),
  providerName: z.string().nullish(),
  pricingPlan: z.string().default("standard"),
  meter: z.string(),
  unit: z.string().default("token"),
  unitSize: z.coerce.number().default(1),
  pricePerUnit: z.coerce.number(),
  pricePer1MUnits: z.coerce.number(),
  priority: z.coerce.number().default(100),
  effectiveFrom: str,
  effectiveTo: str,
  match: z.array(z.unknown()).default([]),
  timeWindows: z.array(z.unknown()).default([]),
}).passthrough();

export type PricingHistoryRule = z.infer<typeof pricingHistoryRuleSchema>;

export async function getModelPricingHistory(id: string, days = 3650): Promise<PricingHistoryRule[]> {
  const raw = await request(path(id, "/pricing-history"), { query: { days } });
  return z.object({ rules: z.array(pricingHistoryRuleSchema).default([]) }).passthrough().parse(raw).rules;
}

const effectivePricingRowSchema = z.object({
  dayBucket: z.string(),
  providerId: z.string(),
  pricingPlan: z.string().default("standard"),
  inputTokens: count,
  outputTokens: count,
  cachedReadTokens: count,
  inputCostNanos: count,
  outputCostNanos: count,
}).passthrough();

export type EffectivePricingRow = z.infer<typeof effectivePricingRowSchema>;

/** What requests actually cost per provider, tier and day (after cache discounts and long-context tiers). */
export async function getModelEffectivePricing(id: string, days = 365): Promise<EffectivePricingRow[]> {
  const raw = await request(path(id, "/effective-pricing-daily"), { query: { days } });
  return z.object({ rows: z.array(effectivePricingRowSchema).default([]) }).passthrough().parse(raw).rows;
}

const availabilitySchema = z.object({ isGatewayActive: z.boolean().default(false), activeProviderCount: count }).passthrough();

export async function getModelAvailability(id: string): Promise<z.infer<typeof availabilitySchema>> {
  const raw = await request(path(id, "/availability"));
  return z.object({ availability: availabilitySchema }).passthrough().parse(raw).availability;
}

const organisationModelSchema = z.object({
  model_id: z.string(),
  name: str,
  organisation_id: str,
  status: str,
  primary_date: str,
  primary_timestamp: num,
}).passthrough();

export type OrganisationModel = z.infer<typeof organisationModelSchema>;

export async function getOrganisationModels(organisationId: string): Promise<OrganisationModel[]> {
  const raw = await request(`/api/_web/organisations/${encodeURIComponent(organisationId)}/models`);
  return z.object({ models: z.array(organisationModelSchema).default([]) }).passthrough().parse(raw).models;
}

const rankingConfigurationSchema = z.object({ score: z.coerce.number(), variant: str, other_info: str }).passthrough();
const rankingEntrySchema = z.object({
  model_id: z.string(),
  score: z.coerce.number(),
  other_info: str,
  configurations: z.array(rankingConfigurationSchema).nullish(),
}).passthrough();

const benchmarkRankingSchema = z.object({ benchmark_id: z.string(), lower_is_better: z.boolean().default(false), entries: z.array(rankingEntrySchema).default([]) }).passthrough();

export type BenchmarkRanking = z.infer<typeof benchmarkRankingSchema>;

/** Every model's scores per ranked benchmark (~1 MB; callers keep only what they need). */
export async function getBenchmarkRankings(): Promise<BenchmarkRanking[]> {
  const raw = await request("/api/_web/rankings/benchmarks");
  return z.object({ benchmarks: z.array(benchmarkRankingSchema).default([]) }).passthrough().parse(raw).benchmarks;
}

const epochResultSchema = z.object({
  model_id: z.string(),
  score: z.coerce.number().nullish(),
  rank: num,
  other_info: str,
  model: z.object({ name: str, organisation: z.object({ organisation_id: str }).passthrough().nullish() }).passthrough().nullish(),
}).passthrough();

export type EpochLeaderboardEntry = { modelId: string; modelName: string; organisationId: string | null; score: number; rank: number; otherInfo: string | null };

/** The Epoch Capabilities Index leaderboard (scores and published confidence intervals). */
export async function getEpochLeaderboard(): Promise<EpochLeaderboardEntry[]> {
  const raw = await request<{ benchmark?: unknown }>("/api/_web/benchmarks/epoch-capabilities-index");
  const parsed = z.object({ results: z.array(epochResultSchema).default([]) }).passthrough().parse(raw?.benchmark ?? raw);
  return parsed.results.flatMap((result) => result.score == null || !Number.isFinite(result.score) ? [] : [{
    modelId: result.model_id,
    modelName: result.model?.name ?? result.model_id,
    organisationId: result.model?.organisation?.organisation_id ?? null,
    score: result.score,
    rank: result.rank ?? 0,
    otherInfo: result.other_info ?? null,
  }]).sort((a, b) => a.rank - b.rank || b.score - a.score);
}

const benchmarkSchema = z.object({
  benchmarkId: z.string().default(""),
  benchmarkName: z.string().optional(),
  totalModels: num,
  rank: num,
  score: num,
  scoreDisplay: z.string().optional(),
  isPercentage: z.boolean().nullish(),
  isSelfReported: z.boolean().default(false),
  otherInfo: str,
  sourceLink: str,
}).passthrough();

export type ModelBenchmark = z.infer<typeof benchmarkSchema>;

/** One evaluated configuration (Max, High, …) of a benchmark. Highlights keep one row per benchmark. */
const benchmarkResultSchema = z.object({
  benchmark_id: z.string(),
  score: num,
  variant: str,
  result_key: str,
  other_info: str,
  source_link: str,
  rank: num,
  benchmark: z.object({ name: str, total_models: num, ascending_order: z.boolean().nullish() }).passthrough().nullish(),
}).passthrough();

export type ModelBenchmarkResult = z.infer<typeof benchmarkResultSchema>;

export async function getModelBenchmarks(id: string): Promise<{ highlights: ModelBenchmark[]; results: ModelBenchmarkResult[] }> {
  const raw = await request(path(id, "/benchmarks"));
  return z.object({ highlights: z.array(benchmarkSchema).default([]), results: z.array(benchmarkResultSchema).default([]) }).passthrough().parse(raw);
}

const timelineEventSchema = z.object({
  date: z.string(),
  eventType: z.string().optional(),
  eventName: z.string().optional(),
  description: z.string().optional(),
  modelId: z.string().optional(),
  modelName: z.string().optional(),
}).passthrough();

export type ModelTimelineEvent = z.infer<typeof timelineEventSchema>;

export async function getModelTimeline(id: string): Promise<ModelTimelineEvent[]> {
  const raw = await request(path(id, "/timeline"));
  return z.object({ events: z.array(timelineEventSchema).default([]) }).passthrough().parse(raw).events;
}

const modelAppSchema = z.object({
  appId: z.string(),
  title: z.string(),
  imageUrl: str,
  url: str,
  totalRequests: z.coerce.number().default(0),
  totalTokens: z.coerce.number().default(0),
}).passthrough();

export type ModelApp = z.infer<typeof modelAppSchema>;

export async function getModelApps(id: string): Promise<ModelApp[]> {
  const raw = await request(path(id, "/apps"));
  return z.object({ apps: z.array(modelAppSchema).default([]) }).passthrough().parse(raw).apps;
}

/** One provider's gateway usage on one UTC day. */
const activityRowSchema = z.object({
  dayBucket: z.string(),
  providerId: z.string().default(""),
  requests: count,
  successRequests: count,
  totalTokens: count,
  inputTokens: count,
  outputTokens: count,
  reasoningTokens: count,
  inputTextTokens: count,
  outputTextTokens: count,
  cachedReadTokens: count,
  cachedReadTextTokens: count,
}).passthrough();

export type ModelActivityRow = z.infer<typeof activityRowSchema>;

export async function getModelActivity(id: string, days = 30): Promise<ModelActivityRow[]> {
  const raw = await request(path(id, "/usage-daily"), { query: { days } });
  return z.object({ rows: z.array(activityRowSchema).default([]) }).passthrough().parse(raw).rows;
}

const subscriptionPlanSchema = z.object({
  plan_id: z.string().optional(),
  name: z.string().optional(),
  description: str,
  link: str,
  organisation: z.object({ name: str }).passthrough().nullish(),
  prices: z.array(z.object({ price: z.coerce.number(), currency: z.string(), frequency: z.string() }).passthrough()).default([]),
}).passthrough();

export type ModelSubscription = z.infer<typeof subscriptionPlanSchema>;

export async function getModelSubscriptions(id: string): Promise<ModelSubscription[]> {
  const raw = await request(path(id, "/subscription-plans"));
  return z.object({ subscription_plans: z.array(subscriptionPlanSchema).default([]) }).passthrough().parse(raw).subscription_plans;
}

const releaseSchema = z.object({
  model: z.object({ model_id: z.string().optional(), id: z.string().optional(), name: str, organisation: z.object({ name: str }).passthrough().nullish(), organisation_id: str, organisation_name: str }).passthrough()
    .transform((model) => ({ ...model, model_id: model.model_id ?? model.id ?? "" })),
  types: z.array(z.string()).default([]),
  date: z.string(),
}).passthrough();

export type ModelRelease = z.infer<typeof releaseSchema>;

export async function getReleases(): Promise<{ past: ModelRelease[]; future: ModelRelease[] }> {
  const raw = await request("/api/_web/updates/models", { query: { limit: 20, upcoming_limit: 10 } });
  const parsed = z.object({ past: z.array(releaseSchema).default([]), future: z.array(releaseSchema).default([]) }).passthrough().parse(raw);
  return { past: parsed.past.filter((release) => release.model.model_id), future: parsed.future.filter((release) => release.model.model_id) };
}
