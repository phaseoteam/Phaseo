import { createClient } from "@/utils/supabase/client";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import type { AccountQueryScope } from "./queryKeys";
import type { InvestigateGenerationResult } from "@/app/(dashboard)/gateway/usage/server-actions";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";

/** Tokens are read at request time and never become query keys or cached data. */
export async function fetchPrivateUsage<T>(path: `/api/account/${string}`, scope: AccountQueryScope, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
	const { data } = await createClient().auth.getSession();
	if (!scope.userId || !scope.workspaceId || data.session?.user.id !== scope.userId) {
		throw new WebApiError(path, 401, "Your session changed. Sign in again.");
	}
	signal.throwIfAborted();
	return fetchAccountWebApi<T>(path, process.env.NODE_ENV === "development" ? null : data.session.access_token, { ...init, signal, cache: "no-store" });
}

export async function fetchPrivateUsageOperation<T>(operation: string, args: unknown[], scope: AccountQueryScope, signal: AbortSignal): Promise<T> {
	const response = await fetchPrivateUsage<{ result: T }>("/api/account/settings/usage/actions", scope, signal, {
		method: "POST",
		body: JSON.stringify({ workspaceId: scope.workspaceId, operation, args }),
	});
	return response.result;
}

export async function fetchPrivateUsageRequest(requestId: string, scope: AccountQueryScope, signal: AbortSignal) {
	const { data } = await fetchPrivateUsage<{ data: InvestigateGenerationResult }>(
		`/api/account/settings/usage/logs/${encodeURIComponent(requestId)}?workspaceId=${encodeURIComponent(scope.workspaceId!)}`,
		scope,
		signal,
	);
	return {
		success: true,
		data: {
			...data,
			providerNames: (data.providerNames ?? []).map(([providerId, providerName]): [string, string] => [providerId, resolveProviderDisplayName({ providerId, providerName })]),
		},
	};
}
