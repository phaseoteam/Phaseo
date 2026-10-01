import { fetchPublicWebApi } from "@/lib/web-api/client";

export async function publicFetcher<T>(
	path: `/api/_web/${string}`,
	options: { signal?: AbortSignal } = {},
): Promise<T> {
	return fetchPublicWebApi<T>(path, {
		signal: options.signal,
		credentials: "omit",
	});
}
