import { WEB_QUERY_POLICIES } from "./policies";
import { webQueryKeys, type AccountQueryScope } from "./queryKeys";

export type UsageSearchParams = Record<string, string | string[] | undefined>;
export const LIVE_USAGE_INTERVAL_MS = 15_000;

export function readUsageSearchParams(params: URLSearchParams): UsageSearchParams {
	return Object.fromEntries(Array.from(new Set(params.keys()), (key) => {
		const values = params.getAll(key);
		return [key, values.length === 1 ? values[0] : values];
	}));
}

export function usageSearchParams(params: UsageSearchParams): URLSearchParams {
	const result = new URLSearchParams();
	for (const key of Object.keys(params).sort()) {
		const value = params[key];
		if (Array.isArray(value)) value.forEach((item) => result.append(key, item));
		else if (value !== undefined) result.set(key, value);
	}
	return result;
}

export function privateUsageOptions(scope: AccountQueryScope, resource: string, params: UsageSearchParams, live = false) {
	return {
		...WEB_QUERY_POLICIES.private,
		queryKey: [...webQueryKeys.account.scope(scope), "usage", resource, usageSearchParams(params).toString(), live ? "live" : "cached"] as const,
		staleTime: live ? 0 : WEB_QUERY_POLICIES.private.staleTime,
		gcTime: live ? 0 : WEB_QUERY_POLICIES.private.gcTime,
		refetchOnMount: live ? "always" as const : true,
		refetchInterval: live ? LIVE_USAGE_INTERVAL_MS : WEB_QUERY_POLICIES.private.refetchInterval,
	};
}
