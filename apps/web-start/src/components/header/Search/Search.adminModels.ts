import type { ModelsPageModel } from "@/components/(data)/models/Models/modelsDisplay.types";
import type { SearchData, SearchableModel } from "@/lib/fetchers/search/types";

export function mergeAdminSearchModels(publicData: SearchData | undefined, internalModels: ModelsPageModel[]): SearchData | undefined {
	if (!publicData || internalModels.length === 0) return publicData;
	const publicIds = new Set(publicData.models.map((model) => model.id));
	const internalIds = new Set(internalModels.map((model) => model.model_id));
	const models: SearchableModel[] = internalModels.filter((model) => !publicIds.has(model.model_id)).map((model) => ({
		id: model.model_id,
		title: model.name,
		subtitle: model.organisation_name ?? null,
		href: `/models/${model.model_id}`,
		logoId: model.organisation_id,
		releaseGroupLabel: null,
		persistable: false,
	}));
	return { ...publicData, models: [
		...publicData.models.map((model) => internalIds.has(model.id) ? { ...model, persistable: false } : model),
		...models,
	] };
}
