"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import { webQueryKeys } from "@/lib/query/queryKeys";
import type { ModelPercentile } from "./ModelPercentileSelect";

export const MODEL_PERFORMANCE_REFRESH_INTERVAL_MS = WEB_QUERY_POLICIES.public.refetchInterval;

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

async function fetchModelPerformanceMetrics(
	key: `/api/_web/${string}`,
	signal: AbortSignal,
) {
	const payload = await fetchOptionalPublicWebApi<{
		metrics: ModelPerformanceMetrics | null;
	}>(key, { signal });
	return payload?.metrics ?? null;
}

export function useModelPerformanceMetrics({
	modelId,
	cloudflareColo,
	percentile,
	rangeDays,
	fallbackData,
	refreshInterval = MODEL_PERFORMANCE_REFRESH_INTERVAL_MS,
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
	const query = useQuery<ModelPerformanceMetrics | null>({
		queryKey: webQueryKeys.public.modelPerformance({
			modelId,
			cloudflareColo,
			percentile,
			rangeDays,
		}),
		queryFn: ({ signal }) => fetchModelPerformanceMetrics(key, signal),
		...WEB_QUERY_POLICIES.public,
		refetchInterval: refreshInterval,
		refetchIntervalInBackground: false,
		placeholderData: keepPreviousData,
		initialData: fallbackData,
	});
	const lastSuccessAtRef = useRef(0);
	const lastErrorRef = useRef<unknown>(null);
	useEffect(() => {
		if (query.dataUpdatedAt <= lastSuccessAtRef.current) return;
		lastSuccessAtRef.current = query.dataUpdatedAt;
		onSuccess?.(query.data ?? null);
	}, [onSuccess, query.data, query.dataUpdatedAt]);
	useEffect(() => {
		if (!query.error || query.error === lastErrorRef.current) return;
		lastErrorRef.current = query.error;
		onError?.();
	}, [onError, query.error]);

	return {
		...query,
		isValidating: query.isFetching,
	};
}
