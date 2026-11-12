import { z } from "zod";
import { request } from "./http";

const num = z.coerce.number().nullish();
const str = z.string().nullish();

const providerSchema = z.object({
  api_provider_id: z.string(),
  api_provider_name: z.string(),
  colour: str,
  country_code: str,
  is_gateway_provider: z.boolean().nullish(),
  provider_status: str,
  byok_available: z.boolean().nullish(),
  prompt_training_policy: str,
  data_policy_tier: str,
  zero_data_retention: z.boolean().nullish(),
  data_retention_days: num,
  privacy_policy_url: str,
  terms_of_service_url: str,
  default_execution_regions: z.array(z.string()).nullish(),
  total_models: z.coerce.number().default(0),
  active_models: z.coerce.number().default(0),
  free_models: z.coerce.number().default(0),
  total_daily_tokens: z.coerce.number().default(0),
  total_monthly_tokens: z.coerce.number().default(0),
  daily_share_pct: z.coerce.number().default(0),
}).passthrough();

export type Provider = z.infer<typeof providerSchema>;

export async function getProviders(): Promise<Provider[]> {
  const raw = await request("/api/_web/api-providers");
  return z.object({ providers: z.array(providerSchema).default([]) }).parse(raw).providers;
}

const path = (id: string, suffix: string) => `/api/_web/api-providers/${encodeURIComponent(id)}${suffix}`;

const providerModelSchema = z.object({
  model_id: z.string(),
  model_name: str,
  api_model_id: str,
  endpoints: z.array(z.string()).nullish(),
  is_active_gateway: z.boolean().nullish(),
  availability_status: str,
  input_modalities: z.array(z.string()).nullish(),
  output_modalities: z.array(z.string()).nullish(),
  release_date: str,
  input_price_per_1m_usd: num,
  output_price_per_1m_usd: num,
  starting_price_usd: num,
  starting_price_unit: str,
}).passthrough();

export type ProviderModel = z.infer<typeof providerModelSchema>;

export async function getProviderModels(id: string): Promise<ProviderModel[]> {
  const raw = await request(path(id, "/models"));
  return z.object({ models: z.array(providerModelSchema).default([]) }).parse(raw).models;
}

const point = z.object({ timestamp: z.string(), requests: num, uptimePct: num, avgLatencyMs: num, avgThroughput: num }).passthrough();

const providerMetricsSchema = z.object({
  summary: z.object({ uptimePct: num, avgLatencyMs: num, avgThroughput: num, requests24h: num }).passthrough(),
  timeseries: z.object({ latency: z.array(point).default([]) }).passthrough().nullish(),
}).passthrough();

export type ProviderMetrics = z.infer<typeof providerMetricsSchema>;

export async function getProviderMetrics(id: string, hours = 24): Promise<ProviderMetrics> {
  return providerMetricsSchema.parse(await request(path(id, "/metrics"), { query: { hours } }));
}
