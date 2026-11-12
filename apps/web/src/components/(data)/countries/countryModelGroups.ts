import type { ModelCard } from "@/lib/fetchers/models/getAllModels";

// Country pages render this many models per organisation; the rest load on demand.
export const COUNTRY_MODELS_PREVIEW_PER_ORGANISATION = 6;

export type CountryModelGroup = {
	id: string;
	name: string;
	models: ModelCard[];
};

/** Groups models by organisation (A–Z), newest model first within each group. */
export function groupCountryModels(
	models: ModelCard[],
	unknownOrganisationLabel: string,
): CountryModelGroup[] {
	const byOrganisation = new Map<string, CountryModelGroup>();
	for (const model of models) {
		const id = model.organisation_id || "unknown";
		const name = model.organisation_name || unknownOrganisationLabel;
		const group = byOrganisation.get(id) ?? { id, name, models: [] };
		group.models.push(model);
		byOrganisation.set(id, group);
	}

	return Array.from(byOrganisation.values())
		.map((group) => ({
			...group,
			models: [...group.models].sort(
				(a, b) => (b.primary_timestamp ?? 0) - (a.primary_timestamp ?? 0),
			),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The first models of each group, in display order, for the server render. */
export function previewCountryModels(groups: CountryModelGroup[]): ModelCard[] {
	return groups.flatMap((group) =>
		group.models.slice(0, COUNTRY_MODELS_PREVIEW_PER_ORGANISATION),
	);
}
