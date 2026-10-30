export type ProviderAvailabilityStatus =
	| "unknown"
	| "coming_soon"
	| "preview"
	| "available"
	| "limited_access"
	| "deprecated"
	| "removed";

export type PhaseoIntegrationStatus =
	| "unsupported"
	| "planned"
	| "implementing"
	| "testing"
	| "enabled"
	| "disabled"
	| "blocked";

export type RouteAccessScope = "public" | "internal";

type StatusMeta<T extends string> = {
	key: T;
	label: string;
	description: string;
};

export type ProviderLifecycleStatusInput = {
	provider_availability_status?: ProviderAvailabilityStatus | null;
	phaseo_status?: PhaseoIntegrationStatus | null;
	access_scope?: RouteAccessScope | null;
};

const PROVIDER_AVAILABILITY_ORDER: ProviderAvailabilityStatus[] = [
	"available",
	"preview",
	"limited_access",
	"coming_soon",
	"deprecated",
	"unknown",
	"removed",
];

const PHASEO_STATUS_ORDER: PhaseoIntegrationStatus[] = [
	"enabled",
	"testing",
	"implementing",
	"planned",
	"unsupported",
	"disabled",
	"blocked",
];

export const PROVIDER_AVAILABILITY_META: Record<
	ProviderAvailabilityStatus,
	StatusMeta<ProviderAvailabilityStatus>
> = {
	unknown: {
		key: "unknown",
		label: "Unknown",
		description: "Upstream availability has not been confirmed.",
	},
	coming_soon: {
		key: "coming_soon",
		label: "Coming soon",
		description: "The provider has announced this offer, but it is not available yet.",
	},
	preview: {
		key: "preview",
		label: "Preview",
		description: "The provider currently offers this model as a preview.",
	},
	available: {
		key: "available",
		label: "Available",
		description: "The provider currently offers this model.",
	},
	limited_access: {
		key: "limited_access",
		label: "Limited access",
		description: "The upstream offer requires provider approval or restricted access.",
	},
	deprecated: {
		key: "deprecated",
		label: "Deprecated",
		description: "The provider is deprecating this offer.",
	},
	removed: {
		key: "removed",
		label: "Removed",
		description: "The provider no longer offers this model.",
	},
};

export const PHASEO_STATUS_META: Record<
	PhaseoIntegrationStatus,
	StatusMeta<PhaseoIntegrationStatus>
> = {
	unsupported: {
		key: "unsupported",
		label: "Unsupported",
		description: "Phaseo does not currently support this provider route.",
	},
	planned: {
		key: "planned",
		label: "Planned",
		description: "Phaseo support is planned, but implementation has not started.",
	},
	implementing: {
		key: "implementing",
		label: "Implementing",
		description: "Phaseo is currently implementing this provider route.",
	},
	testing: {
		key: "testing",
		label: "Testing",
		description: "The integration is restricted to authenticated internal testing.",
	},
	enabled: {
		key: "enabled",
		label: "Enabled",
		description: "The Phaseo integration is enabled.",
	},
	disabled: {
		key: "disabled",
		label: "Disabled",
		description: "The Phaseo integration has been disabled.",
	},
	blocked: {
		key: "blocked",
		label: "Blocked",
		description: "The Phaseo integration is blocked from progressing or routing.",
	},
};

function chooseKnownStatus<T extends string>(
	values: Array<T | null | undefined>,
	order: T[],
): T | null {
	const known = new Set(values.filter((value): value is T => Boolean(value)));
	return order.find((value) => known.has(value)) ?? null;
}

export function summarizeProviderLifecycle(
	providerModels: ProviderLifecycleStatusInput[],
): {
	providerAvailability: StatusMeta<ProviderAvailabilityStatus> | null;
	phaseo: StatusMeta<PhaseoIntegrationStatus> | null;
	accessScope: RouteAccessScope;
} {
	const providerAvailability = chooseKnownStatus(
		providerModels.map((model) => model.provider_availability_status),
		PROVIDER_AVAILABILITY_ORDER,
	);
	const phaseo = chooseKnownStatus(
		providerModels.map((model) => model.phaseo_status),
		PHASEO_STATUS_ORDER,
	);
	const accessScope = providerModels.some(
		(model) => model.access_scope === "public" || model.access_scope == null,
	)
		? "public"
		: "internal";

	return {
		providerAvailability: providerAvailability
			? PROVIDER_AVAILABILITY_META[providerAvailability]
			: null,
		phaseo: phaseo ? PHASEO_STATUS_META[phaseo] : null,
		accessScope,
	};
}
