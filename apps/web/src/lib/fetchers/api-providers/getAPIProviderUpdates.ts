import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type APIProviderUpdateOrganisation = {
	name?: string | null;
	organisation_id?: string | null;
};

export type APIProviderUpdateModelRelation = {
	name?: string | null;
	organisation_id?: string | null;
	release_date?: string | null;
	announcement_date?: string | null;
	organisation?: APIProviderUpdateOrganisation | APIProviderUpdateOrganisation[] | null;
};

export type APIProviderRecentModel = {
	model_id: string;
	api_model_id: string;
	created_at: string;
	is_active_gateway: boolean;
	data_models?: APIProviderUpdateModelRelation | APIProviderUpdateModelRelation[] | null;
};

export type APIProviderUpdates = {
	newModels: APIProviderRecentModel[];
	recentModels: APIProviderRecentModel[];
	recentTokens: number;
};

type LifecycleDateInfo = {
	date: string | null;
	label: "Released" | "Announced" | null;
};

function toSortableDateMs(value?: string | null): number {
	if (!value) return Number.NEGATIVE_INFINITY;
	const parsed = new Date(value).getTime();
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function getLifecycleDateInfo(model: APIProviderRecentModel): LifecycleDateInfo {
	const relatedModel = Array.isArray(model.data_models)
		? model.data_models[0] ?? null
		: model.data_models ?? null;

	if (relatedModel?.release_date) {
		return { date: relatedModel.release_date, label: "Released" };
	}

	if (relatedModel?.announcement_date) {
		return { date: relatedModel.announcement_date, label: "Announced" };
	}

	return { date: null, label: null };
}

function isoSevenDaysAgo(from = new Date()): string {
	const d = new Date(from);
	d.setUTCDate(d.getUTCDate() - 7);
	return d.toISOString();
}

async function getRecentModels(
	apiProviderId: string,
	opts?: { sinceTs?: string; limit?: number },
): Promise<APIProviderRecentModel[]> {
	const supabase = createAdminClient();
	const limit = opts?.limit ?? 5;

	const { data: providerModels, error } = await supabase
		.from("data_api_provider_models")
		.select("model_id, api_model_id, created_at, is_active_gateway")
		.eq("provider_id", apiProviderId);

	if (error) {
		throw error;
	}

	const modelIds = Array.from(
		new Set((providerModels ?? []).map((row) => row.model_id).filter(Boolean)),
	);
	const { data: models } = await supabase
		.from("data_models")
		.select(
			"model_id, name, organisation_id, release_date, announcement_date, organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)",
		)
		.in("model_id", modelIds);

	const modelMap = new Map<string, APIProviderUpdateModelRelation>();
	for (const model of models ?? []) {
		if (!model.model_id) continue;
		modelMap.set(model.model_id, {
			name: model.name ?? null,
			organisation_id: model.organisation_id ?? null,
			release_date: model.release_date ?? null,
			announcement_date: model.announcement_date ?? null,
			organisation: model.organisation ?? null,
		});
	}

	const mergedByModelId = new Map<string, APIProviderRecentModel>();
	for (const row of providerModels ?? []) {
		const modelKey = row.model_id ?? row.api_model_id;
		if (!modelKey) continue;

		const nextModel: APIProviderRecentModel = {
			model_id: row.model_id ?? row.api_model_id,
			api_model_id: row.api_model_id,
			created_at: row.created_at,
			is_active_gateway: Boolean(row.is_active_gateway),
			data_models: row.model_id ? modelMap.get(row.model_id) ?? null : null,
		};

		const existing = mergedByModelId.get(modelKey);
		if (!existing) {
			mergedByModelId.set(modelKey, nextModel);
			continue;
		}

		const existingCreatedAtMs = toSortableDateMs(existing.created_at);
		const nextCreatedAtMs = toSortableDateMs(nextModel.created_at);
		if (nextCreatedAtMs > existingCreatedAtMs) {
			existing.created_at = nextModel.created_at;
			existing.api_model_id = nextModel.api_model_id;
		}
		existing.is_active_gateway =
			existing.is_active_gateway || nextModel.is_active_gateway;
		if (!existing.data_models && nextModel.data_models) {
			existing.data_models = nextModel.data_models;
		}
	}

	const modelsByLifecycleDate = Array.from(mergedByModelId.values())
		.filter((model) => {
			if (!opts?.sinceTs) return true;
			return (
				toSortableDateMs(getLifecycleDateInfo(model).date) >=
				toSortableDateMs(opts.sinceTs)
			);
		})
		.sort((a, b) => {
			const aLifecycleMs = toSortableDateMs(getLifecycleDateInfo(a).date);
			const bLifecycleMs = toSortableDateMs(getLifecycleDateInfo(b).date);
			if (aLifecycleMs !== bLifecycleMs) {
				return bLifecycleMs - aLifecycleMs;
			}

			const aCreatedAtMs = toSortableDateMs(a.created_at);
			const bCreatedAtMs = toSortableDateMs(b.created_at);
			if (aCreatedAtMs !== bCreatedAtMs) {
				return bCreatedAtMs - aCreatedAtMs;
			}

			return a.model_id.localeCompare(b.model_id);
		});

	return modelsByLifecycleDate.slice(0, limit);
}

async function getRecentTokenCount(
	apiProviderId: string,
	sinceTs: string,
): Promise<number> {
	const supabase = createAdminClient();
	const { data, error } = await supabase.rpc("get_provider_token_usage", {
		provider_id: apiProviderId,
		since_ts: sinceTs,
	});

	if (error) {
		throw error;
	}

	const row = (data && data[0]) || null;
	return Number(row?.total_tokens ?? 0);
}

export async function getAPIProviderUpdates(
	apiProviderId: string,
): Promise<APIProviderUpdates> {
	const now = new Date();
	const sinceTs = isoSevenDaysAgo(now);

	const [recentModels, newModels, recentTokens] = await Promise.all([
		getRecentModels(apiProviderId, { limit: 5 }),
		getRecentModels(apiProviderId, { sinceTs, limit: 5 }),
		getRecentTokenCount(apiProviderId, sinceTs),
	]);

	return { newModels, recentModels, recentTokens };
}

export async function getAPIProviderUpdatesCached(
	apiProviderId: string,
): Promise<APIProviderUpdates> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("frontend:api-provider-updates");
	cacheTag("data:api_providers");
	cacheTag(`data:api_providers:${apiProviderId}`);

	return getAPIProviderUpdates(apiProviderId);
}
