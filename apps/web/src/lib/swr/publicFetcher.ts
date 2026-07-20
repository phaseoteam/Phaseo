import { WebApiError } from "@/lib/web-api/client";

export async function publicSWRFetcher<T>(path: string): Promise<T> {
	const response = await fetch(path, {
		headers: { Accept: "application/json" },
		credentials: "omit",
	});

	if (!response.ok) {
		throw new WebApiError(path, response.status);
	}

	return (await response.json()) as T;
}
