export type FreeRouterModelUsage = {
	requests30d: number;
	totalCostNanos30d: number;
	lastRoutedAt: string | null;
};

export type FreeRouterOverview = {
	summary: {
		eligibleModels: number;
		eligibleProviders: number;
		routedRequests30d: number;
		totalCostNanos30d: number;
	};
	models: Array<{
		modelId: string;
		displayApiModelId: string;
		name: string;
		organisationId: string;
		organisationName: string;
		providerCount: number;
		inputModalities: string[];
		outputModalities: string[];
		usage: FreeRouterModelUsage;
	}>;
};
