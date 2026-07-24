export type ProviderRoutingStatus = {
	providerId: string;
	deranked: boolean;
	recovering: boolean;
	openCount: number;
	halfOpenCount: number;
	checkedPairs: number;
};

export type ProviderRoutingStatusMap = Record<string, ProviderRoutingStatus>;
