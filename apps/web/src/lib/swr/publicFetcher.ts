import { WebApiError } from "@/lib/web-api/client";

function shouldSendPreviewCredentials() {
	return typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app");
}

export async function publicSWRFetcher<T>(path: string): Promise<T> {
	const response = await fetch(path, {
		headers: { Accept: "application/json" },
		// Public production API calls stay anonymous for shared-cache safety. A
		// Vercel preview needs the same-origin Vercel auth cookie to pass
		// Deployment Protection before the request can reach the Worker.
		credentials: shouldSendPreviewCredentials() ? "same-origin" : "omit",
	});

	if (!response.ok) {
		throw new WebApiError(path, response.status);
	}

	return (await response.json()) as T;
}
