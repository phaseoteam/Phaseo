import { buildVideoPricingRequestOptions } from "@core/video-request-options";

export function bflVideoPricingOptions(resolution: string, mode: string, draft: boolean) {
	const options = buildVideoPricingRequestOptions({ resolution, mode });
	return { ...options, video_params: { ...(options.video_params as Record<string, unknown>), mode, draft } };
}

export function trustedBflPollingUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && (url.hostname === "api.bfl.ai" || url.hostname.endsWith(".bfl.ai")) && !url.username && !url.password && !url.port
			? url.toString() : null;
	} catch { return null; }
}
