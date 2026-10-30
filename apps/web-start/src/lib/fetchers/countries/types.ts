import type { ModelCard } from "@/lib/fetchers/models/getAllModels";

export interface CountryOrganisationSummary {
	organisation_id: string;
	organisation_name: string | null;
	colour: string | null;
	models: ModelCard[];
	modelCount: number;
	latestModel: ModelCard | null;
}

export interface CountrySummary {
	iso: string;
	countryName: string;
	totalOrganisations: number;
	totalModels: number;
	recentModels: ModelCard[];
	latestModel: ModelCard | null;
	organisations: CountryOrganisationSummary[];
}

export type CountryListSummary = Pick<
	CountrySummary,
	"iso" | "countryName" | "totalOrganisations" | "totalModels"
>;
