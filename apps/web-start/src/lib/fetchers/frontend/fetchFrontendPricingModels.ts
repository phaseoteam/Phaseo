import type { PricingModel } from "@/lib/fetchers/pricing/getPricingModels";
import { fetchPublicWebApi } from "@/lib/web-api/client";

export async function fetchFrontendPricingModels(
	modelIds: string[] = [],
): Promise<PricingModel[]> {
	const ids = [...new Set(modelIds.map((value) => value.trim()).filter(Boolean))];
	const query = ids.length > 0
		? `?model_ids=${encodeURIComponent(ids.join(","))}`
		: "";
	const models = (await fetchPublicWebApi<{ models: PricingModel[] }>(
		`/api/_web/pricing/models${query}`,
	)).models;
	if (ids.length === 0) return models;
	const requested = new Set(ids);
	return models.filter((model) => requested.has(model.model));
}
