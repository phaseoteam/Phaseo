import type { Endpoint } from "./types";

export type NormalizedTextServiceTier = "standard" | "priority" | "flex" | "batch";
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
	"interactions",
	"messages",
]);

export const TEXT_SERVICE_TIER_VALUES = [
	"standard",
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
	if (tier === "standard") return "standard";
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
