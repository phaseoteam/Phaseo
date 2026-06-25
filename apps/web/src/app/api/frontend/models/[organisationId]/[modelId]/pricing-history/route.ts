import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelPricingCached } from "@/lib/fetchers/models/getModelPricing";
import {
	getModelPricingHistoryRules,
	type ModelPricingHistoryProviderInput,
} from "@/lib/fetchers/models/getModelPricingHistoryRules";

function parseBoolean(value: string | null): boolean {
	return value === "1" || value === "true";
}

function parseDays(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 30;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(365, parsed)) : 30;
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	await connection();
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const canonicalModelId = fullModelId;
		const includeHidden = parseBoolean(
			request.nextUrl.searchParams.get("includeHidden"),
		);
		const days = parseDays(request.nextUrl.searchParams.get("days"));
		const providers = await getModelPricingCached(
			canonicalModelId,
			includeHidden,
		);
		const providersForHistory: ModelPricingHistoryProviderInput[] = providers
			.filter(
				(provider) =>
					Array.isArray(provider.provider_models) &&
					provider.provider_models.length > 0,
			)
			.map((provider) => ({
				providerId: provider.provider.api_provider_id,
				providerName:
					provider.provider.api_provider_name ||
					provider.provider.api_provider_id,
				models: Array.from(
					new Map(
						provider.provider_models.map((providerModel) => {
							const apiProviderId = String(
								providerModel.api_provider_id ?? "",
							).trim();
							const providerModelId = String(
								providerModel.model_id ?? "",
							).trim();
							const endpoint = String(
								providerModel.endpoint ?? "",
							).trim();
							const key = `${apiProviderId}:${providerModelId}:${endpoint}`;
							return [
								key,
								{
									apiProviderId,
									modelId: providerModelId,
									endpoint,
								},
							];
						}),
					).values(),
				)
					.filter(
						(model) =>
							Boolean(model.apiProviderId) &&
							Boolean(model.modelId) &&
							Boolean(model.endpoint),
					)
					.sort((left, right) => {
						const providerCompare =
							left.apiProviderId.localeCompare(right.apiProviderId);
						if (providerCompare !== 0) return providerCompare;
						const modelCompare = left.modelId.localeCompare(right.modelId);
						if (modelCompare !== 0) return modelCompare;
						return left.endpoint.localeCompare(right.endpoint);
					}),
			}))
			.sort((left, right) => left.providerId.localeCompare(right.providerId));

		const rules = await getModelPricingHistoryRules({
			modelId: canonicalModelId,
			providers: providersForHistory,
			days,
		});
		return NextResponse.json(rules, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/pricing-history] failed to fetch pricing history",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load model pricing history" },
			{ status: 500 },
		);
	}
}
