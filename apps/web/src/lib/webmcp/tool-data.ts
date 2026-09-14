import type { CompactSearchData, SearchableModel } from "@/lib/fetchers/search/types";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type { PricingModel } from "@/lib/fetchers/pricing/getPricingModels";
import type { ExtendedModel } from "@/data/types";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/providerDataTypes";

export type WebMCPDataSource = {
	fetchJson: <T>(path: string, signal?: AbortSignal) => Promise<T>;
	navigate: (href: string) => void;
};

export const browserWebMCPDataSource: WebMCPDataSource = {
	async fetchJson<T>(path: string, signal?: AbortSignal) {
		const response = await fetch(path, {
			headers: { Accept: "application/json" },
			cache: "no-store",
			signal,
		});
		if (!response.ok) {
			throw new Error(`Phaseo data request failed with status ${response.status}.`);
		}
		return response.json() as Promise<T>;
	},
	navigate(href: string) {
		window.location.assign(href);
	},
};

export function decodeSearchModels(payload: CompactSearchData): SearchableModel[] {
	return (payload.m ?? []).map(([id, title, subtitle, href, logoId, releaseGroupLabel]) => ({
		id,
		title,
		subtitle,
		href,
		logoId,
		releaseGroupLabel,
	}));
}

export async function loadSearchModels(source: WebMCPDataSource, signal?: AbortSignal) {
	const payload = await source.fetchJson<CompactSearchData>("/api/_web/search", signal);
	return decodeSearchModels(payload);
}

export async function loadGatewayModels(source: WebMCPDataSource, signal?: AbortSignal) {
	return (
		await source.fetchJson<{ models: GatewaySupportedModel[] }>(
			"/api/_web/gateway/models?available_only=true",
			signal,
		)
	).models;
}

export async function loadProviderCards(source: WebMCPDataSource, signal?: AbortSignal) {
	return (
		await source.fetchJson<{ providers: APIProviderCard[] }>("/api/_web/api-providers", signal)
	).providers;
}

export async function loadPricingModels(
	source: WebMCPDataSource,
	modelId: string,
	signal?: AbortSignal,
) {
	return (
		await source.fetchJson<{ models: PricingModel[] }>(
			`/api/_web/pricing/models?model_ids=${encodeURIComponent(modelId)}`,
			signal,
		)
	).models.filter((model) => model.model === modelId);
}

export async function loadModelOverview(
	source: WebMCPDataSource,
	modelId: string,
	signal?: AbortSignal,
) {
	return source.fetchJson<{ model: Record<string, unknown> }>(
		`/api/_web/models/${encodeURIComponent(modelId)}?projection=variants-v1`,
		signal,
	);
}

export async function loadModelEvidence(
	source: WebMCPDataSource,
	modelId: string,
	signal?: AbortSignal,
) {
	const encodedId = encodeURIComponent(modelId);
	const [overview, availability, benchmarks, performance] = await Promise.all([
		loadModelOverview(source, modelId, signal),
		source.fetchJson<{ availability: Record<string, unknown> }>(`/api/_web/models/${encodedId}/availability`, signal).catch(() => ({ availability: {} })),
		source.fetchJson<{ highlights: unknown[] | null }>(`/api/_web/models/${encodedId}/benchmarks`, signal).catch(() => ({ highlights: [] })),
		source.fetchJson<{ metrics: Record<string, unknown> | null }>(`/api/_web/models/${encodedId}/performance?percentile=50`, signal).catch(() => ({ metrics: null })),
	]);
	return {
		model: overview.model,
		availability: availability.availability,
		benchmarkHighlights: benchmarks.highlights ?? [],
		performance: performance.metrics,
	};
}

export async function loadComparisonModels(source: WebMCPDataSource, signal?: AbortSignal) {
	return (
		await source.fetchJson<{ models: ExtendedModel[] }>("/api/_web/compare/models", signal)
	).models;
}
