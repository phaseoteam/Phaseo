// lib/fetchers/models/getModelOverviewHeader.ts
import { createClient } from "@/utils/supabase/client";
import { cacheLife, cacheTag } from "next/cache";
import { applyHiddenFilter } from "./visibility";

export interface ModelOverviewHeader {
	model_id: string;
	name: string;
	organisation_id: string;
	organisation: { name: string; country_code: string }; // not nullable
	family_id?: string; // optional, may be undefined
	hidden?: boolean;
}

export async function fetchModelOverviewHeader(
	modelId: string,
	includeHidden: boolean
): Promise<ModelOverviewHeader> {
	const supabase = await createClient();

	const query = applyHiddenFilter(
		supabase.from("data_models").select(
			`
            model_id,
            name,
            organisation_id,
            hidden,
            organisation:data_organisations!data_models_organisation_id_fkey ( name, country_code ),
			family_id
            `
		),
		includeHidden
	);
	const { data, error } = await query.eq("model_id", modelId).single();

	console.log("[fetch] HIT DB for model header", modelId);

	if (error) throw error;
	if (!data) {
		throw new Error(`Model not found: ${modelId}`);
	}

	const rawOrg = Array.isArray((data as any).organisation)
		? (data as any).organisation[0]
		: (data as any).organisation;

	if (!rawOrg) {
		throw new Error(`Organisation not found for model ${modelId}`);
	}

	return {
		model_id: data.model_id,
		name: data.name,
		organisation_id: data.organisation_id,
		organisation: rawOrg as { name: string; country_code: string },
		family_id: data.family_id || undefined,
		hidden: Boolean((data as any).hidden),
	};
}

// --- Cached wrapper (default export) ---
// capture modelId in both key and tags to retain the per-ID tag
export default async function getModelOverviewHeader(
	modelId: string,
	includeHidden: boolean
): Promise<ModelOverviewHeader> {
	"use cache";

	cacheLife("days");
	cacheTag(`model:header:${modelId}`);

	console.log("[cache] COMPUTE getModelOverviewHeader", modelId);
	return fetchModelOverviewHeader(modelId, includeHidden);
}
