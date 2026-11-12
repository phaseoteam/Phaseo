import { useEffect } from "react";
import useSWR, { mutate } from "swr";
import type { Harness, ModelAccess, ModelOption } from "../../shared/workspace";
import { BACKGROUND_REFRESH_MS } from "./useBackgroundRefresh";
import { providerHealthMs } from "./providerHealth";

const PHASEO_POLL_MS = 5 * 60 * 1000;
const modelsKey = (harness: Harness, accountId?: string, projectId?: string) => ["workspace-models", harness, accountId ?? "", projectId ?? ""];

/** Re-read a catalog after a refresh; the main process caches Phaseo's on disk and refreshes it in the background. */
export function revalidateModels(harness: Harness, accountId?: string) {
	// What workspace rules hide is saved with Phaseo's list, so it is re-read with it.
	if (harness === "phaseo") void mutate(key => Array.isArray(key) && key[0] === "workspace-model-access" && (accountId === undefined || key[1] === accountId));
	return mutate(key => Array.isArray(key) && key[0] === "workspace-models" && key[1] === harness && (accountId === undefined || key[2] === accountId));
}

/** What the Phaseo account's workspace rules leave out of its model list, from the list's last download. */
export function useModelAccess(accountId?: string): ModelAccess | undefined {
	const api = window.phaseoDesktop?.workspace;
	const { data } = useSWR<ModelAccess | undefined>(api && accountId ? ["workspace-model-access", accountId] : null, () => api!.modelAccess(accountId!), { dedupingInterval: PHASEO_POLL_MS, refreshInterval: PHASEO_POLL_MS, revalidateOnFocus: false });
	return data;
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
		// Phaseo reads hit the main process disk cache, which re-checks the gateway once its 15-minute window lapses. Agent CLIs
		// follow Settings → Agents → Health checks.
		{ fallbackData: fallback?.length ? fallback : undefined, dedupingInterval: harness === "phaseo" ? PHASEO_POLL_MS : providerHealthMs() || BACKGROUND_REFRESH_MS, refreshInterval: harness === "phaseo" ? PHASEO_POLL_MS : providerHealthMs(), revalidateOnFocus: false,
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
