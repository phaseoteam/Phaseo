import type { MiddlewareHandler } from "hono";
import { hasOAuthClientToken } from "@/auth/requireUser";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

// Account routes that change what can spend, who has access, where workspace content and events go, or what a
// preset or route runs. A token issued to an OAuth client (Phaseo's CLI and desktop app included, since their
// client IDs are public) can read them but not write them; the person makes these changes in the dashboard,
// and automation uses the management API with a management key. Paths are relative to /api/account.
const SENSITIVE_WRITE_PATHS = [
	// Preset content: create, change, publish, fork, upstream and labels. The publisher handle isn't content.
	/^\/settings\/presets(?!\/publisher$)(\/|$)/,
	/^\/settings\/routing\/(auto|successor)(\/|$)/,
	/^\/settings\/dynamic-routes(\/|$)/,
	// Spending and access.
	/^\/settings\/(keys|management-keys|key-security|budgets|guardrails|rate-limits|spend-rules|trusted-workloads)(\/|$)/,
	/^\/settings\/teams\/[^/]+\/(invites|members|sso|scim)(\/|$)/,
	/^\/credits\/(auto-top-up|admin)(\/|$)/,
	// Where content and events go: logging and privacy (on guardrails above), destinations, provider keys,
	// private models, classifiers, data contribution, webhooks, notification routes and the Slack integration.
	/^\/settings\/(broadcast|webhooks|byok|byok-fallback|classifiers|data-contribution|slack)(\/|$)/,
	/^\/credits\/(notification-destinations|notification-routes)(\/|$)/,
	/^\/private-models(\/|$)/,
];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const OAUTH_CLIENT_WRITE_REFUSAL = "This change can't be made with a Phaseo CLI or desktop app sign-in. Make it in the Phaseo dashboard, or call the API with a management key.";

export function isSensitiveAccountWrite(method: string, path: string): boolean {
	if (!WRITE_METHODS.has(method.toUpperCase())) return false;
	const relative = path.replace(/^\/api\/account(?=\/|$)/, "");
	return SENSITIVE_WRITE_PATHS.some((pattern) => pattern.test(relative));
}

export const refuseOAuthClientSensitiveWrites: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	if (isSensitiveAccountWrite(c.req.method, c.req.path) && hasOAuthClientToken(c.req.raw)) {
		return c.json({ error: "forbidden", reason: "oauth_client_write_refused", message: OAUTH_CLIENT_WRITE_REFUSAL }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	await next();
};
