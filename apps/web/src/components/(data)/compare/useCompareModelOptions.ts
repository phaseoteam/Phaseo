import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { webQueryKeys } from "@/lib/query/queryKeys";
import { fetchPublicWebApi } from "@/lib/web-api/client";
import type { CompareModelOption } from "./types";

const compareModelOptionsQuery = {
	queryKey: webQueryKeys.public.compareModelOptions(),
	queryFn: async ({ signal }: { signal: AbortSignal }) =>
		(await fetchPublicWebApi<{ models: CompareModelOption[] }>("/api/_web/compare/options", { signal, credentials: "same-origin" })).models,
};

/**
 * Every model the compare picker can list. Pages don't embed it: browsers load
 * it from the Cloudflare web API when a picker first opens.
 */
export function useCompareModelOptions(enabled: boolean) {
	return useQuery({ ...compareModelOptionsQuery, enabled });
}

/** Starts loading the list as soon as a pointer or focus reaches a picker. */
export function usePrefetchCompareModelOptions() {
	const queryClient = useQueryClient();
	return useCallback(() => {
		void queryClient.prefetchQuery(compareModelOptionsQuery);
	}, [queryClient]);
}
