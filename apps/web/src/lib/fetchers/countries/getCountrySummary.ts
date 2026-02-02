import {
	CountrySummary,
	getCountrySummariesCached,
} from "@/lib/fetchers/countries/getCountrySummaries";
import { ModelCard } from "@/lib/fetchers/models/getAllModels";
import { ModelEvent } from "@/lib/fetchers/updates/getModelUpdates";

export function normaliseIso(isoInput: string | undefined) {
	if (typeof isoInput !== "string") return "";
	const trimmed = isoInput.trim();
	return trimmed ? trimmed.toUpperCase() : "";
}

export async function getCountrySummaryByIso(
	isoInput: string | undefined,
	includeHidden: boolean
): Promise<CountrySummary | undefined> {
	const iso = normaliseIso(isoInput);
	if (!iso) return undefined;

	const summaries = await getCountrySummariesCached(includeHidden);
	return summaries.find((entry) => entry.iso === iso);
}

export function getUniqueCountryModels(
	country: CountrySummary | undefined
): ModelCard[] {
	if (!country) return [];

	const seen = new Set<string>();
	const models = country.organisations
		.flatMap((organisation) => organisation.models)
		.filter((model) => {
			if (seen.has(model.model_id)) return false;
			seen.add(model.model_id);
			return true;
		})
		.sort(
			(a, b) => (b.primary_timestamp ?? 0) - (a.primary_timestamp ?? 0)
		);

	return models;
}

export function buildCountryModelEvents(
	country: CountrySummary | undefined
): ModelEvent[] {
	const models = getUniqueCountryModels(country);
	const events: ModelEvent[] = [];

	for (const model of models) {
		const organisation = {
			organisation_id: model.organisation_id,
			name: model.organisation_name,
			colour: model.organisation_colour,
		};

		const base = {
			model_id: model.model_id,
			name: model.name,
			organisation_id: model.organisation_id,
			organisation,
		};

		if (model.release_date) {
			const parsed = new Date(model.release_date);
			if (!Number.isNaN(parsed.getTime())) {
				events.push({
					model: base,
					types: ["Released"],
					date: parsed.toISOString(),
				});
			}
		}

		if (model.announcement_date) {
			const parsed = new Date(model.announcement_date);
			if (!Number.isNaN(parsed.getTime())) {
				events.push({
					model: base,
					types: ["Announced"],
					date: parsed.toISOString(),
				});
			}
		}
	}

	return events.sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
	);
}
