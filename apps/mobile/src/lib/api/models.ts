import { z } from "zod";
import { request } from "./http";

const num = z.coerce.number().nullish();
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
  organisation: z.object({ name: str, country_code: str }).passthrough().nullish(),
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
  provider: z.object({ api_provider_id: str, api_provider_name: str, status: str }).passthrough().nullish(),
}).passthrough();

export type GatewayRoute = z.infer<typeof gatewayRouteSchema>;

const gatewayMetadataSchema = z.object({
  primaryModelIdentifier: str,
  acceptedModelIdentifiers: z.array(z.string()).default([]),
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
}).passthrough();

const providerPricingSchema = z.object({
  provider: z.object({ api_provider_id: str, api_provider_name: str, status: str }).passthrough(),
  pricing_rules: z.array(pricingRuleSchema).default([]),
}).passthrough();

export type ProviderPricing = z.infer<typeof providerPricingSchema>;
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

const performanceSchema = z.object({
  summary: performanceSummarySchema,
  providerPerformance: z.array(z.object({
    provider: z.string().optional(),
    providerName: z.string().optional(),
    avgThroughput: num,
    avgLatencyMs: num,
    uptimePct: num,
    requests: z.coerce.number().default(0),
  }).passthrough()).default([]),
}).passthrough();

export type ModelPerformance = z.infer<typeof performanceSchema>;

export async function getModelPerformance(id: string): Promise<ModelPerformance | null> {
  const raw = await request(path(id, "/performance"), { query: { percentile: 50 } });
  return z.object({ metrics: performanceSchema.nullish() }).passthrough().parse(raw).metrics ?? null;
}

const benchmarkSchema = z.object({
  benchmarkId: z.string().optional(),
  benchmarkName: z.string().optional(),
  totalModels: num,
  rank: num,
  score: num,
  scoreDisplay: z.string().optional(),
  isSelfReported: z.boolean().default(false),
  sourceLink: str,
}).passthrough();

export type ModelBenchmark = z.infer<typeof benchmarkSchema>;

export async function getModelBenchmarks(id: string): Promise<ModelBenchmark[]> {
  const raw = await request(path(id, "/benchmarks"));
  return z.object({ highlights: z.array(benchmarkSchema).default([]) }).passthrough().parse(raw).highlights;
}

const timelineEventSchema = z.object({
  date: z.string(),
  eventType: z.string().optional(),
  eventName: z.string().optional(),
  description: z.string().optional(),
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

const activityRowSchema = z.object({
  dayBucket: z.string(),
  requests: z.coerce.number().default(0),
  totalTokens: z.coerce.number().default(0),
}).passthrough();

export type ModelActivityRow = z.infer<typeof activityRowSchema>;

export async function getModelActivity(id: string): Promise<ModelActivityRow[]> {
  const raw = await request(path(id, "/usage-daily"), { query: { days: 30 } });
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
