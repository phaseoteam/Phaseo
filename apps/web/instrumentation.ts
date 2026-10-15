import type { Instrumentation } from "next";
import { PostHog } from "posthog-node";

import { POSTHOG_API_HOST, POSTHOG_KEY } from "@/lib/analytics";
import { readAnalyticsConsentFromCookieHeader } from "@/lib/cookieConsent";
import { readPosthogCookieIdentity } from "@/lib/posthogCookie";

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
	const rawCookieHeader = request.headers.cookie;
	const cookieHeader = Array.isArray(rawCookieHeader) ? rawCookieHeader.join("; ") : rawCookieHeader;
	if (readAnalyticsConsentFromCookieHeader(cookieHeader) !== "accepted") return;
	const client = getPosthogClient();
	if (!client) return;
	// Link the error to the visitor's person and replay when the browser SDK has a cookie.
	const visitor = readPosthogCookieIdentity(cookieHeader, POSTHOG_KEY);

	try {
		await client.captureExceptionImmediate(error, visitor?.distinctId ?? "web-server", {
			...(visitor?.sessionId ? { $session_id: visitor.sessionId } : {}),
			// Matches the browser's identified_only mode: no profiles for anonymous visitors.
			...(visitor?.identified ? {} : { $process_person_profile: false }),
			deploy_time: process.env.NEXT_PUBLIC_DEPLOY_TIME,
			digest: (error as Error & { digest?: string }).digest,
			environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
			method: request.method,
			path: request.path,
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
