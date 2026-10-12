import type { ModelOption } from "../../shared/workspace";

export type ModelFilters = { organisation: string; free: boolean; new: boolean; favorites: boolean };
export const emptyModelFilters: ModelFilters = { organisation: "", free: false, new: false, favorites: false };
export const modelOrganisation = (model: ModelOption) => model.organisationId ?? (model.id.includes("/") ? model.id.split("/")[0] : "");

export function filterModels(models: ModelOption[], query: string, filters: ModelFilters, favorites: string[], now = Date.now()) {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	return models.filter(model => {
		const released = Date.parse(model.releaseDate ?? "");
		const text = `${model.id} ${model.name} ${model.organisationName ?? ""}`.toLowerCase();
		return terms.every(term => text.includes(term))
			&& (!filters.organisation || modelOrganisation(model) === filters.organisation)
			&& (!filters.free || model.id.endsWith(":free"))
			&& (!filters.new || (Number.isFinite(released) && released <= now && now - released <= 14 * 24 * 60 * 60 * 1000))
			&& (!filters.favorites || favorites.includes(model.id));
	});
}
