export type ProviderAuditRoutabilityKey =
	| "active"
	| "deranked_lvl1"
	| "deranked_lvl2"
	| "deranked_lvl3"
	| "preview_only"
	| "internal_testing"
	| "scheduled"
	| "provider_not_ready"
	| "gated"
	| "access_limited"
	| "region_limited"
	| "project_limited"
	| "paused"
	| "soft_blocked"
	| "provider_disabled"
	| "model_disabled"
	| "capability_disabled"
	| "provider_inactive"
	| "inactive"
	| "retired";

export type ProviderAuditRoutability = {
	key: ProviderAuditRoutabilityKey;
	label: string;
	detail: string;
	availability: "active" | "coming_soon" | "inactive";
	isRoutableNow: boolean;
};

export type ProviderAuditCapabilityState = {
	capabilityId: string;
	capabilityStatus: string | null;
	routability: ProviderAuditRoutability;
};

export type ProviderAuditAggregateRoutability = {
	state: ProviderAuditRoutability;
	activeCount: number;
	previewCount: number;
	inactiveCount: number;
	summary: string;
};

type ProviderAuditStateInput = {
	isActiveGateway: boolean;
	providerStatus?: string | null;
	providerRoutingStatus?: string | null;
	modelRoutingStatus?: string | null;
	capabilityStatus?: string | null;
	effectiveFrom?: string | null;
	effectiveTo?: string | null;
	now?: Date;
};

function normalizeStatusValue(value: unknown): string | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	return normalized || null;
}

function isFutureEffectiveWindow(
	effectiveFrom?: string | null,
	now: Date = new Date()
): boolean {
	if (!effectiveFrom) return false;
	const from = new Date(effectiveFrom);
	return Number.isFinite(from.getTime()) && now < from;
}

function isExpiredEffectiveWindow(
	effectiveTo?: string | null,
	now: Date = new Date()
): boolean {
	if (!effectiveTo) return false;
	const to = new Date(effectiveTo);
	return Number.isFinite(to.getTime()) && now >= to;
}

function describeDerankedState(level: "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3"): ProviderAuditRoutability {
	if (level === "deranked_lvl3") {
		return {
			key: "deranked_lvl3",
			label: "Deranked L3",
			detail: "Routable, but heavily deprioritized by routing health.",
			availability: "active",
			isRoutableNow: true,
		};
	}
	if (level === "deranked_lvl2") {
		return {
			key: "deranked_lvl2",
			label: "Deranked L2",
			detail: "Routable, but currently deprioritized by routing health.",
			availability: "active",
			isRoutableNow: true,
		};
	}
	return {
		key: "deranked_lvl1",
		label: "Deranked L1",
		detail: "Routable, but slightly deprioritized by routing health.",
		availability: "active",
		isRoutableNow: true,
	};
}

function describeKnownInactiveProviderStatus(
	status:
		| "gated"
		| "access_limited"
		| "region_limited"
		| "project_limited"
		| "paused"
		| "soft_blocked",
): ProviderAuditRoutability {
	switch (status) {
		case "gated":
			return {
				key: status,
				label: "Gated Access",
				detail: "The provider mapping exists, but access is currently gated behind an allowlist or private rollout.",
				availability: "inactive",
				isRoutableNow: false,
			};
		case "access_limited":
			return {
				key: status,
				label: "Access Limited",
				detail: "The provider mapping exists, but it currently requires additional provider-side access.",
				availability: "inactive",
				isRoutableNow: false,
			};
		case "region_limited":
			return {
				key: status,
				label: "Region Limited",
				detail: "The provider mapping exists, but it is limited to specific regions right now.",
				availability: "inactive",
				isRoutableNow: false,
			};
		case "project_limited":
			return {
				key: status,
				label: "Project Limited",
				detail: "The provider mapping exists, but it is limited to specific projects or workspaces.",
				availability: "inactive",
				isRoutableNow: false,
			};
		case "paused":
			return {
				key: status,
				label: "Paused",
				detail: "The provider mapping exists, but it is temporarily paused for routing.",
				availability: "inactive",
				isRoutableNow: false,
			};
		case "soft_blocked":
			return {
				key: status,
				label: "Soft Blocked",
				detail: "The provider mapping exists, but it is temporarily soft-blocked for routing.",
				availability: "inactive",
				isRoutableNow: false,
			};
	}
}

export function classifyProviderAuditRoutability(
	input: ProviderAuditStateInput
): ProviderAuditRoutability {
	const now = input.now ?? new Date();
	const providerStatus = normalizeStatusValue(input.providerStatus);
	const providerRoutingStatus = normalizeStatusValue(input.providerRoutingStatus);
	const modelRoutingStatus = normalizeStatusValue(input.modelRoutingStatus);
	const capabilityStatus = normalizeStatusValue(input.capabilityStatus);

	if (isExpiredEffectiveWindow(input.effectiveTo, now)) {
		return {
			key: "retired",
			label: "Retired",
			detail: "The effective window has already ended.",
			availability: "inactive",
			isRoutableNow: false,
		};
	}

	if (isFutureEffectiveWindow(input.effectiveFrom, now)) {
		return {
			key: "scheduled",
			label: "Scheduled",
			detail: "The provider-model mapping is configured for a future effective date.",
			availability: "coming_soon",
			isRoutableNow: false,
		};
	}

	if (providerStatus && providerStatus !== "active") {
		if (providerStatus === "alpha" || providerStatus === "beta") {
			return {
				key: "preview_only",
				label: "Preview Only",
				detail: `Provider status is ${providerStatus} and the mapping is staged for preview rollout only.`,
				availability: "coming_soon",
				isRoutableNow: false,
			};
		}
		if (providerStatus === "not_ready") {
			return {
				key: "provider_not_ready",
				label: "Provider Not Ready",
				detail: "The provider mapping exists, but it is not ready for public gateway routing yet.",
				availability: "inactive",
				isRoutableNow: false,
			};
		}
		if (
			providerStatus === "gated" ||
			providerStatus === "access_limited" ||
			providerStatus === "region_limited" ||
			providerStatus === "project_limited" ||
			providerStatus === "paused" ||
			providerStatus === "soft_blocked"
		) {
			return describeKnownInactiveProviderStatus(providerStatus);
		}
		return {
			key: "provider_inactive",
			label: "Provider Inactive",
			detail: `Provider status is ${providerStatus}.`,
			availability: "inactive",
			isRoutableNow: false,
		};
	}

	if (providerRoutingStatus === "disabled") {
		return {
			key: "provider_disabled",
			label: "Provider Disabled",
			detail: "Provider routing is disabled.",
			availability: "inactive",
			isRoutableNow: false,
		};
	}

	if (modelRoutingStatus === "disabled") {
		return {
			key: "model_disabled",
			label: "Model Disabled",
			detail: "Provider-model routing is disabled.",
			availability: "inactive",
			isRoutableNow: false,
		};
	}

	if (capabilityStatus === "disabled") {
		return {
			key: "capability_disabled",
			label: "Capability Disabled",
			detail: "The endpoint capability is disabled.",
			availability: "inactive",
			isRoutableNow: false,
		};
	}

	if (
		providerRoutingStatus === "deranked_lvl1" ||
		providerRoutingStatus === "deranked_lvl2" ||
		providerRoutingStatus === "deranked_lvl3"
	) {
		return describeDerankedState(providerRoutingStatus);
	}

	if (
		modelRoutingStatus === "deranked_lvl1" ||
		modelRoutingStatus === "deranked_lvl2" ||
		modelRoutingStatus === "deranked_lvl3"
	) {
		return describeDerankedState(modelRoutingStatus);
	}

	if (capabilityStatus === "internal_testing") {
		return {
			key: "internal_testing",
			label: "Internal Testing",
			detail: "Capability requires testing mode and is not publicly routable.",
			availability: "coming_soon",
			isRoutableNow: false,
		};
	}

	if (!input.isActiveGateway) {
		return {
			key: "inactive",
			label: "Inactive",
			detail: "Gateway activation is turned off for this provider-model mapping.",
			availability: "inactive",
			isRoutableNow: false,
		};
	}

	if (capabilityStatus && capabilityStatus !== "active") {
		return {
			key: "inactive",
			label: "Inactive",
			detail: `Capability status is ${capabilityStatus}.`,
			availability: "inactive",
			isRoutableNow: false,
		};
	}

	return {
		key: "active",
		label: "Active",
		detail: "Publicly routable now.",
		availability: "active",
		isRoutableNow: true,
	};
}

function chooseAggregateState(states: ProviderAuditRoutability[]): ProviderAuditRoutability {
	const activeStates = states.filter((state) => state.availability === "active");
	const fullyActive = activeStates.find((state) => state.key === "active");
	if (fullyActive) return fullyActive;
	if (activeStates.length > 0) {
		return (
			activeStates.find((state) => state.key === "deranked_lvl3") ??
			activeStates.find((state) => state.key === "deranked_lvl2") ??
			activeStates.find((state) => state.key === "deranked_lvl1") ??
			activeStates[0]
		);
	}

	const previewStates = states.filter((state) => state.availability === "coming_soon");
	if (previewStates.length > 0) {
		return (
			previewStates.find((state) => state.key === "internal_testing") ??
			previewStates.find((state) => state.key === "scheduled") ??
			previewStates.find((state) => state.key === "preview_only") ??
			previewStates[0]
		);
	}

	return (
		states.find((state) => state.key === "provider_not_ready") ??
		states.find((state) => state.key === "gated") ??
		states.find((state) => state.key === "access_limited") ??
		states.find((state) => state.key === "region_limited") ??
		states.find((state) => state.key === "project_limited") ??
		states.find((state) => state.key === "paused") ??
		states.find((state) => state.key === "soft_blocked") ??
		states.find((state) => state.key === "provider_disabled") ??
		states.find((state) => state.key === "model_disabled") ??
		states.find((state) => state.key === "capability_disabled") ??
		states.find((state) => state.key === "provider_inactive") ??
		states.find((state) => state.key === "retired") ??
		states[0]
	);
}

export function aggregateProviderAuditRoutability(
	capabilityStates: ProviderAuditCapabilityState[]
): ProviderAuditAggregateRoutability {
	const states = capabilityStates.map((entry) => entry.routability);
	const chosenState = chooseAggregateState(states);
	const activeCount = states.filter((state) => state.availability === "active").length;
	const previewCount = states.filter((state) => state.availability === "coming_soon").length;
	const inactiveCount = states.filter((state) => state.availability === "inactive").length;

	const summaryParts: string[] = [];
	if (activeCount > 0) {
		summaryParts.push(`${activeCount} active`);
	}
	if (previewCount > 0) {
		summaryParts.push(`${previewCount} preview`);
	}
	if (inactiveCount > 0) {
		summaryParts.push(`${inactiveCount} unavailable`);
	}

	return {
		state: chosenState,
		activeCount,
		previewCount,
		inactiveCount,
		summary: summaryParts.join(" • "),
	};
}
