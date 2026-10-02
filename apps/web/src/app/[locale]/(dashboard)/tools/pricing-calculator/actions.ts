"use server";

import { fetchFrontendPricingModels } from "@/lib/fetchers/frontend/fetchFrontendPricingModels";

export async function loadPricingCalculatorModels(modelIds: string[]) {
	const ids = [...new Set(
		modelIds.map((value) => value.trim()).filter(Boolean),
	)].slice(0, 100);
	if (ids.length === 0) return [];
	return fetchFrontendPricingModels(ids);
}
