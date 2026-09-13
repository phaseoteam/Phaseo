export const PROVIDER_STATUS_PRIORITY_ORDER = [
	"active",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
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
	if (normalized === "de_ranked" || normalized === "deranked") return "deranked_lvl1";
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function normalizeDerankStatus(value: unknown): CanonicalGatewayStatus | null {
	const normalized = normalizeGatewayStatusValue(value);
	if (
		normalized === "deranked_lvl1" ||
		normalized === "deranked_lvl2" ||
		normalized === "deranked_lvl3"
	) {
		return normalized;
	}
	return null;
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

	if (normalizedProviderStatus === "external") {
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

	return (
		normalizeDerankStatus(providerRoutingStatus) ??
		normalizeDerankStatus(modelRoutingStatus) ??
		normalizeDerankStatus(capabilityStatus) ??
		(normalizedCapabilityStatus === "inactive" || !isActiveGateway
			? "inactive"
			: "active")
	);
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
