import { z } from "zod";
import { request } from "./http";

export const MAX_COMPARE = 4;

const num = z.coerce.number().nullish();
const str = z.string().nullish();

const benchmarkResultSchema = z.object({
  benchmark_id: z.string(),
  score: z.union([z.string(), z.number()]).nullish(),
  is_self_reported: z.boolean().nullish(),
  benchmark: z.object({ id: str, name: str, category: str, ascending_order: z.boolean().nullish() }).passthrough().nullish(),
}).passthrough();

const priceSchema = z.object({
  api_provider_id: str,
  api_provider: z.object({ api_provider_name: str }).passthrough().nullish(),
  input_token_price: num,
  output_token_price: num,
}).passthrough();

const comparedModelSchema = z.object({
  id: z.string(),
  name: str,
  status: str,
  release_date: str,
  deprecation_date: str,
  retirement_date: str,
  license: str,
  input_types: z.array(z.string()).nullish(),
  output_types: z.array(z.string()).nullish(),
  input_context_length: num,
  output_context_length: num,
  knowledge_cutoff: str,
  parameter_count: num,
  benchmark_results: z.array(benchmarkResultSchema).nullish(),
  prices: z.array(priceSchema).nullish(),
  provider: z.object({ provider_id: str, name: str }).passthrough().nullish(),
}).passthrough();

export type ComparedModel = z.infer<typeof comparedModelSchema>;

export async function getComparison(ids: string[]): Promise<ComparedModel[]> {
  if (!ids.length) return [];
  const raw = await request("/api/_web/compare/selection", { query: { ids: ids.slice(0, MAX_COMPARE).join(",") } });
  return z.object({ models: z.array(comparedModelSchema).default([]) }).parse(raw).models;
}

const usageSchema = z.record(z.string(), z.object({ tokens30d: num, points30d: z.array(z.object({ date: z.string(), value: z.coerce.number() })).default([]) }).passthrough());

export type CompareUsage = z.infer<typeof usageSchema>;

export async function getComparisonUsage(ids: string[]): Promise<CompareUsage> {
  if (!ids.length) return {};
  const raw = await request("/api/_web/compare/usage", { query: { ids: ids.slice(0, MAX_COMPARE).join(",") } });
  return z.object({ usage: usageSchema.default({}) }).parse(raw).usage;
}
