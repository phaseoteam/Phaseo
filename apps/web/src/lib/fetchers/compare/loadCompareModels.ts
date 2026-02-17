import { cacheLife, cacheTag } from "next/cache";

import type { ExtendedModel, Provider } from "@/data/types";
import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

interface DbSimpleModel {
	model_id: string;
	name: string;
	organisation_id: string;
	status: string | null;
	announcement_date: string | null;
	release_date: string | null;
	deprecation_date: string | null;
	retirement_date: string | null;
	input_types: string | null;
	output_types: string | null;
	organisation: {
		organisation_id: string;
		name: string;
	};
}

export async function loadCompareModels(
    includeHidden: boolean
): Promise<ExtendedModel[]> {
	const supabase = await createClient();
	console.log("[loadCompareModels] Querying data_models");

	const { data: models, error } = await applyHiddenFilter(
		supabase
			.from("data_models")
			.select(`
            model_id,
            name,
            organisation_id,
            status,
            announcement_date,
            release_date,
            deprecation_date,
            retirement_date,
            input_types,
            output_types,
            organisation: data_organisations!data_models_organisation_id_fkey(
                organisation_id,
                name
            )
        `)
			.order("name", { ascending: true }),
		includeHidden
	);

	if (error) {
		console.error("[loadCompareModels] Database error:", error);
		throw new Error(`Failed to load models: ${error.message}`);
	}

	if (!models || models.length === 0) {
		console.warn("[loadCompareModels] No models found in database");
		return [];
	}

	const extendedModels: ExtendedModel[] = models.map((model: any) => {
		const dbModel = model as DbSimpleModel;

		const provider: Provider = {
			provider_id: dbModel.organisation.organisation_id,
			name: dbModel.organisation.name,
			website: null,
			country_code: null,
			description: null,
			colour: null,
			socials: [],
		};

		return {
			id: dbModel.model_id,
			name: dbModel.name,
			status: dbModel.status ?? null,
			previous_model_id: null,
			description: null,
			announced_date: dbModel.announcement_date ?? null,
			release_date: dbModel.release_date ?? null,
			deprecation_date: dbModel.deprecation_date ?? null,
			retirement_date: dbModel.retirement_date ?? null,
			open_router_model_id: null,
			input_context_length: null,
			output_context_length: null,
			license: null,
			multimodal: null,
			input_types: dbModel.input_types,
			output_types: dbModel.output_types,
			web_access: null,
			reasoning: null,
			fine_tunable: null,
			knowledge_cutoff: null,
			api_reference_link: null,
			paper_link: null,
			announcement_link: null,
			repository_link: null,
			weights_link: null,
			parameter_count: null,
			training_tokens: null,
			benchmark_results: null,
			prices: null,
			provider,
			model_details: null,
		};
	});

	console.log("[loadCompareModels] Returning models", extendedModels.length);
	return extendedModels;
}

export async function loadCompareModelsCached(
    includeHidden: boolean
): Promise<ExtendedModel[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:models");

	console.log("[compare] HIT DB for compare models");
	return loadCompareModels(includeHidden);
}
