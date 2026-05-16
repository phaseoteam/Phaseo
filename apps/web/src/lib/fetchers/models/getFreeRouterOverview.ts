import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { FREE_ROUTER_MODEL_ID } from "@/lib/models/freeRouter";
import { normalizeOrganisationDisplayName } from "@/lib/models/organisationDisplay";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

type PricingRuleRow = {
	model_key?: string | null;
	effective_from?: string | null;
	effective_to?: string | null;
};

type ProviderModelRow = {
	provider_id?: string | null;
	api_model_id?: string | null;
	model_id?: string | null;
	input_modalities?: string[] | string | null;
	output_modalities?: string[] | string | null;
	is_active_gateway?: boolean | null;
	effective_from?: string | null;
	effective_to?: string | null;
};

type DataModelRow = {
	model_id?: string | null;
	name?: string | null;
	organisation_id?: string | null;
	status?: string | null;
	hidden?: boolean | null;
	input_types?: string[] | string | null;
	output_types?: string[] | string | null;
	organisation?:
		| {
				name?: string | null;
				colour?: string | null;
		  }
		| {
				name?: string | null;
				colour?: string | null;
		  }[]
		| null;
};

type GatewayRequestUsageRow = {
	routed_model_id?: string | null;
	cost_nanos?: number | string | null;
	created_at?: string | null;
};

type FreeRouterModelUsage = {
	requests30d: number;
	totalCostNanos30d: number;
	lastRoutedAt: string | null;
};

export type FreeRouterOverview = {
	summary: {
		eligibleModels: number;
		eligibleProviders: number;
		routedRequests30d: number;
		totalCostNanos30d: number;
	};
	models: Array<{
		modelId: string;
		displayApiModelId: string;
		name: string;
		organisationId: string;
		organisationName: string;
		providerCount: number;
		inputModalities: string[];
		outputModalities: string[];
		usage: FreeRouterModelUsage;
	}>;
};

function parseModelKey(modelKey: string | null | undefined): {
	providerId: string;
	apiModelId: string;
} | null {
	if (!modelKey) return null;
	const parts = String(modelKey).split(":");
	if (parts.length < 3) return null;
	const providerId = parts.shift() ?? "";
	const apiModelId = parts.slice(0, -1).join(":");
	if (!providerId || !apiModelId) return null;
	return { providerId, apiModelId };
}

function isFreePricingRule(row: PricingRuleRow): boolean {
	return String(row.model_key ?? "").toLowerCase().includes(":free:");
}

function isWithinWindow(
	effectiveFrom: string | null | undefined,
	effectiveTo: string | null | undefined,
	nowMs: number,
): boolean {
	const fromMs = effectiveFrom
		? new Date(effectiveFrom).getTime()
		: Number.NEGATIVE_INFINITY;
	const toMs = effectiveTo
		? new Date(effectiveTo).getTime()
		: Number.POSITIVE_INFINITY;
	return nowMs >= fromMs && nowMs < toMs;
}

function parseModalities(raw: string[] | string | null | undefined): string[] {
	if (Array.isArray(raw)) {
		return raw.map((value) => String(value ?? "").trim()).filter(Boolean);
	}
	if (typeof raw === "string") {
		return raw
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean);
	}
	return [];
}

function uniqueSorted(values: Iterable<string>): string[] {
	return Array.from(new Set(Array.from(values).filter(Boolean))).sort((a, b) =>
		a.localeCompare(b),
	);
}

function toSafeNumber(value: unknown): number {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchAllPricingRules(
	client: ReturnType<typeof createAdminClient>,
): Promise<PricingRuleRow[]> {
	const rows: PricingRuleRow[] = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await client
			.from("data_api_pricing_rules")
			.select("model_key,effective_from,effective_to")
			.range(offset, offset + PAGE_SIZE - 1);
		if (error) throw new Error(error.message);
		const page = (data ?? []) as PricingRuleRow[];
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	return rows;
}

async function fetchAllProviderModels(
	client: ReturnType<typeof createAdminClient>,
): Promise<ProviderModelRow[]> {
	const rows: ProviderModelRow[] = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await client
			.from("data_api_provider_models")
			.select(
				"provider_id,api_model_id,model_id,input_modalities,output_modalities,is_active_gateway,effective_from,effective_to",
			)
			.range(offset, offset + PAGE_SIZE - 1);
		if (error) throw new Error(error.message);
		const page = (data ?? []) as ProviderModelRow[];
		rows.push(...page);
		if (page.length < PAGE_SIZE) break;
	}
	return rows;
}

async function fetchUsageByModel(args: {
	client: ReturnType<typeof createAdminClient>;
	modelIds: string[];
}): Promise<Map<string, FreeRouterModelUsage>> {
	const usageByModel = new Map<string, FreeRouterModelUsage>();
	if (!args.modelIds.length) return usageByModel;

	const sinceIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

	try {
		for (let offset = 0; ; offset += PAGE_SIZE) {
			const { data, error } = await args.client
				.from("gateway_requests")
				.select("routed_model_id,cost_nanos,created_at")
				.eq("requested_model_id", FREE_ROUTER_MODEL_ID)
				.in("routed_model_id", args.modelIds)
				.gte("created_at", sinceIso)
				.order("created_at", { ascending: false })
				.range(offset, offset + PAGE_SIZE - 1);

			if (error) {
				console.warn(
					"[getFreeRouterOverview] failed to load routed usage; returning zeroed usage.",
					error.message,
				);
				return new Map<string, FreeRouterModelUsage>();
			}

			const rows = (data ?? []) as GatewayRequestUsageRow[];
			if (!rows.length) break;

			for (const row of rows) {
				const modelId = String(row.routed_model_id ?? "").trim();
				if (!modelId) continue;
				const current = usageByModel.get(modelId) ?? {
					requests30d: 0,
					totalCostNanos30d: 0,
					lastRoutedAt: null,
				};
				current.requests30d += 1;
				current.totalCostNanos30d += Math.max(0, Math.round(toSafeNumber(row.cost_nanos)));
				if (!current.lastRoutedAt && row.created_at) {
					current.lastRoutedAt = row.created_at;
				}
				usageByModel.set(modelId, current);
			}

			if (rows.length < PAGE_SIZE) break;
		}
	} catch (error) {
		console.warn(
			"[getFreeRouterOverview] failed to aggregate routed usage; returning zeroed usage.",
			error instanceof Error ? error.message : String(error),
		);
	}

	return usageByModel;
}

export async function getFreeRouterOverview(): Promise<FreeRouterOverview> {
	"use cache";

	cacheLife("days");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:data_models");
	cacheTag("data:gateway_requests");

	let supabase: ReturnType<typeof createAdminClient> | null = null;
	try {
		supabase = createAdminClient();
	} catch (error) {
		console.warn(
			"[getFreeRouterOverview] admin client unavailable; returning empty overview.",
			error instanceof Error ? error.message : String(error),
		);
		return {
			summary: {
				eligibleModels: 0,
				eligibleProviders: 0,
				routedRequests30d: 0,
				totalCostNanos30d: 0,
			},
			models: [],
		};
	}

	const nowMs = Date.now();

	const [pricingRules, providerModels] = await Promise.all([
		fetchAllPricingRules(supabase),
		fetchAllProviderModels(supabase),
	]);

	const freeApiModelsByProvider = new Map<string, Set<string>>();
	for (const rule of pricingRules) {
		if (!isFreePricingRule(rule)) continue;
		if (!isWithinWindow(rule.effective_from, rule.effective_to, nowMs)) continue;
		const parsed = parseModelKey(rule.model_key ?? null);
		if (!parsed) continue;
		const existing = freeApiModelsByProvider.get(parsed.providerId) ?? new Set<string>();
		existing.add(parsed.apiModelId);
		freeApiModelsByProvider.set(parsed.providerId, existing);
	}

	const eligible = new Map<
		string,
		{
			modelId: string;
			apiModelIds: Set<string>;
			providerIds: Set<string>;
			inputModalities: Set<string>;
			outputModalities: Set<string>;
		}
	>();

	for (const row of providerModels) {
		const providerId = String(row.provider_id ?? "").trim();
		const apiModelId = String(row.api_model_id ?? "").trim();
		const modelId = String(row.model_id ?? apiModelId).trim();
		if (!providerId || !apiModelId || !modelId) continue;
		if (!row.is_active_gateway) continue;
		if (!isWithinWindow(row.effective_from, row.effective_to, nowMs)) continue;
		if (!freeApiModelsByProvider.get(providerId)?.has(apiModelId)) continue;

		const current = eligible.get(modelId) ?? {
			modelId,
			apiModelIds: new Set<string>(),
			providerIds: new Set<string>(),
			inputModalities: new Set<string>(),
			outputModalities: new Set<string>(),
		};
		current.apiModelIds.add(apiModelId);
		current.providerIds.add(providerId);
		for (const value of parseModalities(row.input_modalities)) {
			current.inputModalities.add(value);
		}
		for (const value of parseModalities(row.output_modalities)) {
			current.outputModalities.add(value);
		}
		eligible.set(modelId, current);
	}

	const eligibleModelIds = Array.from(eligible.keys());
	if (!eligibleModelIds.length) {
		return {
			summary: {
				eligibleModels: 0,
				eligibleProviders: 0,
				routedRequests30d: 0,
				totalCostNanos30d: 0,
			},
			models: [],
		};
	}

	const [dataModelsRes, usageByModel] = await Promise.all([
		supabase
			.from("data_models")
			.select(
				"model_id,name,organisation_id,status,hidden,input_types,output_types,organisation:data_organisations(name,colour)",
			)
			.in("model_id", eligibleModelIds),
		fetchUsageByModel({ client: supabase, modelIds: eligibleModelIds }),
	]);

	if (dataModelsRes.error) {
		throw new Error(dataModelsRes.error.message);
	}

	const dataModelById = new Map<string, DataModelRow>();
	for (const row of (dataModelsRes.data ?? []) as DataModelRow[]) {
		const modelId = String(row.model_id ?? "").trim();
		if (!modelId) continue;
		if (row.hidden) continue;
		dataModelById.set(modelId, row);
	}

	const models = eligibleModelIds
		.map((modelId) => {
			const meta = eligible.get(modelId);
			if (!meta) return null;
			const row = dataModelById.get(modelId);
			const organisationValue = Array.isArray(row?.organisation)
				? row?.organisation?.[0] ?? null
				: row?.organisation ?? null;
			const organisationId = String(row?.organisation_id ?? "").trim();
			const usage = usageByModel.get(modelId) ?? {
				requests30d: 0,
				totalCostNanos30d: 0,
				lastRoutedAt: null,
			};

			return {
				modelId,
				displayApiModelId:
					meta.apiModelIds.size === 1
						? Array.from(meta.apiModelIds)[0] ?? modelId
						: modelId,
				name: String(row?.name ?? modelId).trim() || modelId,
				organisationId,
				organisationName:
					normalizeOrganisationDisplayName(
						organisationValue?.name ?? null,
						organisationId,
					) ??
					organisationId ??
					"Unknown",
				providerCount: meta.providerIds.size,
				inputModalities:
					uniqueSorted(meta.inputModalities).length > 0
						? uniqueSorted(meta.inputModalities)
						: parseModalities(row?.input_types),
				outputModalities:
					uniqueSorted(meta.outputModalities).length > 0
						? uniqueSorted(meta.outputModalities)
						: parseModalities(row?.output_types),
				usage,
			};
		})
		.filter((value): value is NonNullable<typeof value> => value !== null)
		.sort((a, b) => {
			if (b.usage.requests30d !== a.usage.requests30d) {
				return b.usage.requests30d - a.usage.requests30d;
			}
			return a.modelId.localeCompare(b.modelId);
		});

	const providerIds = new Set<string>();
	for (const model of eligible.values()) {
		for (const providerId of model.providerIds) providerIds.add(providerId);
	}

	return {
		summary: {
			eligibleModels: models.length,
			eligibleProviders: providerIds.size,
			routedRequests30d: models.reduce(
				(sum, model) => sum + model.usage.requests30d,
				0,
			),
			totalCostNanos30d: models.reduce(
				(sum, model) => sum + model.usage.totalCostNanos30d,
				0,
			),
		},
		models,
	};
}
