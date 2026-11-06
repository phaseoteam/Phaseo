import type { Context, MiddlewareHandler } from "hono";
import { hasOAuthClientToken } from "@/auth/requireUser";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

// A token issued to an OAuth client (Phaseo's CLI and desktop app included, since their client IDs are public)
// may read anything its person can, but may write only these ordinary, personal or read-only-over-POST routes.
// Every other write is refused, so a new route is refused until someone decides it belongs here.
const ALLOWED_WRITES: Array<[method: string, path: RegExp]> = [
	["POST", /^\/api\/account\/auth\/workspace-accessed$/],
	// Onboarding progress only; the handler refuses the workspace and key it would steer the dashboard to.
	["PUT", /^\/api\/account\/auth\/onboarding$/],
	["POST", /^\/api\/account\/chat\/issues$/],
	["POST", /^\/api\/account\/credits\/redeem$/],
	// Push devices receive private balance, payment and key alerts, so an app may only take notifications
	// away: unregister the caller's own device, or switch notifications or categories off (the handler
	// refuses anything else). Registering a device, rules and test pushes stay refused.
	["DELETE", /^\/api\/account\/settings\/mobile-notifications\/devices\/[^/]+$/],
	["PUT", /^\/api\/account\/settings\/mobile-notifications$/],
	// Name and display preferences; the handler refuses default_workspace_id, which picks the workspace
	// browser chat and the dashboard use when no workspace is selected.
	["PUT", /^\/api\/account\/settings\/account\/profile$/],
	["POST", /^\/api\/account\/settings\/profile\/avatar$/],
	["POST", /^\/api\/account\/settings\/teams\/[^/]+\/logo$/],
	["DELETE", /^\/api\/account\/settings\/teams\/[^/]+\/logo$/],
	["POST", /^\/api\/account\/settings\/teams$/],
	// Renames the workspace; the handler changes nothing else.
	["PUT", /^\/api\/account\/settings\/teams\/[^/]+$/],
	// Reads usage over POST.
	["POST", /^\/api\/account\/settings\/usage\/actions$/],
	["PUT", /^\/api\/account\/settings\/beta$/],
	["PUT", /^\/api\/account\/settings\/preferences$/],
	// An authorized app's scopes can only be reduced, and an app can be revoked.
	["PATCH", /^\/api\/account\/settings\/authorized-apps\/[^/]+\/scopes$/],
	["DELETE", /^\/api\/account\/settings\/authorized-apps\/[^/]+$/],
	["POST", /^\/api\/account\/settings\/provider-onboarding\/preview$/],
];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const OAUTH_CLIENT_WRITE_REFUSAL = "This change can't be made with a Phaseo CLI or desktop app sign-in. Make it in the Phaseo dashboard, or call the API with a management key.";

/** Whether an OAuth client's token may make this request. Reads always may. */
export function oauthClientMayWrite(method: string, path: string): boolean {
	const verb = method.toUpperCase();
	if (!WRITE_METHODS.has(verb)) return true;
	return ALLOWED_WRITES.some(([allowed, pattern]) => (allowed === "*" || allowed === verb) && pattern.test(path));
}

/** The 403 every OAuth-client write refusal returns. */
export function oauthClientWriteRefused(c: Context) {
	return c.json({ error: "forbidden", reason: "oauth_client_write_refused", message: OAUTH_CLIENT_WRITE_REFUSAL }, 403, PRIVATE_NO_STORE_HEADERS);
}

export const refuseOAuthClientWrites: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	if (!oauthClientMayWrite(c.req.method, c.req.path) && hasOAuthClientToken(c.req.raw)) return oauthClientWriteRefused(c);
	await next();
};
