import type { Instrumentation } from "next";
import { PostHog } from "posthog-node";

import { POSTHOG_API_HOST, POSTHOG_KEY } from "@/lib/analytics";
import { isAnalyticsBlockedPath, readAnalyticsConsentFromCookieHeader } from "@/lib/cookieConsent";

export function register() {}

let posthogClient: PostHog | null = null;

function getPosthogClient(): PostHog | null {
	if (!POSTHOG_KEY) return null;
	if (posthogClient) return posthogClient;

	const host = POSTHOG_API_HOST.startsWith("http")
		? POSTHOG_API_HOST
		: "https://eu.i.posthog.com";
	posthogClient = new PostHog(POSTHOG_KEY, { host });
	return posthogClient;
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
	const cookieHeader = request.headers.cookie;
	if (readAnalyticsConsentFromCookieHeader(Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader) !== "accepted") return;
	const client = getPosthogClient();
	if (!client) return;

	try {
		await client.captureExceptionImmediate(error, "web-server", {
			deploy_time: process.env.NEXT_PUBLIC_DEPLOY_TIME,
			digest: (error as Error & { digest?: string }).digest,
			environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
			method: request.method,
			// Feedback links carry a credential in the path; report the route instead.
			path: isAnalyticsBlockedPath(request.path.split("?")[0]) ? context.routePath : request.path,
			release:
				process.env.NEXT_PUBLIC_RELEASE ??
				process.env.VERCEL_GIT_COMMIT_SHA ??
				process.env.CF_PAGES_COMMIT_SHA,
			render_source: context.renderSource,
			route_path: context.routePath,
			route_type: context.routeType,
			router_kind: context.routerKind,
		});
	} catch {
		// Error reporting must never turn a render failure into a second failure.
	}
};
