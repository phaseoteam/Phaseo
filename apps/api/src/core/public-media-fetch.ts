import type { ExecutorUpstreamTiming } from "@executors/types";
import { readStreamBytesWithLimit } from "./bounded-stream";
import { validateWebhookEndpointUrlForDelivery } from "./webhook-endpoints";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

export type PublicMediaResponse = {
	bytes: Uint8Array;
	contentType: string | null;
	url: string;
};

export async function fetchPublicMedia(args: {
	url: string;
	maxBytes: number;
	headers?: HeadersInit;
	timeoutMs?: number;
	allowHttp?: boolean;
	upstreamTiming?: ExecutorUpstreamTiming;
}): Promise<PublicMediaResponse> {
	let currentUrl = args.url;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		const validated = await validateWebhookEndpointUrlForDelivery(currentUrl, { allowHttp: args.allowHttp ?? true });
		if (validated.ok === false) throw new Error(`remote_media_url_rejected_${validated.reason}`);
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
		let response: Response;
		try {
			const init: RequestInit = { headers: args.headers, redirect: "manual", signal: controller.signal };
			response = await (args.upstreamTiming
				? args.upstreamTiming.fetch(validated.url, init, "media")
				: fetch(validated.url, init));
			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get("location");
				await response.body?.cancel().catch(() => undefined);
				if (!location || hop === MAX_REDIRECTS) throw new Error("remote_media_redirect_rejected");
				currentUrl = new URL(location, validated.url).toString();
				continue;
			}
			if (!response.ok) {
				await response.body?.cancel().catch(() => undefined);
				throw new Error(`remote_media_fetch_failed_${response.status}`);
			}
			const rawLength = response.headers.get("content-length");
			if (rawLength !== null && !/^\d+$/.test(rawLength.trim())) {
				await response.body?.cancel().catch(() => undefined);
				throw new Error("remote_media_invalid_content_length");
			}
			const declaredLength = rawLength === null ? null : Number(rawLength);
			if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength > args.maxBytes)) {
				await response.body?.cancel().catch(() => undefined);
				throw new Error("remote_media_too_large");
			}
			const bytes = await readStreamBytesWithLimit(response.body, args.maxBytes, "remote_media_too_large");
			return {
				bytes,
				contentType: response.headers.get("content-type"),
				url: validated.url,
			};
		} finally {
			clearTimeout(timeoutId);
		}
	}
	throw new Error("remote_media_redirect_rejected");
}
