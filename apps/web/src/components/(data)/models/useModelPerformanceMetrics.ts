"use client";

import useSWR from "swr";
import type { SWRConfiguration } from "swr";

import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";
import type { ModelPercentile } from "./ModelPercentileSelect";

export const MODEL_PERFORMANCE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function getModelPerformanceKey({
	modelId,
	cloudflareColo,
	percentile,
	rangeDays,
}: {
	modelId: string;
	cloudflareColo: string | null;
	percentile: ModelPercentile;
	rangeDays: 1 | 3 | 7;
}): `/api/_web/${string}` {
	const query = new URLSearchParams({ percentile: String(percentile), range: String(rangeDays) });
	if (cloudflareColo) query.set("colo", cloudflareColo);
	return `/api/_web/models/${encodeURIComponent(modelId)}/performance?${query.toString()}`;
}

async function fetchModelPerformanceMetrics(key: `/api/_web/${string}`) {
	const payload = await fetchOptionalPublicWebApi<{
		metrics: ModelPerformanceMetrics | null;
	}>(key);
	return payload?.metrics ?? null;
}

export function useModelPerformanceMetrics({
	modelId,
	cloudflareColo,
	percentile,
	rangeDays,
	fallbackData,
	refreshInterval = 0,
	onError,
	onSuccess,
}: {
	modelId: string;
	cloudflareColo: string | null;
	percentile: ModelPercentile;
	rangeDays: 1 | 3 | 7;
	fallbackData?: ModelPerformanceMetrics;
	refreshInterval?: number;
	onError?: () => void;
	onSuccess?: (metrics: ModelPerformanceMetrics | null) => void;
}) {
	const key = getModelPerformanceKey({
		modelId,
		cloudflareColo,
		percentile,
		rangeDays,
	});
	const options: SWRConfiguration<ModelPerformanceMetrics | null> = {
		dedupingInterval: 30_000,
		errorRetryCount: 2,
		fallbackData,
		focusThrottleInterval: 60_000,
		keepPreviousData: true,
		refreshInterval,
		refreshWhenHidden: false,
		refreshWhenOffline: false,
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
	};
	if (onError) options.onError = onError;
	if (onSuccess) options.onSuccess = onSuccess;

	return useSWR<ModelPerformanceMetrics | null>(
		key,
		fetchModelPerformanceMetrics,
		options,
	);
}
