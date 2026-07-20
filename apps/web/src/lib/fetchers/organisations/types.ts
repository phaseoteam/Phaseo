import type { ModelCard } from "@/lib/fetchers/models/getAllModels";

export interface OrganisationModelCards extends ModelCard {
	status: string | null;
}

export interface OrganisationOverview {
	organisation_id: string;
	name: string;
	country_code: string | null;
	description: string | null;
	colour: string | null;
	updated_at?: string | null;
	organisation_links: { platform: string; url: string }[];
	recent_models: OrganisationModelCards[];
}

export interface OrganisationModelsGrouped {
	[status: string]: OrganisationModelCards[];
}

export type OrganisationData = OrganisationOverview & {
	models: OrganisationModelsGrouped;
};

export interface OrganisationOverviewHeader {
	organisation_id: string;
	name: string;
	country_code: string | null;
}
