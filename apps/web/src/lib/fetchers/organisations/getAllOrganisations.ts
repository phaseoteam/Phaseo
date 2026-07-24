// lib/fetchers/organisations/getAllOrganisations.ts
export interface OrganisationCard {
    organisation_id: string;
    organisation_name: string | null;
    country_code: string | null;
    colour: string | null;
}
