import { getSupabaseAdmin } from "@/runtime/env";
import { json } from "@/routes/utils";

export type ManagementRouteAuth = {
	authMethod?: "api_key" | "oauth";
	userId?: string | null;
	oauthScopes?: string[];
	scopes?: string[];
};

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
			? (auth.scopes ?? auth.oauthScopes ?? [])
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

export async function requireOAuthWorkspaceRole(
	auth: ManagementRouteAuth,
	workspaceId: string,
	allowedRoles: string[],
): Promise<Response | null> {
	if (auth.authMethod !== "oauth") return null;
	const userId = auth.userId?.trim();
	if (!userId) {
		return json({ error: "forbidden", message: "OAuth user is required" }, 403, { "Cache-Control": "no-store" });
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

export function internalServerError(operation: string, error: unknown): Response {
	const requestId = crypto.randomUUID();
	console.error("control_plane_operation_failed", {
		operation,
		request_id: requestId,
		error_type: error instanceof Error ? error.name : typeof error,
	});
	return json(
		{ error: "internal_error", message: "Phaseo could not complete this request.", request_id: requestId },
		500,
		{ "Cache-Control": "no-store" },
	);
}
