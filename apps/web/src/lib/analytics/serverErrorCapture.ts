// Server-side error reporting to PostHog for request and render failures.
// Only visitors who accepted analytics cookies are reported, and credential
// paths (feedback links) report the route pattern instead of the real path.
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { PostHog } from "posthog-node";

import { POSTHOG_API_HOST, POSTHOG_KEY } from "@/lib/analytics";
import { isAnalyticsBlockedPath, readAnalyticsConsentFromCookieHeader } from "@/lib/cookieConsent";
import { readPosthogCookieIdentity } from "@/lib/posthogCookie";
import { waitUntil } from "@/lib/start/wait-until";
import { getPhaseoEnv } from "@/lib/deployEnv";

export type ServerErrorContext = {
	/** Where the error surfaced: an unhandled request failure or a route error boundary. */
	source: "request" | "render";
	/** The matched route id (for example `/{-$locale}/feedback/$token`), when known. */
	routePath?: string;
};

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

async function capture(error: unknown, request: Request, context: ServerErrorContext): Promise<void> {
	const cookieHeader = request.headers.get("cookie");
	if (readAnalyticsConsentFromCookieHeader(cookieHeader) !== "accepted") return;
	const client = getPosthogClient();
	if (!client) return;
	// Link the error to the visitor's person and replay when the browser SDK has a cookie.
	const visitor = readPosthogCookieIdentity(cookieHeader, POSTHOG_KEY);
	const url = new URL(request.url);
	const path = `${url.pathname}${url.search}`;

	try {
		await client.captureExceptionImmediate(error, visitor?.distinctId ?? "web-server", {
			...(visitor?.sessionId ? { $session_id: visitor.sessionId } : {}),
			// Matches the browser's identified_only mode: no profiles for anonymous visitors.
			...(visitor?.identified ? {} : { $process_person_profile: false }),
			deploy_time: process.env.PUBLIC_DEPLOY_TIME,
			digest: (error as Error & { digest?: string } | null)?.digest,
			environment: getPhaseoEnv(),
			method: request.method,
			// Feedback links carry a credential in the path; report the route instead.
			path: isAnalyticsBlockedPath(url.pathname) ? (context.routePath ?? "[redacted]") : path,
			release: process.env.PUBLIC_RELEASE,
			render_source: context.source,
			route_path: context.routePath,
			route_type: context.source === "render" ? "render" : "route",
			router_kind: "tanstack-start",
		});
	} catch {
		// Error reporting must never turn a failure into a second failure.
	}
}

/** Reports a server error in the background; the response is not delayed. */
export function captureServerError(error: unknown, request: Request, context: ServerErrorContext): void {
	// Redirects and not-found are control flow, not failures.
	if (error instanceof Response || isRedirect(error) || isNotFound(error)) return;
	void waitUntil(capture(error, request, context));
}
