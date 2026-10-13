import { useEffect } from "react";
import useSWR, { mutate } from "swr";
import type { Harness, ModelOption } from "../../shared/workspace";
import { BACKGROUND_REFRESH_MS } from "./useBackgroundRefresh";

const modelsKey = (harness: Harness, accountId?: string, projectId?: string) => ["workspace-models", harness, accountId ?? "", projectId ?? ""];

/** Re-read a catalog after a refresh; the main process caches Phaseo's on disk and refreshes it in the background. */
export function revalidateModels(harness: Harness, accountId?: string) {
	return mutate(key => Array.isArray(key) && key[0] === "workspace-models" && key[1] === harness && (accountId === undefined || key[2] === accountId));
}

/** Fetch a catalog now, skipping the cache's freshness window. */
export async function refreshModels(harness: Harness, accountId?: string) {
	const api = window.phaseoDesktop?.workspace;
	if (!api) return;
	await api.refreshModels(harness, accountId);
	await revalidateModels(harness, accountId);
}

export function useModels(harness: Harness, accountId?: string, projectId?: string, fallback?: ModelOption[], enabled = true) {
	const api = window.phaseoDesktop?.workspace;
	const available = enabled && !!api && harness !== "acp" && (!["phaseo", "cursor"].includes(harness) || !!accountId);
	const { data, error } = useSWR<ModelOption[]>(
		available ? modelsKey(harness, accountId, projectId) : null,
		() => api!.models(harness, accountId || undefined, projectId || undefined),
		{ fallbackData: fallback?.length ? fallback : undefined, dedupingInterval: BACKGROUND_REFRESH_MS, refreshInterval: BACKGROUND_REFRESH_MS, revalidateOnFocus: false,
			onErrorRetry: (_error, _key, _config, revalidate, options) => { setTimeout(() => { void revalidate(options); }, BACKGROUND_REFRESH_MS); } },
	);
	useEffect(() => {
		if (!available) return;
		return api!.onModelsChange(change => { if (change.harness === harness && (change.accountId ?? "") === (accountId ?? "")) void revalidateModels(harness, accountId); });
	}, [api, available, harness, accountId]);
	const models = available ? data ?? [] : fallback ?? [];
	return {
		models,
		loading: available && data === undefined && !error,
		error: error ? (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "",
	};
}
