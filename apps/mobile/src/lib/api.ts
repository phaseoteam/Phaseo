import Constants from "expo-constants";
import { z } from "zod";
import { resolveSecureOrigin } from "./origins";

const extra = Constants.expoConfig?.extra as { phaseoOrigin?: string; phaseoApiOrigin?: string } | undefined;
export const WEB_ORIGIN = resolveSecureOrigin(
  process.env.EXPO_PUBLIC_PHASEO_ORIGIN ?? extra?.phaseoOrigin,
  "https://phaseo.app",
);
export const API_ORIGIN = `${resolveSecureOrigin(
  process.env.EXPO_PUBLIC_PHASEO_API_ORIGIN ?? extra?.phaseoApiOrigin,
  "https://api.phaseo.app",
)}/v1`;

const modelLinkSchema = z.object({
  url: z.string(),
  platform: z.string().nullish(),
  kind: z.string().nullish(),
  title: z.string().nullish()
}).passthrough();

const modelDetailSchema = z.object({
  detail_name: z.string(),
  detail_value: z.union([z.string(), z.number(), z.null()]).optional()
}).passthrough();

const modelVariantSchema = z.object({
  model_id: z.string().optional(),
  name: z.string().optional(),
  variant_kind: z.string().optional()
}).passthrough();

const rawModelSchema = z.object({
  id: z.string().optional(),
  model_id: z.string().optional(),
  name: z.string().optional(),
  organisation: z.object({ name: z.string().optional(), country_code: z.string().nullish() }).passthrough().optional(),
  organisation_id: z.string().optional(),
  organisation_name: z.string().optional(),
  description: z.string().nullish(),
  aliases: z.array(z.string()).nullish(),
  variants: z.union([
    z.array(modelVariantSchema),
    z.record(z.string(), modelVariantSchema)
  ]).nullish(),
  variant_kind: z.string().nullish(),
  base_model_id: z.string().nullish(),
  announcement_date: z.string().nullish(),
  release_date: z.string().nullish(),
  deprecation_date: z.string().nullish(),
  retirement_date: z.string().nullish(),
  license: z.string().nullish(),
  license_url: z.string().nullish(),
  input_modalities: z.array(z.string()).optional(),
  output_modalities: z.array(z.string()).optional(),
  input_types: z.string().nullish(),
  output_types: z.string().nullish(),
  previous_model_id: z.string().nullish(),
  family_id: z.string().nullish(),
  updated_at: z.string().nullish(),
  model_links: z.array(modelLinkSchema).nullish(),
  model_family: z.object({ display_name: z.string().optional() }).passthrough().nullish(),
  model_details: z.array(modelDetailSchema).nullish(),
  context_length: z.coerce.number().nullish(),
  providers: z.array(z.unknown()).optional(),
  lowest_input_price: z.coerce.number().nullish(),
  lowest_output_price: z.coerce.number().nullish(),
  status: z.string().nullish()
}).passthrough().refine(model => Boolean(model.id ?? model.model_id), { message: "Model identifier is missing" }).transform(model => ({
  ...model,
  id: model.id ?? model.model_id!,
  input_modalities: model.input_modalities ?? model.input_types?.split(",").filter(Boolean),
  output_modalities: model.output_modalities ?? model.output_types?.split(",").filter(Boolean)
}));

const modelSchema = rawModelSchema;

export type PhaseoModel = z.infer<typeof modelSchema>;
const modelsEnvelope = z.union([
  z.array(modelSchema),
  z.object({ models: z.array(modelSchema), next_cursor: z.string().nullish().optional() }),
  z.object({ data: z.array(modelSchema), next_cursor: z.string().nullish().optional() })
]);

const modelsPageSchema = z.object({
  models: z.array(modelSchema),
  total: z.coerce.number(),
  limit: z.coerce.number(),
  offset: z.coerce.number()
}).passthrough();

export type ModelsPage = z.infer<typeof modelsPageSchema>;
export const MODELS_PAGE_SIZE = 60;

const releaseModelSchema = z.object({
  model_id: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  organisation: z.object({ name: z.string().optional() }).nullish(),
  organisation_name: z.string().nullish()
}).passthrough().transform(model => ({
  ...model,
  model_id: model.model_id ?? model.id ?? ""
})).refine(model => Boolean(model.model_id), { message: "Release model identifier is missing" });

const releaseSchema = z.object({
  model: releaseModelSchema,
  types: z.array(z.string()).default([]),
  date: z.string()
}).passthrough();

const releasesSchema = z.object({
  past: z.array(releaseSchema).default([]),
  future: z.array(releaseSchema).default([])
}).passthrough();

export type ModelRelease = z.infer<typeof releaseSchema>;
export type ModelReleases = z.infer<typeof releasesSchema>;

const usageModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  requests: z.coerce.number().default(0),
  tokens: z.coerce.number().default(0),
  spendNanos: z.coerce.number().default(0)
}).passthrough();

const usageSummarySchema = z.object({
  totalRequests: z.coerce.number().default(0),
  totalTokens: z.coerce.number().default(0),
  avgPerDay: z.coerce.number().default(0),
  activeDays: z.coerce.number().default(0),
  topModels: z.array(usageModelSchema).default([]),
  creditsUsage: z.object({ today: z.string().optional(), week: z.string().optional(), month: z.string().optional() }).nullish()
}).passthrough();

export type MobileUsageSummary = z.infer<typeof usageSummarySchema>;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request(path: string, init?: RequestInit, token?: string): Promise<unknown> {
  const response = await fetch(`${WEB_ORIGIN}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  if (!response.ok) throw new ApiError(response.status, response.status === 401 ? "Your session has expired." : "Phaseo could not load this data.");
  return response.json();
}

export async function getModels(query = ""): Promise<PhaseoModel[]> {
  const raw = await request(`/api/_web/models?shape=page&projection=5&limit=${query ? 2000 : 40}`);
  const parsed = modelsEnvelope.parse(raw);
  const models = Array.isArray(parsed) ? parsed : "models" in parsed ? parsed.models : parsed.data;
  if (!query.trim()) return models;
  const search = query.trim().toLocaleLowerCase();
  return models.filter(model => [
    model.id,
    model.model_id,
    model.name,
    model.organisation?.name,
    model.organisation_name
  ].some(value => value?.toLocaleLowerCase().includes(search)));
}

export async function getModelsPage(offset = 0, limit = MODELS_PAGE_SIZE): Promise<ModelsPage> {
  const params = new URLSearchParams({
    shape: "page",
    projection: "5",
    limit: String(limit),
    offset: String(offset)
  });
  return modelsPageSchema.parse(await request(`/api/_web/models?${params.toString()}`));
}

export async function getModel(id: string): Promise<PhaseoModel> {
  const raw = await request(`/api/_web/models/${encodeURIComponent(id)}?projection=variants-v1`);
  return modelSchema.parse((raw as { model?: unknown }).model ?? raw);
}

export async function getReleases(): Promise<ModelReleases> {
  return releasesSchema.parse(await request("/api/_web/updates/models?limit=12&upcoming_limit=8"));
}

export async function getUsage(token: string): Promise<MobileUsageSummary | null> {
  const raw = await request("/api/account/settings/profile/usage", undefined, token);
  const envelope = z.object({ usage: usageSummarySchema.nullable().optional() }).passthrough().safeParse(raw);
  if (envelope.success && "usage" in envelope.data) return envelope.data.usage ?? null;
  return usageSummarySchema.parse(raw);
}

const gatewayProviderSchema = z.object({
  id: z.string().nullish(),
  api_provider_id: z.string().nullish(),
  provider_model_slug: z.string().nullish(),
  model_id: z.string().nullish(),
  endpoint: z.string().nullish(),
  quantization_scheme: z.string().nullish(),
  is_active_gateway: z.boolean().nullish(),
  provider_availability_status: z.string().nullish(),
  phaseo_status: z.string().nullish(),
  access_scope: z.string().nullish(),
  availability_status: z.string().nullish(),
  availability_reason: z.string().nullish(),
  provider_status: z.string().nullish(),
  provider_routing_status: z.string().nullish(),
  model_routing_status: z.string().nullish(),
  capability_status: z.string().nullish(),
  input_modalities: z.string().nullish(),
  output_modalities: z.string().nullish(),
  context_length: z.coerce.number().nullish(),
  max_input_tokens: z.coerce.number().nullish(),
  max_output_tokens: z.coerce.number().nullish(),
  effective_from: z.string().nullish(),
  effective_to: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  provider: z.object({
    api_provider_id: z.string().nullish(),
    api_provider_name: z.string().nullish(),
    status: z.string().nullish(),
    routing_status: z.string().nullish(),
    provider_family_id: z.string().nullish(),
    offer_label: z.string().nullish(),
    offer_scope: z.string().nullish()
  }).passthrough().nullish()
}).passthrough();

const supportedParameterSchema = z.object({
  param_id: z.string(),
  provider_count_supported: z.coerce.number().default(0),
  provider_count_total: z.coerce.number().default(0),
  support_level: z.string().nullish(),
  providers: z.array(z.unknown()).default([])
}).passthrough();

const gatewayMetadataSchema = z.object({
  modelId: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  apiModelIds: z.array(z.string()).default([]),
  primaryModelIdentifier: z.string().nullish(),
  acceptedModelIdentifiers: z.array(z.string()).default([]),
  primaryModelIdentifierByEndpoint: z.record(z.string(), z.string()).default({}),
  acceptedModelIdentifiersByEndpoint: z.record(z.string(), z.array(z.string())).default({}),
  supportedParametersByEndpoint: z.record(z.string(), z.array(supportedParameterSchema)).default({}),
  providers: z.array(gatewayProviderSchema).default([]),
  activeProviders: z.array(gatewayProviderSchema).default([]),
  comingSoonProviders: z.array(gatewayProviderSchema).default([]),
  inactiveProviders: z.array(gatewayProviderSchema).default([])
}).passthrough();

const gatewayMetadataEnvelope = z.object({
  metadata: gatewayMetadataSchema
});

export type GatewayProviderModel = z.infer<typeof gatewayProviderSchema>;
export type GatewayMetadata = z.infer<typeof gatewayMetadataSchema>;

export async function getModelGatewayProviders(id: string): Promise<GatewayProviderModel[]> {
  const raw = await request(`/api/_web/models/${encodeURIComponent(id)}/gateway-metadata`);
  return gatewayMetadataEnvelope.parse(raw).metadata.providers;
}

export async function getModelGatewayMetadata(id: string): Promise<GatewayMetadata> {
  const raw = await request(`/api/_web/models/${encodeURIComponent(id)}/gateway-metadata`);
  return gatewayMetadataEnvelope.parse(raw).metadata;
}

const availabilityEnvelopeSchema = z.object({
  availability: z.object({
    isGatewayActive: z.boolean().default(false),
    activeProviderCount: z.coerce.number().default(0)
  }).passthrough()
}).passthrough();

export type ModelAvailability = z.infer<typeof availabilityEnvelopeSchema>["availability"];

export async function getModelAvailability(id: string): Promise<ModelAvailability> {
  return availabilityEnvelopeSchema.parse(await request(`/api/_web/models/${encodeURIComponent(id)}/availability`)).availability;
}

const pricingRuleSchema = z.object({
  id: z.string().nullish(),
  meter: z.string().nullish(),
  unit: z.string().nullish(),
  unit_size: z.coerce.number().nullish(),
  price_per_unit: z.coerce.number().nullish(),
  included_quantity: z.coerce.number().nullish(),
  currency: z.string().nullish(),
  pricing_plan: z.string().nullish(),
  note: z.string().nullish(),
  effective_from: z.string().nullish(),
  effective_to: z.string().nullish(),
  time_windows: z.array(z.unknown()).nullish()
}).passthrough();

const providerPricingSchema = z.object({
  provider: z.object({
    api_provider_id: z.string().nullish(),
    api_provider_name: z.string().nullish(),
    status: z.string().nullish(),
    routing_status: z.string().nullish()
  }).passthrough(),
  provider_models: z.array(gatewayProviderSchema).default([]),
  pricing_rules: z.array(pricingRuleSchema).default([])
}).passthrough();

const pricingEnvelopeSchema = z.object({
  providers: z.array(providerPricingSchema).default([])
}).passthrough();

export type ModelPricing = z.infer<typeof providerPricingSchema>;
export type PricingRule = z.infer<typeof pricingRuleSchema>;

export async function getModelPricing(id: string): Promise<ModelPricing[]> {
  return pricingEnvelopeSchema.parse(await request(`/api/_web/models/${encodeURIComponent(id)}/pricing`)).providers;
}

const performanceSummarySchema = z.object({
  avgThroughput: z.coerce.number().nullish(),
  avgOutputSpeed: z.coerce.number().nullish(),
  avgLatencyMs: z.coerce.number().nullish(),
  avgGenerationMs: z.coerce.number().nullish(),
  avgPhaseoOverheadMs: z.coerce.number().nullish(),
  avgTpotMs: z.coerce.number().nullish(),
  avgItlMs: z.coerce.number().nullish(),
  uptimePct: z.coerce.number().nullish(),
  totalRequests: z.coerce.number().default(0),
  successfulRequests: z.coerce.number().default(0)
}).passthrough();

const performanceMetricsSchema = z.object({
  summary: performanceSummarySchema,
  prevSummary: performanceSummarySchema.nullish(),
  dataRange: z.object({ start: z.string().default(""), end: z.string().default("") }).passthrough().default({ start: "", end: "" }),
  providerPerformance: z.array(z.object({
    provider: z.string().optional(),
    providerName: z.string().optional(),
    avgThroughput: z.coerce.number().nullish(),
    avgLatencyMs: z.coerce.number().nullish(),
    avgGenerationMs: z.coerce.number().nullish(),
    uptimePct: z.coerce.number().nullish(),
    requests: z.coerce.number().default(0)
  }).passthrough()).default([]),
  hourly: z.array(z.unknown()).default([]),
  successSeries: z.array(z.unknown()).default([]),
  timeOfDay: z.array(z.unknown()).default([]),
  providerDaily7d: z.array(z.unknown()).default([]),
  providerPercentileDaily7d: z.array(z.unknown()).default([]),
  qualitySeries: z.array(z.unknown()).default([]),
  cumulativeTokens: z.coerce.number().nullish(),
  releaseDate: z.string().nullish()
}).passthrough();

export type ModelPerformance = z.infer<typeof performanceMetricsSchema>;

export async function getModelPerformance(id: string): Promise<ModelPerformance | null> {
  const raw = await request(`/api/_web/models/${encodeURIComponent(id)}/performance?percentile=50`);
  const parsed = z.object({ metrics: performanceMetricsSchema.nullish() }).passthrough().parse(raw);
  return parsed.metrics ?? null;
}

const benchmarkHighlightSchema = z.object({
  benchmarkId: z.string().optional(),
  benchmarkName: z.string().optional(),
  totalModels: z.coerce.number().nullish(),
  rank: z.coerce.number().nullish(),
  score: z.coerce.number().nullish(),
  scoreDisplay: z.string().optional(),
  isPercentage: z.boolean().default(false),
  isSelfReported: z.boolean().default(false),
  otherInfo: z.string().nullish(),
  sourceLink: z.string().nullish()
}).passthrough();

export type ModelBenchmark = z.infer<typeof benchmarkHighlightSchema>;

export async function getModelBenchmarks(id: string): Promise<ModelBenchmark[]> {
  const raw = await request(`/api/_web/models/${encodeURIComponent(id)}/benchmarks`);
  return z.object({ highlights: z.array(benchmarkHighlightSchema).default([]) }).passthrough().parse(raw).highlights;
}

const timelineEventSchema = z.object({
  date: z.string(),
  eventType: z.string().optional(),
  eventName: z.string().optional(),
  description: z.string().optional(),
  modelId: z.string().optional(),
  modelName: z.string().optional()
}).passthrough();

export type ModelTimelineEvent = z.infer<typeof timelineEventSchema>;

export async function getModelTimeline(id: string): Promise<ModelTimelineEvent[]> {
  const raw = await request(`/api/_web/models/${encodeURIComponent(id)}/timeline`);
  return z.object({ events: z.array(timelineEventSchema).default([]) }).passthrough().parse(raw).events;
}

const modelAppSchema = z.object({
  appId: z.string(),
  title: z.string(),
  imageUrl: z.string().nullish(),
  url: z.string().nullish(),
  lastSeen: z.string().nullish(),
  totalRequests: z.coerce.number().default(0),
  successfulRequests: z.coerce.number().default(0),
  totalTokens: z.coerce.number().default(0)
}).passthrough();

export type ModelApp = z.infer<typeof modelAppSchema>;

export async function getModelApps(id: string): Promise<ModelApp[]> {
  const raw = await request(`/api/_web/models/${encodeURIComponent(id)}/apps`);
  return z.object({ apps: z.array(modelAppSchema).default([]) }).passthrough().parse(raw).apps;
}

const activityRowSchema = z.object({
  dayBucket: z.string(),
  requests: z.coerce.number().default(0),
  successRequests: z.coerce.number().default(0),
  failedRequests: z.coerce.number().default(0),
  totalTokens: z.coerce.number().default(0),
  inputTokens: z.coerce.number().default(0),
  outputTokens: z.coerce.number().default(0),
  totalCostNanos: z.coerce.number().default(0),
  avgLatencyMs: z.coerce.number().nullish(),
  avgGenerationMs: z.coerce.number().nullish(),
  avgThroughput: z.coerce.number().nullish()
}).passthrough();

export type ModelActivityRow = z.infer<typeof activityRowSchema>;

export async function getModelActivity(id: string): Promise<ModelActivityRow[]> {
  const raw = await request(`/api/_web/models/${encodeURIComponent(id)}/usage-daily?days=30`);
  return z.object({ rows: z.array(activityRowSchema).default([]) }).passthrough().parse(raw).rows;
}

const subscriptionPlanSchema = z.object({
  plan_id: z.string().optional(),
  plan_uuid: z.string().nullish(),
  name: z.string().optional(),
  description: z.string().nullish(),
  link: z.string().nullish(),
  organisation: z.object({ organisation_id: z.string().optional(), name: z.string().optional() }).passthrough().nullish(),
  prices: z.array(z.object({ price: z.coerce.number(), currency: z.string(), frequency: z.string() }).passthrough()).default([]),
  model_info: z.unknown().nullish()
}).passthrough();

export type ModelSubscription = z.infer<typeof subscriptionPlanSchema>;

export async function getModelSubscriptions(id: string): Promise<ModelSubscription[]> {
  const raw = await request(`/api/_web/models/${encodeURIComponent(id)}/subscription-plans`);
  return z.object({ subscription_plans: z.array(subscriptionPlanSchema).default([]) }).passthrough().parse(raw).subscription_plans;
}

export async function getAccount(path: string, token: string): Promise<unknown> {
  return request(`/api/account${path}`, undefined, token);
}

const mobileNotificationSettingsSchema = z.object({
  newModelReleases: z.boolean(),
  deviceRegistered: z.boolean().optional().default(false)
});

export type MobileNotificationSettings = z.infer<typeof mobileNotificationSettingsSchema>;

export async function getMobileNotificationSettings(token: string, installationId: string): Promise<MobileNotificationSettings> {
  return mobileNotificationSettingsSchema.parse(await request(`/api/account/settings/mobile-notifications?installationId=${encodeURIComponent(installationId)}`, undefined, token));
}

export async function setNewModelNotifications(token: string, enabled: boolean): Promise<void> {
  await request("/api/account/settings/mobile-notifications", { method: "PUT", body: JSON.stringify({ newModelReleases: enabled }) }, token);
}

export async function registerNotificationDevice(token: string, device: { installationId: string; expoPushToken: string; platform: "android" | "ios" }): Promise<void> {
  await request("/api/account/settings/mobile-notifications/devices", { method: "POST", body: JSON.stringify(device) }, token);
}

export async function unregisterNotificationDevice(token: string, installationId: string): Promise<void> {
  await request(`/api/account/settings/mobile-notifications/devices/${encodeURIComponent(installationId)}`, { method: "DELETE" }, token);
}

export async function streamChat(args: { apiKey: string; model: string; messages: { role: string; content: string }[]; signal?: AbortSignal; onDelta(delta: string): void }) {
  const response = await fetch(`${API_ORIGIN}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${args.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: args.model, messages: args.messages, stream: true }),
    signal: args.signal
  });
  if (!response.ok || !response.body) throw new ApiError(response.status, response.status === 401 ? "This API key is invalid." : "The chat request failed.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) args.onDelta(delta);
      }
    }
  }
}
