import type { Endpoint } from "./types";

export type NormalizedTextServiceTier = "standard" | "fast" | "ultrafast" | "priority" | "flex" | "batch";

export function readProviderCatalogTier(params: Record<string, unknown> | null | undefined): { name: string; upstream: string | null } | null {
	const descriptor = params?.service_tier;
	const value = descriptor && typeof descriptor === "object" ? (descriptor as Record<string, unknown>).provider_catalog : null;
	if (!value || typeof value !== "object") return null;
	const tier = value as Record<string, unknown>;
	if (!["standard", "fast", "ultrafast", "flex", "batch"].includes(String(tier.name))) return null;
	return { name: String(tier.name), upstream: typeof tier.upstream === "string" ? tier.upstream : null };
}
export type TextServiceTierValidation =
	| { ok: true; tier?: NormalizedTextServiceTier; field?: "service_tier" | "serviceTier" }
	| {
		ok: false;
		reason: "batch_not_supported" | "invalid";
		raw: string;
		field: "service_tier" | "serviceTier";
	};

const TEXT_ENDPOINTS = new Set<Endpoint>([
	"chat.completions",
	"responses",
	"messages",
]);

export const TEXT_SERVICE_TIER_VALUES = [
	"standard",
	"default",
	"fast",
	"ultrafast",
	"priority",
	"flex",
	"batch",
] as const;

export function isSynchronousTextEndpoint(endpoint: Endpoint): boolean {
	return TEXT_ENDPOINTS.has(endpoint);
}

export function readRequestedServiceTier(body: any): {
	value: unknown;
	field?: "service_tier" | "serviceTier";
} {
	if (body && Object.prototype.hasOwnProperty.call(body, "service_tier")) {
		return { value: body.service_tier, field: "service_tier" };
	}
	if (body && Object.prototype.hasOwnProperty.call(body, "serviceTier")) {
		return { value: body.serviceTier, field: "serviceTier" };
	}
	return { value: undefined };
}

export function normalizeTextServiceTier(value: unknown): NormalizedTextServiceTier | undefined {
	if (typeof value !== "string") return undefined;
	const tier = value.trim().toLowerCase();
	if (!tier) return undefined;
	if (tier === "standard" || tier === "default") return "standard";
	if (tier === "fast") return "fast";
	if (tier === "ultrafast") return "ultrafast";
	if (tier === "priority") return "priority";
	if (tier === "flex") return "flex";
	if (tier === "batch") return "batch";
	return undefined;
}

export function validateTextServiceTier(value: unknown, field?: "service_tier" | "serviceTier"): TextServiceTierValidation {
	if (value === undefined || value === null || value === "") return { ok: true };
	const pathField = field ?? "service_tier";
	if (typeof value !== "string") {
		return { ok: false, reason: "invalid", raw: String(value), field: pathField };
	}

	const raw = value.trim();
	if (!raw) return { ok: true };
	const tier = raw.toLowerCase();

	const normalized = normalizeTextServiceTier(raw);
	if (!normalized) {
		return { ok: false, reason: "invalid", raw, field: pathField };
	}
	if (normalized === "batch") {
		return { ok: false, reason: "batch_not_supported", raw, field: pathField };
	}

	return { ok: true, tier: normalized, field: pathField };
}
