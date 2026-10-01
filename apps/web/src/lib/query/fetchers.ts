import type { QueryFunctionContext } from "@tanstack/react-query";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import {
	fetchAccountWebApi,
	WebApiError,
} from "@/lib/web-api/client";
import { publicFetcher } from "@/lib/query/publicFetcher";

export function publicQueryFetcher<T>(
	path: `/api/_web/${string}`,
) {
	return ({ signal }: QueryFunctionContext) =>
		publicFetcher<T>(path, { signal });
}

export function accountQueryFetcher<T>(
	path: `/api/account/${string}`,
	accessToken?: string | null,
) {
	return async ({ signal }: QueryFunctionContext) => {
		const resolvedAccessToken =
			accessToken === undefined
				? await getBrowserAccessToken()
				: accessToken;
		return fetchAccountWebApi<T>(path, resolvedAccessToken, { signal });
	};
}

export async function fetchJsonQuery<T>(
	path: string,
	options: { signal?: AbortSignal } = {},
): Promise<T> {
	const response = await fetch(path, {
		method: "GET",
		headers: { Accept: "application/json" },
		credentials: "omit",
		cache: "no-store",
		signal: options.signal,
	});
	if (!response.ok) throw new WebApiError(path, response.status);
	return (await response.json()) as T;
}
