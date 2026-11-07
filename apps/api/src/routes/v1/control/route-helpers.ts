import { isFirstPartyOAuthClient } from "@/lib/oauth/clientIds";
import { getSupabaseAdmin } from "@/runtime/env";
import { json } from "@/routes/utils";

export type ManagementRouteAuth = {
	authMethod?: "api_key" | "oauth";
	userId?: string | null;
	oauthScopes?: string[];
	scopes?: string[];
	oauthClientId?: string | null;
	apiKeyRef?: string;
	internal?: boolean;
};

/**
 * Whether the caller is an app that signs in with Phaseo OAuth: any OAuth client except Phaseo's own CLI
 * and desktop app. Dashboard sessions (the person in Settings) are OAuth-shaped but carry no client, or
 * Phaseo's own app's; any other OAuth caller without a client counts as an app, so a missing ID fails closed.
 */
export function isThirdPartyOAuthApp(auth: ManagementRouteAuth): boolean {
	if (auth.authMethod !== "oauth") return false;
	const clientId = String(auth.oauthClientId ?? "").trim();
	if (!clientId) return auth.apiKeyRef !== "dashboard";
	return !isFirstPartyOAuthClient(clientId);
}

/**
 * Whether the caller signed in through Phaseo's CLI or desktop app. Their client IDs are public: anyone can
 * start a device or loopback sign-in with them, and the token is genuine once the person approves. So such a
 * token doesn't show that the person is using Phaseo's own app, and it gets no exemption from the refusals
 * below. Dashboard sessions with no client are the person in Settings.
 */
export function isPublicNativeOAuthClient(auth: ManagementRouteAuth): boolean {
	if (auth.authMethod !== "oauth") return false;
	const clientId = String(auth.oauthClientId ?? "").trim();
	return clientId !== "" && isFirstPartyOAuthClient(clientId);
}

export const PUBLIC_NATIVE_CLIENT_REFUSAL = "This change can't be made with a Phaseo CLI or desktop app sign-in. Make it in the Phaseo dashboard, or call the API with a management key.";

/**
 * An app that signs in with Phaseo may not create, mint, re-enable or change anything that can spend the
 * workspace's money, or change a limit on that spending, whatever scopes and role it holds: API keys,
 * management keys, trusted workloads, members, invites and identity providers, and budgets, guardrails,
 * rate limits and spend rules. Otherwise a credential it made or reshaped would escape the monthly limit
 * the person set on the consent screen. The same goes for changes to where workspace content and events
 * go. The person makes these changes in Settings.
 *
 * A CLI or desktop sign-in is refused too (isPublicNativeOAuthClient), with a message pointing to the
 * dashboard or a management key. API keys, management keys and dashboard sessions are unaffected.
 */
export function rejectThirdPartyOAuthSpendingChange(auth: ManagementRouteAuth, message: string): Response | null {
	if (isThirdPartyOAuthApp(auth)) return json({ error: "forbidden", message }, 403, { "Cache-Control": "no-store" });
	if (isPublicNativeOAuthClient(auth)) return json({ error: "forbidden", message: PUBLIC_NATIVE_CLIENT_REFUSAL }, 403, { "Cache-Control": "no-store" });
	return null;
}

/**
 * Whether a management request may name a workspace other than its token's with `workspace_id`.
 * Only Phaseo's own CLI and desktop app, signed in as a person, may. The route must then check that
 * person's role in the named workspace (requireOAuthWorkspaceRole) before acting there. API keys,
 * management keys, dashboard sessions and apps that use Sign in with Phaseo stay in their token's
 * workspace: their access was granted for that workspace alone.
 */
export function canTargetOtherWorkspace(auth: ManagementRouteAuth): boolean {
	if (auth.authMethod !== "oauth") return false;
	if (!auth.userId?.trim()) return false;
	const clientId = String(auth.oauthClientId ?? "").trim();
	return Boolean(clientId) && isFirstPartyOAuthClient(clientId);
}

export function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return fallback;
	const normalized = Math.floor(parsed);
	if (normalized <= 0) return fallback;
	return Math.min(normalized, max);
}

export function parseOffset(raw: string | null): number {
	if (!raw) return 0;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

export function parsePathId(url: URL, collectionName: string): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const candidate = segments.at(-1);
	if (!candidate || candidate === collectionName) return null;
	return decodeURIComponent(candidate).trim() || null;
}

export function requireCapability(
	auth: ManagementRouteAuth,
	scope: string,
	options?: { requireExplicitNonOAuthScope?: boolean },
): Response | null {
	const grantedScopes =
		auth.authMethod === "oauth"
			? [...new Set([...(auth.scopes ?? []), ...(auth.oauthScopes ?? [])])]
			: (auth.scopes ?? []);
	if (auth.authMethod !== "oauth" && grantedScopes.length === 0 && !options?.requireExplicitNonOAuthScope) {
		return null;
	}
	if (!grantedScopes.includes(scope)) {
		return json(
			{ error: "insufficient_scope", message: `Token requires ${scope}` },
			403,
			{ "Cache-Control": "no-store" },
		);
	}
	return null;
}

/**
 * Checks the caller's current role in the workspace. An OAuth caller acts as the signed-in person. A
 * management key acts as the person who created it, so the key keeps only the power its creator still
 * has: once the creator is demoted to member (or removed), the key no longer passes owner or admin checks.
 * A management key with no recorded creator fails closed. Phaseo's internal callers are not limited here.
 */
export async function requireOAuthWorkspaceRole(
	auth: ManagementRouteAuth,
	workspaceId: string,
	allowedRoles: string[],
): Promise<Response | null> {
	const isOAuth = auth.authMethod === "oauth";
	if (!isOAuth && auth.internal) return null;
	const userId = auth.userId?.trim();
	if (!userId) {
		return json(
			{
				error: "forbidden",
				message: isOAuth
					? "OAuth user is required"
					: "This management key has no creator, so its workspace role can't be checked. Create a new management key.",
			},
			403,
			{ "Cache-Control": "no-store" },
		);
	}
	const { data, error } = await getSupabaseAdmin()
		.from("workspace_members")
		.select("role")
		.eq("workspace_id", workspaceId)
		.eq("user_id", userId)
		.maybeSingle();
	if (error || !data) {
		return json({ error: "forbidden", message: "Workspace membership is required" }, 403, { "Cache-Control": "no-store" });
	}
	const role = String((data as { role?: unknown }).role ?? "").toLowerCase();
	if (!allowedRoles.includes(role)) {
		return json(
			{ error: "forbidden", message: `Workspace role must be one of: ${allowedRoles.join(", ")}` },
			403,
			{ "Cache-Control": "no-store" },
		);
	}
	return null;
}

/**
 * Owner-only changes, as in Settings: changing roles, making someone an admin, removing other members,
 * deleting the workspace, and SSO and SCIM trust. The caller is the signed-in person for OAuth and the
 * key's creator for a management key. Only workspaces.owner_user_id counts: a membership row can still
 * say "owner" after the workspace changes hands. Pass owner_user_id when the workspace row is already
 * loaded; otherwise it is looked up.
 */
export async function requireWorkspaceOwner(
	auth: ManagementRouteAuth,
	workspace: { id: string; owner_user_id?: string | null },
	message: string,
): Promise<Response | null> {
	if (auth.internal && auth.authMethod !== "oauth") return null;
	const userId = String(auth.userId ?? "").trim();
	if (userId) {
		const supabase = getSupabaseAdmin();
		let ownerUserId = workspace.owner_user_id;
		if (ownerUserId === undefined) {
			const { data, error } = await supabase.from("workspaces").select("owner_user_id").eq("id", workspace.id).maybeSingle();
			ownerUserId = error ? null : ((data as { owner_user_id?: string | null } | null)?.owner_user_id ?? null);
		}
		if (ownerUserId && userId === ownerUserId) return null;
	}
	return json({ error: "forbidden", message }, 403, { "Cache-Control": "no-store" });
}

export async function requireJsonBody(req: Request): Promise<Record<string, unknown> | Response> {
	try {
		const body = (await req.json()) as unknown;
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return json({ error: "invalid_json", message: "JSON body must be an object" }, 400, { "Cache-Control": "no-store" });
		}
		return body as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}
}

export function isResponse(value: unknown): value is Response {
	return value instanceof Response;
}

export function internalServerError(operation: string, _error: unknown): Response {
	const requestId = crypto.randomUUID();
	console.error("control_plane_operation_failed", {
		operation,
		request_id: requestId,
	});
	return json(
		{ error: "internal_error", message: "Phaseo could not complete this request.", request_id: requestId },
		500,
		{ "Cache-Control": "no-store" },
	);
}
