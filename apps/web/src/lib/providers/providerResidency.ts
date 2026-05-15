export type ResidencyMode =
	| "unknown"
	| "provider_managed"
	| "customer_selectable"
	| "account_selected";

export type ZeroDataRetentionMode =
	| "unknown"
	| "unsupported"
	| "optional"
	| "default";

export type ProviderResidencyMetadata = {
	residencyMode: ResidencyMode | null;
	executionRegions: string[] | null;
	dataRegions: string[] | null;
	zeroDataRetention: ZeroDataRetentionMode | null;
	residencyNotes: string | null;
	residencySourceUrl: string | null;
};
