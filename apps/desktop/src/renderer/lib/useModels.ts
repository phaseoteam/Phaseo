import useSWR from "swr";
import type { Harness, ModelOption } from "../../shared/workspace";
import { BACKGROUND_REFRESH_MS } from "./useBackgroundRefresh";

export function useModels(harness: Harness, accountId?: string, projectId?: string, fallback?: ModelOption[], enabled = true) {
	const api = window.phaseoDesktop?.workspace;
	const available = enabled && !!api && harness !== "acp" && (!["phaseo", "cursor"].includes(harness) || !!accountId);
	const { data, error } = useSWR<ModelOption[]>(
		available ? ["workspace-models", harness, accountId ?? "", projectId ?? ""] : null,
		() => api!.models(harness, accountId || undefined, projectId || undefined),
		{ fallbackData: fallback?.length ? fallback : undefined, dedupingInterval: BACKGROUND_REFRESH_MS, refreshInterval: BACKGROUND_REFRESH_MS, revalidateOnFocus: false,
			onErrorRetry: (_error, _key, _config, revalidate, options) => { setTimeout(() => { void revalidate(options); }, BACKGROUND_REFRESH_MS); } },
	);
	const models = available ? data ?? [] : fallback ?? [];
	return {
		models,
		loading: available && data === undefined && !error,
		error: error ? (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "",
	};
}
