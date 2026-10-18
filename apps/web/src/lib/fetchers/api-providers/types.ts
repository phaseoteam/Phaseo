export type APIProviderHeader = {
	api_provider_id: string;
	api_provider_name: string;
	country_code: string | null;
	subdivision_code: string | null;
	retirement_notice?: string | null;
	successor_provider_id?: string | null;
	successor_provider_name?: string | null;
};
