export interface SupportedModelsStats {
	modelsCount: number;
	orgsCount: number;
	apiCount: number;
	recentCount: number;
}

export interface SignInModel {
	model_id: string;
	name: string;
	release_date?: string | number;
	data_organisations: {
		organisation_id: string;
		name: string;
		colour?: string;
	};
}
