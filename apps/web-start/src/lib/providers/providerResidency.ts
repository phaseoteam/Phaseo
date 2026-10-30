export type ResidencyMode =
	| "unknown"
	| "provider_managed"
	| "customer_selectable"
	| "account_selected";

export type ZeroDataRetentionMode = boolean;

export type ProviderResidencyMetadata = {
	residencyMode: ResidencyMode | null;
	executionRegions: string[] | null;
	dataRegions: string[] | null;
	zeroDataRetention: ZeroDataRetentionMode | null;
	residencyNotes: string | null;
	residencySourceUrl: string | null;
};
