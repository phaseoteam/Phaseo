import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendMarketplacePresetDetail,
	fetchFrontendMarketplacePresets,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const marketplacePresetsQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "marketplace-presets"],
		queryFn: () => fetchFrontendMarketplacePresets(),
	});

export const marketplacePresetDetailQuery = (presetId: string, version: number | undefined) =>
	queryOptions({
		queryKey: ["public-catalog", "marketplace-preset", presetId, version ?? null],
		queryFn: () => fetchFrontendMarketplacePresetDetail(presetId, version),
	});
