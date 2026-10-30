import type { APIProviderCard } from "@/lib/fetchers/api-providers/providerDataTypes";

export type ProviderCoverageFilter = "active" | "free" | "inactive";

export type ProviderPolicyFilter =
	| "byok"
	| "privacy"
	| "terms"
	| "training:no_train"
	| "training:may_train"
	| "training:opt_out_available"
	| "training:enterprise_no_train"
	| "training:unknown"
	| "data_policy:private"
	| "data_policy:logs"
	| "data_policy:trains"
	| "data_policy:unknown"
	| "zdr:true"
	| "zdr:false"
	| "retention:none"
	| "retention:published"
	| "retention:zdr"
	| "retention:unknown";

export function toggleProviderCoverage(
	values: string[],
	value: string,
): string[] {
	if (value === "active" || value === "inactive") {
		if (values.includes(value)) return values.filter((item) => item !== value);
		return [
			...values.filter((item) => item !== "active" && item !== "inactive"),
			value,
		];
	}

	return values.includes(value)
		? values.filter((item) => item !== value)
		: [...values, value];
}

export function matchesProviderCoverage(
	provider: APIProviderCard,
	filter: string,
): boolean {
	switch (filter as ProviderCoverageFilter) {
		case "active":
			return provider.is_gateway_provider;
		case "free":
			return provider.free_models > 0;
		case "inactive":
			return !provider.is_gateway_provider && provider.active_models === 0;
		default:
			return false;
	}
}

export function matchesProviderPolicy(
	provider: APIProviderCard,
	filter: string,
): boolean {
	switch (filter as ProviderPolicyFilter) {
		case "byok":
			return provider.byok_available === true;
		case "privacy":
			return Boolean(provider.privacy_policy_url);
		case "terms":
			return Boolean(provider.terms_of_service_url);
		case "training:no_train":
			return provider.prompt_training_policy === "no_train";
		case "training:may_train":
			return provider.prompt_training_policy === "may_train";
		case "training:opt_out_available":
			return provider.prompt_training_policy === "opt_out_available" || provider.prompt_training_policy === "opt_out";
		case "training:enterprise_no_train":
			return provider.prompt_training_policy === "enterprise_no_train";
		case "training:unknown":
			return !provider.prompt_training_policy || provider.prompt_training_policy === "unknown";
		case "data_policy:private":
			return provider.data_policy_tier === "private";
		case "data_policy:logs":
			return provider.data_policy_tier === "logs";
		case "data_policy:trains":
			return provider.data_policy_tier === "trains";
		case "data_policy:unknown":
			return !provider.data_policy_tier || provider.data_policy_tier === "unknown";
		case "zdr:true":
			return provider.zero_data_retention === true;
		case "zdr:false":
			return provider.zero_data_retention === false;
		case "retention:none":
			return provider.data_retention_days === 0 && provider.zero_data_retention === true;
		case "retention:published":
			return typeof provider.data_retention_days === "number" && provider.data_retention_days > 0;
		case "retention:zdr":
			return provider.zero_data_retention === true;
		case "retention:unknown":
			return provider.data_retention_days == null;
		default:
			return false;
	}
}

export function matchesProviderDatacenter(
	provider: APIProviderCard,
	filter: string,
): boolean {
	const regions = (provider.default_execution_regions ?? [])
		.map((region) => region.trim().toLowerCase())
		.filter(Boolean);
	return filter === "unknown" ? regions.length === 0 : regions.includes(filter.trim().toLowerCase());
}
