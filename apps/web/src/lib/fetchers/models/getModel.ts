import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";
import { fetchAdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";

export type ModelLink = { url: string; platform?: string | null; kind?: string | null; title?: string | null };
export interface PricingRule { rule_id: string; model_key: string; provider_id: string; api_model_id: string; capability_id: string; pricing_plan: string; meter: string; unit: string; unit_size: number; price_per_unit: string | number; currency: string; priority: number; effective_from: string; effective_to?: string | null; match: any[] }
export interface ModelPage { model_id: string; name: string; organisation_id: string; description?: string | null; hidden?: boolean; status?: string | null; previous_model_id?: string | null; announcement_date?: string | null; release_date?: string | null; deprecation_date?: string | null; retirement_date?: string | null; license?: string | null; input_types?: string | null; output_types?: string | null; family_id?: string | null; timeline?: any; updated_at?: string | null; organisation: { name: string; country_code?: string | null }; model_links: ModelLink[]; model_family?: { display_name: string } | null; model_details: { detail_name: string; detail_value: string | number | null }[]; pricing?: PricingRule[]; benchmark_results: Array<{ id: number; score: string | number; is_self_reported: boolean; other_info: string | null; source_link: string | null; created_at: string; updated_at: string; benchmark: { id: number; name: string; category: string | null; ascending_order: boolean; link: string | null; type?: "percentage" | "numerical" | null } }> }
type ModelStatus = "Rumoured" | "Announced" | "Limited Access" | "Withheld" | "Available" | "Deprecated" | "Retired" | null;
export interface ModelOverviewPage { model_id: string; name: string; organisation_id: string; aliases?: string[]; status: ModelStatus; announcement_date?: string | null; release_date?: string | null; deprecation_date?: string | null; retirement_date?: string | null; license?: string | null; input_types?: string | null; output_types?: string | null; previous_model_id?: string | null; family_id?: string | null; updated_at?: string | null; organisation: { name: string; country_code?: string | null }; model_links: ModelLink[]; model_family?: { display_name: string } | null; model_details: { detail_name: string; detail_value: string | number | null }[]; pricing?: PricingRule[] }

function parseModelKey(modelKey: string) { const first = modelKey.indexOf(":"); const last = modelKey.lastIndexOf(":"); return first > 0 && last > first ? { provider_id: modelKey.slice(0, first), api_model_id: modelKey.slice(first + 1, last), capability_id: modelKey.slice(last + 1) } : null; }
function pricingRules(rows: Array<Record<string, any>>): PricingRule[] { const now = Date.now(); return rows.filter((row) => { const from = row.effective_from ? Date.parse(row.effective_from) : Number.NEGATIVE_INFINITY; const to = row.effective_to ? Date.parse(row.effective_to) : Number.POSITIVE_INFINITY; return now >= from && now < to; }).map((row) => { const parsed = parseModelKey(String(row.model_key ?? "")); return { rule_id: row.rule_id, model_key: row.model_key, provider_id: parsed?.provider_id ?? "", api_model_id: parsed?.api_model_id ?? "", capability_id: row.capability_id ?? parsed?.capability_id ?? "", pricing_plan: row.pricing_plan ?? "standard", meter: row.meter, unit: row.unit ?? "token", unit_size: Number(row.unit_size ?? 1), price_per_unit: row.price_per_unit, currency: row.currency ?? "USD", priority: Number(row.priority ?? 100), effective_from: row.effective_from, effective_to: row.effective_to ?? null, match: row.match ?? [] }; }); }
function normalizeModel<T extends { model_details: { detail_name: string; detail_value: string | number | null }[]; license?: string | null }>(model: T): T { model.model_details ??= []; if (model.license) { model.model_details.push({ detail_name: "license", detail_value: model.license }); model.license = null; } return model; }

export default async function getModel(modelId: string, includeHidden: boolean): Promise<ModelPage> {
	if (includeHidden) { const source = await fetchAdminModelSource(modelId); if (!source.model) throw new Error("Model not found"); const model = normalizeModel(source.model as ModelPage); model.benchmark_results ??= []; model.pricing = pricingRules(source.pricingRules); return model; }
	const [overview, benchmarks, pricing] = await Promise.all([
		fetchOptionalPublicWebApi<{ model: ModelPage }>(`/api/_web/models/${encodeURIComponent(modelId)}`),
		fetchOptionalPublicWebApi<{ results: ModelPage["benchmark_results"] }>(`/api/_web/models/${encodeURIComponent(modelId)}/benchmarks`),
		fetchOptionalPublicWebApi<{ pricing_rules: Array<Record<string, any>> }>(`/api/_web/models/${encodeURIComponent(modelId)}/pricing?shape=source`),
	]);
	if (!overview?.model) throw new Error("Model not found"); const model = normalizeModel(overview.model); model.benchmark_results = benchmarks?.results ?? []; model.pricing = pricingRules(pricing?.pricing_rules ?? []); return model;
}

export async function getModelOverview(modelId: string, includeHidden: boolean): Promise<ModelOverviewPage | null> {
	if (includeHidden) { const source = await fetchAdminModelSource(modelId); return source.model ? normalizeModel(source.model as ModelOverviewPage) : null; }
	const payload = await fetchOptionalPublicWebApi<{ model: ModelOverviewPage }>(`/api/_web/models/${encodeURIComponent(modelId)}`); return payload?.model ? normalizeModel(payload.model) : null;
}

export async function getModelCached(modelId: string, includeHidden: boolean): Promise<ModelPage> { return getModel(modelId, includeHidden); }
export async function getModelOverviewCached(modelId: string, includeHidden: boolean): Promise<ModelOverviewPage | null> { return getModelOverview(modelId, includeHidden); }
