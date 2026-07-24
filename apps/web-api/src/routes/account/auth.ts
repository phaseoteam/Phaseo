import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

function cookieValue(request: Request, name: string): string | null {
	for (const segment of (request.headers.get("cookie") ?? "").split(";")) {
		const separator = segment.indexOf("=");
		if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;
		const value = segment.slice(separator + 1).trim();
		try { return decodeURIComponent(value) || null; } catch { return value || null; }
	}
	return null;
}

function metadataString(metadata: Record<string, unknown>, keys: string[]): string | null {
	for (const key of keys) {
		const value = metadata[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

function normalizeBetaFeatures(value: unknown): Record<string, boolean> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, boolean] =>
			typeof entry[1] === "boolean",
		),
	);
}

export const accountAuthRouter = new Hono<{ Bindings: Env }>();

accountAuthRouter.get("/status", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({ isAdmin: false, role: null, signedIn: false }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const { data, error } = await getDataClient(c.env)
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();
	if (error) {
		console.error("[web-api/account/auth] status failed", { userId: user.id, error });
		return c.json({ error: "auth_status_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({
		isAdmin: String(data?.role ?? "").toLowerCase() === "admin",
		role: data?.role ?? null,
		signedIn: true,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountAuthRouter.get("/onboarding", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ signedIn: false, user: null, workspaces: [] }, 200, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const [userResult, workspacesResult] = await Promise.all([
		client.from("users").select("onboarding_state,onboarding_completed_at,default_workspace_id").eq("user_id", user.id).maybeSingle(),
		client.from("workspace_members").select("workspace_id,role,workspaces(id,name)").eq("user_id", user.id).in("role", ["owner", "admin"]),
	]);
	if (userResult.error || workspacesResult.error) return c.json({ error: "onboarding_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ signedIn: true, user: userResult.data ?? null, workspaces: workspacesResult.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountAuthRouter.get("/workspace", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ signedIn: false, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const requested = String(c.req.query("requested") ?? "").trim();
	const requestedRoles = String(c.req.query("roles") ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
	const [userResult, membershipsResult, ownedResult] = await Promise.all([
		client.from("users").select("default_workspace_id").eq("user_id", user.id).maybeSingle(),
		client.from("workspace_members").select("workspace_id,role").eq("user_id", user.id).order("workspace_id", { ascending: true }),
		client.from("workspaces").select("id").eq("owner_user_id", user.id).order("id", { ascending: true }),
	]);
	if (userResult.error || membershipsResult.error || ownedResult.error) return c.json({ error: "workspace_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const roleAllowed = (role: string) => requestedRoles.length === 0 || requestedRoles.includes(role) || (role === "owner" && requestedRoles.includes("admin"));
	const accessible = new Set([
		...(membershipsResult.data ?? []).filter((row) => roleAllowed(String(row.role ?? "member").toLowerCase())).map((row) => String(row.workspace_id ?? "")),
		...((roleAllowed("owner") ? ownedResult.data : []) ?? []).map((row) => String(row.id ?? "")),
	].filter(Boolean));
	const defaultWorkspaceId = String(userResult.data?.default_workspace_id ?? "").trim();
	const workspaceId = (requested && accessible.has(requested) ? requested : null) ?? (defaultWorkspaceId && accessible.has(defaultWorkspaceId) ? defaultWorkspaceId : null) ?? [...accessible].sort()[0] ?? null;
	if (workspaceId && workspaceId !== defaultWorkspaceId && c.req.query("persist") !== "0") {
		const update = await client.from("users").update({ default_workspace_id: workspaceId }).eq("user_id", user.id);
		if (update.error) return c.json({ error: "workspace_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ signedIn: true, userId: user.id, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountAuthRouter.get("/workspace-access", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ allowed: false, role: null, userId: null }, 401, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = String(c.req.query("workspaceId") ?? "").trim();
	if (!workspaceId) return c.json({ allowed: false, role: null, userId: user.id }, 400, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const [membership, workspace] = await Promise.all([
		client.from("workspace_members").select("role").eq("user_id", user.id).eq("workspace_id", workspaceId).maybeSingle(),
		client.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle(),
	]);
	if (membership.error || workspace.error) return c.json({ error: "workspace_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const role = workspace.data?.owner_user_id === user.id ? "owner" : String(membership.data?.role ?? "").toLowerCase() || null;
	const requestedRoles = String(c.req.query("roles") ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
	const allowed = Boolean(role) && (requestedRoles.length === 0 || requestedRoles.includes(role!) || (role === "owner" && requestedRoles.includes("admin")));
	return c.json({ allowed, role, userId: user.id }, allowed ? 200 : 403, PRIVATE_NO_STORE_HEADERS);
});

accountAuthRouter.get("/workspaces", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ workspaces: [] }, 401, PRIVATE_NO_STORE_HEADERS);
	const result = await getDataClient(c.env).from("workspace_members").select("role,workspace_id,workspaces:workspaces(id,name,slug)").eq("user_id", user.id);
	if (result.error) return c.json({ error: "workspace_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const workspaces = (result.data ?? []).flatMap((row) => {
		const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
		if (!workspace?.id) return [];
		return [{ id: String(workspace.id), name: String(workspace.name ?? workspace.slug ?? workspace.id), role: String(row.role ?? "member") }];
	});
	return c.json({ workspaces }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountAuthRouter.post("/test-key", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ ok: false, message: "Sign in to test API keys." }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: { apiKey?: unknown } = await c.req.json().catch(() => ({}));
	const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
	if (!/^aistats(_v\d+)?_sk_[A-Za-z0-9_-]{16,}$/.test(apiKey)) return c.json({ ok: false, message: "This does not look like an AI Stats API key." }, 400, PRIVATE_NO_STORE_HEADERS);
	const raw = c.env.NEXT_PUBLIC_GATEWAY_API_URL ?? c.env.NEXT_PUBLIC_API_URL ?? c.env.AI_STATS_GATEWAY_URL ?? "https://api.phaseo.app";
	const base = raw.replace(/\/+$/, ""); const gateway = base.endsWith("/v1") ? base : `${base}/v1`;
	try {
		const response = await fetch(`${gateway}/models?endpoints=chat/completions`, { headers: { Authorization: `Bearer ${apiKey}` } });
		const payload: any = await response.json().catch(() => null);
		if (!response.ok) { const message = typeof payload?.error?.message === "string" ? payload.error.message : typeof payload?.message === "string" ? payload.message : response.status === 401 ? "The gateway rejected this key." : "The gateway could not verify this key."; return c.json({ ok: false, status: response.status, message }, 400, PRIVATE_NO_STORE_HEADERS); }
		const modelCount = Array.isArray(payload?.data) ? payload.data.length : Array.isArray(payload) ? payload.length : null;
		return c.json({ ok: true, status: response.status, modelCount }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch { return c.json({ ok: false, message: "Could not reach the gateway to test this key." }, 502, PRIVATE_NO_STORE_HEADERS); }
});

accountAuthRouter.get("/oauth-consent", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const clientId = String(c.req.query("clientId") ?? "").trim();
	const client = getDataClient(c.env);
	const [metadata, firstParty, memberships] = await Promise.all([
		clientId ? client.from("oauth_app_metadata").select("*").eq("client_id", clientId).eq("status", "active").maybeSingle() : Promise.resolve({ data: null, error: null }),
		clientId ? client.from("oauth_clients").select("id,name,description,logo_url,homepage_url,redirect_uris,status").eq("id", clientId).eq("status", "active").maybeSingle() : Promise.resolve({ data: null, error: null }),
		client.from("workspace_members").select("workspace_id,teams:workspaces(id,name)").eq("user_id", user.id),
	]);
	if (metadata.error || firstParty.error || memberships.error) return c.json({ error: "oauth_consent_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const workspaces = (memberships.data ?? []).flatMap((row) => { const team = Array.isArray(row.teams) ? row.teams[0] : row.teams; return team?.id ? [{ id: String(team.id), name: String(team.name ?? team.id) }] : []; });
	return c.json({ appMetadata: metadata.data ?? null, firstPartyClient: firstParty.data ?? null, workspaces }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountAuthRouter.post("/oauth-consent/validate", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "Unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: { clientId?: string; workspaceIds?: string[] } = await c.req.json<{ clientId?: string; workspaceIds?: string[] }>().catch(() => ({}));
	const clientId = String(body.clientId ?? "").trim();
	const workspaceIds = [...new Set((Array.isArray(body.workspaceIds) ? body.workspaceIds : []).map(String).map((value) => value.trim()).filter(Boolean))];
	if (!clientId || !workspaceIds.length) return c.json({ error: "Select at least one team to authorize" }, 400, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const membership = await client.from("workspace_members").select("workspace_id").eq("user_id", user.id).in("workspace_id", workspaceIds);
	if (membership.error || new Set((membership.data ?? []).map((row) => String(row.workspace_id))).size !== workspaceIds.length) return c.json({ error: "You don't have permission to authorize for one or more selected teams" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (clientId !== "phaseo_cli") {
		const app = await client.from("oauth_app_metadata").select("id").eq("client_id", clientId).eq("status", "active").maybeSingle();
		if (app.error || !app.data) return c.json({ error: "OAuth application not found or inactive" }, 404, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ valid: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountAuthRouter.put("/onboarding", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const client = getDataClient(c.env);
	const existing = await client.from("users").select("onboarding_state").eq("user_id", user.id).maybeSingle();
	if (existing.error) return c.json({ error: "onboarding_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const current = existing.data?.onboarding_state && typeof existing.data.onboarding_state === "object" && !Array.isArray(existing.data.onboarding_state) ? existing.data.onboarding_state as Record<string, unknown> : {};
	const next: Record<string, unknown> = { ...current, updatedAt: new Date().toISOString() };
	for (const key of ["workspaceId", "selectedModelId", "selectedKeyId", "createdKeyId", "keyPrefix"] as const) if (Object.prototype.hasOwnProperty.call(body, key)) next[key] = body[key];
	if (["started", "completed", "skipped"].includes(String(body.status))) next.status = body.status;
	if (Array.isArray(body.completedSteps)) next.completedSteps = Array.from(new Set([...(Array.isArray(current.completedSteps) ? current.completedSteps : []), ...body.completedSteps].map((value) => String(value ?? "").trim()).filter((value) => /^[a-z0-9_-]+$/i.test(value))));
	const update: Record<string, unknown> = { onboarding_state: next, updated_at: new Date().toISOString() };
	if (body.status === "completed" || body.status === "skipped") update.onboarding_completed_at = new Date().toISOString();
	const result = await client.from("users").update(update).eq("user_id", user.id);
	if (result.error) return c.json({ error: "onboarding_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ state: next }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountAuthRouter.get("/statsig", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({
			signedIn: false,
			profile: { betaOptIn: false, betaFeatures: {} },
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const { data, error } = await getDataClient(c.env)
		.from("users")
		.select("beta_opt_in,beta_features,role")
		.eq("user_id", user.id)
		.maybeSingle();
	if (error) {
		console.error("[web-api/account/auth] statsig failed", { userId: user.id, error });
		return c.json({ error: "auth_statsig_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const isAdmin = String(data?.role ?? "").toLowerCase() === "admin";
	const betaFeatures = normalizeBetaFeatures(data?.beta_features);
	if (isAdmin) betaFeatures.chat_realtime_voice = true;
	else delete betaFeatures.chat_realtime_voice;
	return c.json({
		signedIn: true,
		user: { id: user.id, email: user.email },
		profile: {
			betaOptIn: Boolean(data?.beta_opt_in) || isAdmin,
			betaFeatures,
		},
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountAuthRouter.get("/header", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({ isLoggedIn: false, teams: [] }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	try {
		const client = getDataClient(c.env);
		const [userResult, membershipResult, ownedResult] = await Promise.all([
			client.from("users").select("default_workspace_id,role,display_name").eq("user_id", user.id).maybeSingle(),
			client.from("workspace_members").select("workspace_id").eq("user_id", user.id),
			client.from("workspaces").select("id").eq("owner_user_id", user.id),
		]);
		for (const result of [userResult, membershipResult, ownedResult]) {
			if (result.error) throw result.error;
		}
		const defaultWorkspaceId = String(userResult.data?.default_workspace_id ?? "").trim();
		const role = String(userResult.data?.role ?? "").trim();
		const workspaceIds = Array.from(new Set([
			...(membershipResult.data ?? []).map((row) => String(row.workspace_id ?? "").trim()),
			...(ownedResult.data ?? []).map((row) => String(row.id ?? "").trim()),
			defaultWorkspaceId,
		].filter(Boolean)));
		let teams: Array<{ id: string; name: string }> = [];
		if (workspaceIds.length > 0) {
			const { data, error } = await client
				.from("workspaces")
				.select("id,name")
				.in("id", workspaceIds);
			if (error) throw error;
			teams = (data ?? [])
				.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? "").trim() }))
				.filter((team) => team.id && team.name);
		}
		if (teams.length === 0 && ["admin", "editor"].includes(role.toLowerCase())) {
			const { data, error } = await client.from("workspaces").select("id,name");
			if (error) throw error;
			teams = (data ?? [])
				.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? "").trim() }))
				.filter((team) => team.id && team.name);
		}
		teams.sort((left, right) => {
			if (left.id === defaultWorkspaceId) return -1;
			if (right.id === defaultWorkspaceId) return 1;
			return left.name.localeCompare(right.name);
		});
		const currentTeamId =
			cookieValue(c.req.raw, "activeWorkspaceId") ??
			(defaultWorkspaceId || undefined);
		const displayName = String(userResult.data?.display_name ?? "").trim()
			|| metadataString(user.userMetadata, ["full_name", "name"]);
		return c.json({
			isLoggedIn: true,
			user: {
				id: user.id,
				email: user.email,
				displayName,
				avatarUrl: metadataString(user.userMetadata, ["avatar_url", "picture", "picture_url"]),
			},
			teams,
			...(currentTeamId ? { currentTeamId } : {}),
			...(role ? { userRole: role } : {}),
		}, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account/auth] header failed", { userId: user.id, error });
		return c.json({ error: "auth_header_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});
