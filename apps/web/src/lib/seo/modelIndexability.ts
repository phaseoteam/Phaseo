import type { Metadata } from "next";

type UnknownRecord = Record<string, unknown>;

export type ModelIndexabilityInput = {
	modelId?: unknown;
	name?: unknown;
	organisationId?: unknown;
	organisationName?: unknown;
	description?: unknown;
	status?: unknown;
	hidden?: unknown;
	releaseDate?: unknown;
	announcementDate?: unknown;
	updatedAt?: unknown;
	primaryDate?: unknown;
	apiModelId?: unknown;
	apiModelIds?: unknown;
	inputTypes?: unknown;
	outputTypes?: unknown;
	modelDetails?: unknown;
	modelLinks?: unknown;
	benchmarkCount?: unknown;
	providerCount?: unknown;
	activeProviderCount?: unknown;
	pricingRuleCount?: unknown;
	lowestInputPrice?: unknown;
	lowestOutputPrice?: unknown;
	contextLengths?: unknown;
	supportedParameters?: unknown;
	hasSubscriptionPlans?: unknown;
};

export type ModelIndexabilityAnalysis = {
	indexable: boolean;
	reasons: string[];
	signals: {
		hasApiIdentifier: boolean;
		hasBenchmarkData: boolean;
		hasCapabilityMetadata: boolean;
		hasDescription: boolean;
		hasPricing: boolean;
		hasProviderCoverage: boolean;
		hasReleaseDate: boolean;
		hasSourceOrDetail: boolean;
		hasSubscriptionPlans: boolean;
	};
};

function text(value: unknown): string {
	return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function count(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function hasListItems(value: unknown): boolean {
	if (Array.isArray(value)) {
		return value.some((item) => {
			if (item == null) return false;
			if (typeof item === "string") return text(item).length > 0;
			if (typeof item === "number") return Number.isFinite(item);
			if (typeof item === "object") return Object.keys(item as UnknownRecord).length > 0;
			return Boolean(item);
		});
	}

	if (typeof value === "string") {
		return value
			.split(",")
			.map((item) => item.trim())
			.some(Boolean);
	}

	return false;
}

function hasDate(value: unknown): boolean {
	const candidate = text(value);
	if (!candidate) return false;
	const parsed = Date.parse(candidate);
	return Number.isFinite(parsed);
}

function hasMoneyValue(value: unknown): boolean {
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value !== "string") return false;
	const parsed = Number(value);
	return Number.isFinite(parsed);
}

function isValidModelId(value: unknown): boolean {
	const parts = text(value).split("/").filter(Boolean);
	return parts.length === 2 && parts.every((part) => part.length > 0);
}

export function analyseModelIndexability(
	input: ModelIndexabilityInput,
): ModelIndexabilityAnalysis {
	const reasons: string[] = [];
	const modelId = text(input.modelId);
	const name = text(input.name);
	const organisation =
		text(input.organisationName) || text(input.organisationId);
	const hidden = Boolean(input.hidden);
	const status = text(input.status).toLowerCase();

	if (!isValidModelId(modelId)) reasons.push("missing canonical model id");
	if (!name) reasons.push("missing model name");
	if (!organisation) reasons.push("missing provider or organisation");
	if (hidden) reasons.push("hidden model");

	const hasProviderCoverage =
		count(input.providerCount) > 0 || count(input.activeProviderCount) > 0;
	const hasPricing =
		count(input.pricingRuleCount) > 0 ||
		hasMoneyValue(input.lowestInputPrice) ||
		hasMoneyValue(input.lowestOutputPrice);
	const hasBenchmarkData = count(input.benchmarkCount) > 0;
	const hasReleaseDate =
		hasDate(input.releaseDate) ||
		hasDate(input.announcementDate) ||
		hasDate(input.primaryDate) ||
		hasDate(input.updatedAt);
	const hasApiIdentifier =
		text(input.apiModelId).length > 0 || hasListItems(input.apiModelIds);
	const hasCapabilityMetadata =
		hasListItems(input.inputTypes) ||
		hasListItems(input.outputTypes) ||
		hasListItems(input.contextLengths) ||
		hasListItems(input.supportedParameters);
	const hasSourceOrDetail =
		hasListItems(input.modelLinks) || hasListItems(input.modelDetails);
	const hasDescription = text(input.description).length >= 48;
	const hasSubscriptionPlans = Boolean(input.hasSubscriptionPlans);

	const signals = {
		hasApiIdentifier,
		hasBenchmarkData,
		hasCapabilityMetadata,
		hasDescription,
		hasPricing,
		hasProviderCoverage,
		hasReleaseDate,
		hasSourceOrDetail,
		hasSubscriptionPlans,
	};

	const coreSignalCount = [
		hasProviderCoverage,
		hasPricing,
		hasBenchmarkData,
		hasReleaseDate,
		hasCapabilityMetadata,
	].filter(Boolean).length;
	const totalSignalCount = Object.values(signals).filter(Boolean).length;

	if (coreSignalCount === 0) {
		reasons.push("missing pricing, providers, benchmarks, dates, and capability metadata");
	}
	if (totalSignalCount < 2) {
		reasons.push("not enough unique page data");
	}
	if (
		status === "rumoured" &&
		!hasProviderCoverage &&
		!hasPricing &&
		!hasBenchmarkData
	) {
		reasons.push("rumoured model without supporting data");
	}

	return {
		indexable: reasons.length === 0,
		reasons,
		signals,
	};
}

export function robotsForModelIndexability(
	analysis: ModelIndexabilityAnalysis,
): Metadata["robots"] {
	return analysis.indexable
		? { index: true, follow: true }
		: { index: false, follow: true };
}
