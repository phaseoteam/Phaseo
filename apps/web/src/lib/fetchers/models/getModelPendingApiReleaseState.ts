import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import { getModelPricingCached, type ProviderPricing } from "@/lib/fetchers/models/getModelPricing";

function isProviderModelActiveNow(
	providerModel: ProviderPricing["provider_models"][number],
	now = new Date(),
): boolean {
	if (!providerModel.is_active_gateway) return false;
	if (providerModel.capability_status === "disabled") return false;
	if (!providerModel.endpoint || providerModel.endpoint === "unmapped") return false;

	const from = providerModel.effective_from
		? new Date(providerModel.effective_from)
		: null;
	const to = providerModel.effective_to
		? new Date(providerModel.effective_to)
		: null;

	if (from && Number.isFinite(from.getTime()) && now < from) return false;
	if (to && Number.isFinite(to.getTime()) && now >= to) return false;

	return true;
}

function hasActiveApiProviders(providers: ProviderPricing[]): boolean {
	return providers.some((provider) =>
		provider.provider_models.some((providerModel) =>
			isProviderModelActiveNow(providerModel),
		),
	);
}

export async function getModelPendingApiReleaseState(
	modelId: string,
	includeHidden: boolean,
): Promise<{
	isPendingApiRelease: boolean;
	modelName: string;
}> {
	const [model, providers] = await Promise.all([
		getModelOverviewCached(modelId, includeHidden).catch(() => null),
		getModelPricingCached(modelId, includeHidden).catch(() => []),
	]);

	const isAvailableModel = model?.status === "Available";
	const isPendingApiRelease =
		isAvailableModel && !hasActiveApiProviders(providers);

	return {
		isPendingApiRelease,
		modelName: model?.name ?? "This model",
	};
}
