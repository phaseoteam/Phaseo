"use server";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import type { ModelCard } from "@/lib/fetchers/models/getAllModels";
import { mapRawToModelCard } from "@/lib/fetchers/models/getAllModels";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

const MODEL_SELECT = `
    model_id,
    name,
    status,
    organisation_id,
    hidden,
    release_date,
    announcement_date,
    input_types,
    output_types,
    organisation: data_organisations (name, colour)
`;

export async function getModelCardsByIds(
	modelIds: string[],
	includeHidden: boolean
): Promise<ModelCard[]> {
	if (!modelIds.length) return [];
	const supabase = createAdminClient();
	const { data, error } = await applyHiddenFilter(
		supabase.from("data_models").select(MODEL_SELECT),
		includeHidden
	).in("model_id", modelIds);

	if (error) {
		// eslint-disable-next-line no-console
		console.warn("[getModelCardsByIds] supabase error", error.message);
		return [];
	}

	const mapped = (data ?? [])
		.map((raw: any) => mapRawToModelCard(raw) as ModelCard)
		.filter((m: ModelCard) => Boolean(m.model_id));

	const byId = new Map(mapped.map((item: ModelCard) => [item.model_id, item]));
	return modelIds.map((id) => byId.get(id)).filter(Boolean) as ModelCard[];
}

export async function getModelCardsByIdsCached(
	modelIds: string[],
	includeHidden: boolean
): Promise<ModelCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("data:models");
	cacheTag("frontend:models");

	return getModelCardsByIds(modelIds, includeHidden);
}
