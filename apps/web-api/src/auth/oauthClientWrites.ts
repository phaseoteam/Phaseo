import type { MiddlewareHandler } from "hono";
import { hasOAuthClientToken } from "@/auth/requireUser";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

// A token issued to an OAuth client (Phaseo's CLI and desktop app included, since their client IDs are public)
// may read anything its person can, but may write only these ordinary, personal or read-only-over-POST routes.
// Every other write is refused, so a new route is refused until someone decides it belongs here.
const ALLOWED_WRITES: Array<[method: string, path: RegExp]> = [
	["POST", /^\/api\/account\/auth\/workspace-accessed$/],
	["PUT", /^\/api\/account\/auth\/onboarding$/],
	["POST", /^\/api\/account\/chat\/issues$/],
	["POST", /^\/api\/account\/credits\/redeem$/],
	["POST", /^\/api\/account\/settings\/privacy\/review$/],
	["*", /^\/api\/account\/settings\/mobile-notifications(\/.*)?$/],
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

export const refuseOAuthClientWrites: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	if (!oauthClientMayWrite(c.req.method, c.req.path) && hasOAuthClientToken(c.req.raw)) {
		return c.json({ error: "forbidden", reason: "oauth_client_write_refused", message: OAUTH_CLIENT_WRITE_REFUSAL }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	await next();
};
