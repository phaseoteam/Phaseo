export const PROVIDER_STATUS_PRIORITY_ORDER = [
	"active",
	"deranked",
	"internal_testing",
	"coming_soon",
	"inactive",
	"disabled",
	"not_listed",
	"external",
] as const;

export type CanonicalGatewayStatus = (typeof PROVIDER_STATUS_PRIORITY_ORDER)[number];

const providerStatusPriority = new Map<string, number>(
	PROVIDER_STATUS_PRIORITY_ORDER.map((status, index) => [status, index]),
);

function isFutureEffectiveWindow(value: string | null | undefined): boolean {
	if (!value) return false;
	const time = new Date(value).getTime();
	return Number.isFinite(time) && time > Date.now();
}

function isExpiredEffectiveWindow(value: string | null | undefined): boolean {
	if (!value) return false;
	const time = new Date(value).getTime();
	return Number.isFinite(time) && time <= Date.now();
}

export function normalizeGatewayStatusValue(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "";
	if (normalized === "not_active") return "inactive";
	// The catalogue stores a deranked route as `degraded`; the former levels are one level now.
	if (normalized === "degraded" || normalized === "de_ranked" || /^deranked(_lvl_?[123])?$/.test(normalized)) {
		return "deranked";
	}
	return normalized;
}

function isDeranked(value: unknown): boolean {
	return normalizeGatewayStatusValue(value) === "deranked";
}

export function resolveGatewayStatus({
	isActiveGateway,
	providerAvailabilityStatus,
	phaseoStatus,
	accessScope,
	capabilityStatus,
	providerStatus,
	providerRoutingStatus,
	modelRoutingStatus,
	effectiveFrom,
	effectiveTo,
}: {
	isActiveGateway: boolean | null | undefined;
	providerAvailabilityStatus?: unknown;
	phaseoStatus?: unknown;
	accessScope?: unknown;
	capabilityStatus?: unknown;
	providerStatus?: unknown;
	providerRoutingStatus?: unknown;
	modelRoutingStatus?: unknown;
	effectiveFrom?: string | null;
	effectiveTo?: string | null;
}): CanonicalGatewayStatus {
	const normalizedProviderStatus = normalizeGatewayStatusValue(providerStatus);
	const normalizedProviderAvailabilityStatus =
		normalizeGatewayStatusValue(providerAvailabilityStatus);
	const normalizedPhaseoStatus = normalizeGatewayStatusValue(phaseoStatus);
	const normalizedAccessScope = normalizeGatewayStatusValue(accessScope);
	const normalizedProviderRoutingStatus =
		normalizeGatewayStatusValue(providerRoutingStatus);
	const normalizedModelRoutingStatus = normalizeGatewayStatusValue(modelRoutingStatus);
	const normalizedCapabilityStatus = normalizeGatewayStatusValue(capabilityStatus);
	const hasRouteLifecycleStatus =
		isFutureEffectiveWindow(effectiveFrom) ||
		normalizedProviderAvailabilityStatus === "coming_soon" ||
		normalizedPhaseoStatus === "planned" ||
		normalizedPhaseoStatus === "implementing" ||
		normalizedPhaseoStatus === "testing" ||
		normalizedCapabilityStatus === "coming_soon";

	if (normalizedProviderStatus === "external" && !hasRouteLifecycleStatus) {
		return "external";
	}

	if (
		normalizedCapabilityStatus === "disabled" ||
		normalizedPhaseoStatus === "disabled" ||
		normalizedPhaseoStatus === "blocked"
	) {
		return "disabled";
	}

	if (isExpiredEffectiveWindow(effectiveTo)) return "inactive";
	if (isFutureEffectiveWindow(effectiveFrom)) return "coming_soon";

	if (
		normalizedAccessScope === "internal" ||
		normalizedPhaseoStatus === "testing"
	) {
		return "internal_testing";
	}

	if (
		normalizedProviderAvailabilityStatus === "coming_soon" ||
		normalizedPhaseoStatus === "planned" ||
		normalizedPhaseoStatus === "implementing"
	) {
		return "coming_soon";
	}

	if (
		["unknown", "deprecated", "removed"].includes(
			normalizedProviderAvailabilityStatus,
		) ||
		normalizedPhaseoStatus === "unsupported"
	) {
		return "inactive";
	}

	if (normalizedCapabilityStatus === "internal_testing") {
		return "internal_testing";
	}

	if (
		normalizedProviderStatus === "alpha" ||
		normalizedProviderStatus === "beta" ||
		normalizedCapabilityStatus === "coming_soon"
	) {
		return "coming_soon";
	}

	if (
		normalizedProviderRoutingStatus === "disabled" ||
		normalizedModelRoutingStatus === "disabled"
	) {
		return "disabled";
	}

	if (normalizedProviderStatus && normalizedProviderStatus !== "active") {
		return "inactive";
	}

	// `degraded` is also stored on routes whose routing is off: those are inactive, not a fallback.
	if (normalizedCapabilityStatus === "inactive" || !isActiveGateway) return "inactive";
	return [providerRoutingStatus, modelRoutingStatus, capabilityStatus].some(isDeranked)
		? "deranked"
		: "active";
}

export function chooseGatewayStatus(statuses: CanonicalGatewayStatus[]): CanonicalGatewayStatus {
	return (
		statuses.reduce<CanonicalGatewayStatus | null>((current, candidate) => {
			if (!current) return candidate;
			return getGatewayStatusSortRank(candidate) < getGatewayStatusSortRank(current)
				? candidate
				: current;
		}, null) ?? "not_listed"
	);
}

export function getGatewayStatusSortRank(status: string | null | undefined): number {
	const normalized = normalizeGatewayStatusValue(status);
	return providerStatusPriority.get(normalized) ?? providerStatusPriority.get("inactive")!;
}
