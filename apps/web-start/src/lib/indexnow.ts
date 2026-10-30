import { absoluteUrl, SITE_URL } from "@/lib/seo";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
const INDEXNOW_KEY_PATH = "/indexnow-key.txt";
const MODEL_INDEXNOW_SUFFIXES = [
	"",
	"/quickstart",
	"/benchmarks",
	"/providers",
	"/family",
	"/performance",
] as const;
const PROVIDER_INDEXNOW_SUFFIXES = ["", "/models"] as const;

export const INDEXNOW_KEY = String(process.env.INDEXNOW_KEY ?? "").trim();

function isPublicHttpsSite(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;

		const hostname = parsed.hostname.toLowerCase();
		return !(
			hostname === "localhost" ||
			hostname === "127.0.0.1" ||
			hostname === "0.0.0.0"
		);
	} catch {
		return false;
	}
}

export function isIndexNowEnabled(): boolean {
	return Boolean(INDEXNOW_KEY) && isPublicHttpsSite(SITE_URL);
}

export function getIndexNowKeyLocation(): string {
	return absoluteUrl(INDEXNOW_KEY_PATH);
}

export function getIndexNowModelUrls(modelId: string): string[] {
	const trimmedModelId = modelId.trim().replace(/^\/+|\/+$/g, "");
	if (!trimmedModelId) return [];

	return MODEL_INDEXNOW_SUFFIXES.map((suffix) =>
		absoluteUrl(`/models/${trimmedModelId}${suffix}`),
	);
}

export function getIndexNowProviderUrls(providerId: string): string[] {
	const trimmedProviderId = providerId.trim().replace(/^\/+|\/+$/g, "");
	if (!trimmedProviderId) return [];

	return PROVIDER_INDEXNOW_SUFFIXES.map((suffix) =>
		absoluteUrl(`/api-providers/${trimmedProviderId}${suffix}`),
	);
}

export async function submitIndexNowUrls(
	urls: string[],
	context: string,
): Promise<void> {
	if (!isIndexNowEnabled()) {
		return;
	}

	const uniqueUrls = Array.from(
		new Set(
			urls
				.map((url) => String(url).trim())
				.filter((url) => url.startsWith("https://")),
		),
	);
	if (!uniqueUrls.length) {
		return;
	}

	const host = new URL(SITE_URL).host;

	try {
		const response = await fetch(INDEXNOW_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({
				host,
				key: INDEXNOW_KEY,
				keyLocation: getIndexNowKeyLocation(),
				urlList: uniqueUrls,
			}),
		});

		if (!response.ok) {
			console.warn("[indexnow] submission failed", {
				context,
				status: response.status,
				statusText: response.statusText,
			});
		}
	} catch (error) {
		console.warn("[indexnow] submission error", {
			context,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
