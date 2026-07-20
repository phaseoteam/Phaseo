import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getAuthenticatedDataClient, getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";

const emptyTeams = {
	teams: [], membersByTeam: {}, invitesByTeam: {}, requestsByTeam: {},
	initialTeamId: null, currentUserId: null, personalTeamId: null,
	manageableTeamIds: [], walletBalances: {}, teamSsoSettingsByTeam: {},
};

function base64ToBytes(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array): string {
	let binary = "";
	for (const byte of value) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function bytesBuffer(value: Uint8Array): ArrayBuffer {
	return new Uint8Array(value).buffer;
}

async function inviteAesKey(env: Env) {
	const bytes = base64ToBytes(env.INVITE_ENCRYPTION_KEY ?? "");
	if (bytes.length !== 32) throw new Error("invite_encryption_unavailable");
	return crypto.subtle.importKey("raw", bytesBuffer(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptInviteToken(env: Env, token: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, await inviteAesKey(env), new TextEncoder().encode(token)));
	const ciphertext = encrypted.slice(0, -16);
	const tag = encrypted.slice(-16);
	const output = new Uint8Array(iv.length + tag.length + ciphertext.length);
	output.set(iv, 0); output.set(tag, iv.length); output.set(ciphertext, iv.length + tag.length);
	return bytesToBase64(output);
}

async function decryptInviteToken(env: Env, payload: string): Promise<string> {
	const bytes = base64ToBytes(payload);
	if (bytes.length < 29) throw new Error("malformed_invite");
	const iv = bytes.slice(0, 12); const tag = bytes.slice(12, 28); const ciphertext = bytes.slice(28);
	const encrypted = new Uint8Array(ciphertext.length + tag.length); encrypted.set(ciphertext); encrypted.set(tag, ciphertext.length);
	return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, await inviteAesKey(env), encrypted));
}

async function inviteFingerprint(env: Env, token: string): Promise<string> {
	const keyBytes = base64ToBytes(env.HMAC_ENCRYPTION_KEY ?? "");
	if (!keyBytes.length) throw new Error("invite_hmac_unavailable");
	const key = await crypto.subtle.importKey("raw", bytesBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
	return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function upsertLinearCustomer(env: Env, args: { workspaceId: string; name: string }) {
	if (!env.LINEAR_API_KEY || !env.LINEAR_DEFAULT_ASSIGNED_USER_ID) return;
	const query = `mutation CustomerUpsert($input: CustomerUpsertInput!) { customerUpsert(input: $input) { success customer { id } } }`;
	await fetch("https://api.linear.app/graphql", { method: "POST", headers: { "content-type": "application/json", authorization: env.LINEAR_API_KEY.replace(/^Bearer\s+/i, "") }, body: JSON.stringify({ query, variables: { input: { externalId: `cus-${args.workspaceId}`, name: args.name, ownerId: env.LINEAR_DEFAULT_ASSIGNED_USER_ID, tierId: env.LINEAR_DEFAULT_TIER_ID || undefined } } }) });
}

export const accountSettingsTeamsRouter = new Hono<{ Bindings: Env }>();

accountSettingsTeamsRouter.get("/teams", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json(emptyTeams, 200, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const [userResult, membershipsResult, ownedResult] = await Promise.all([
		client.from("users").select("default_workspace_id,role").eq("user_id", user.id).maybeSingle(),
		client.from("workspace_members").select("workspace_id,role").eq("user_id", user.id),
		client.from("workspaces").select("id").eq("owner_user_id", user.id),
	]);
	if (userResult.error || membershipsResult.error || ownedResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const membershipRows = membershipsResult.data ?? [];
	const ownedIds = (ownedResult.data ?? []).map((row) => String(row.id ?? "").trim()).filter(Boolean);
	const accessibleIds = Array.from(new Set([
		...membershipRows.map((row) => String(row.workspace_id ?? "").trim()).filter(Boolean),
		...ownedIds,
	]));
	const defaultWorkspaceId = String(userResult.data?.default_workspace_id ?? "").trim() || null;
	if (!accessibleIds.length) return c.json({ ...emptyTeams, currentUserId: user.id, personalTeamId: defaultWorkspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
	const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
	const [teamsResult, membersResult, invitesResult, requestsResult, walletsResult, ssoResult] = await Promise.all([
		client.from("workspaces").select("id,name").in("id", accessibleIds),
		client.from("workspace_members").select("workspace_id,user_id,role").in("workspace_id", accessibleIds),
		client.from("workspace_invites").select("*,users(display_name)").in("workspace_id", accessibleIds).or(`expires_at.is.null,expires_at.gte.${sevenDaysAgo}`),
		client.from("workspace_join_requests").select("id,workspace_id,requester_user_id,status,created_at,decided_at,teams:workspaces(name),requester:users!workspace_join_requests_requester_user_id_fkey(user_id,display_name),decider:users!workspace_join_requests_decided_by_fkey(user_id,display_name)").in("workspace_id", accessibleIds).or(`decided_at.is.null,decided_at.gte.${sevenDaysAgo}`),
		client.from("wallets").select("workspace_id,balance_nanos").in("workspace_id", accessibleIds),
		client.from("workspace_settings").select("workspace_id,sso_enabled,sso_enforced,sso_mode,sso_provider_identifier,sso_domains").in("workspace_id", accessibleIds),
	]);
	if ([teamsResult, membersResult, invitesResult, requestsResult, walletsResult, ssoResult].some((result) => result.error)) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const teams = (teamsResult.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })).filter((row) => row.id && row.name);
	const memberRows = membersResult.data ?? [];
	const memberIds = Array.from(new Set(memberRows.map((row) => String(row.user_id ?? "")).filter(Boolean)));
	const usersResult = memberIds.length ? await client.from("users").select("user_id,display_name").in("user_id", memberIds) : { data: [], error: null };
	if (usersResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const names = new Map((usersResult.data ?? []).map((row) => [row.user_id, row.display_name ?? null]));
	const membersByTeam: Record<string, unknown[]> = {};
	for (const row of memberRows) {
		if (!row.workspace_id) continue;
		(membersByTeam[row.workspace_id] ||= []).push({ ...row, display_name: names.get(row.user_id) ?? null });
	}
	const group = (rows: Array<Record<string, unknown>>) => {
		const grouped: Record<string, unknown[]> = {};
		for (const row of rows) {
			const id = typeof row.workspace_id === "string" ? row.workspace_id : null;
			if (id) (grouped[id] ||= []).push(row);
		}
		return grouped;
	};
	const preferred = c.req.query("preferredWorkspaceId")?.trim();
	const active = c.req.query("workspaceId")?.trim();
	const initialTeamId = [preferred, active, defaultWorkspaceId, teams[0]?.id].find((id) => Boolean(id && accessibleIds.includes(id))) ?? null;
	const manageable = new Set(ownedIds);
	for (const row of membershipRows) if (row.workspace_id && ["owner", "admin"].includes(String(row.role ?? "").toLowerCase())) manageable.add(row.workspace_id);
	const walletBalances: Record<string, number> = {};
	for (const row of walletsResult.data ?? []) if (row.workspace_id) walletBalances[row.workspace_id] = Number((Number(row.balance_nanos ?? 0) / 1_000_000_000).toFixed(2));
	const teamSsoSettingsByTeam: Record<string, unknown> = {};
	for (const row of ssoResult.data ?? []) if (row.workspace_id) teamSsoSettingsByTeam[row.workspace_id] = { sso_enabled: Boolean(row.sso_enabled), sso_enforced: Boolean(row.sso_enforced), sso_mode: String(row.sso_mode ?? "none"), sso_provider_identifier: row.sso_provider_identifier ?? null, sso_domains: Array.isArray(row.sso_domains) ? row.sso_domains : [] };
	return c.json({
		teams,
		membersByTeam,
		invitesByTeam: group((invitesResult.data ?? []) as unknown as Array<Record<string, unknown>>),
		requestsByTeam: group((requestsResult.data ?? []) as unknown as Array<Record<string, unknown>>),
		initialTeamId,
		currentUserId: user.id,
		personalTeamId: defaultWorkspaceId,
		manageableTeamIds: Array.from(manageable),
		walletBalances,
		teamSsoSettingsByTeam,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsTeamsRouter.post("/teams", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: { name?: string } = await c.req.json<{ name?: string }>().catch(() => ({}));
	const name = String(body.name ?? "").trim();
	if (!name) return c.json({ error: "invalid_name" }, 400, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const memberships = await client.from("workspace_members").select("workspace_id,role").eq("user_id", user.id);
	if (memberships.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const adminIds = Array.from(new Set((memberships.data ?? []).filter((row) => ["owner", "admin"].includes(String(row.role ?? "").toLowerCase())).map((row) => row.workspace_id).filter(Boolean)));
	if (!adminIds.length) return c.json({ error: "paid_workspace_required" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [topUps, invoices, enterprise] = await Promise.all([
		client.from("credit_ledger").select("id", { count: "exact", head: true }).in("workspace_id", adminIds).in("kind", ["top_up", "top_up_one_off", "auto_top_up"]).in("status", ["Succeeded", "succeeded", "paid", "Paid"]).gt("amount_nanos", 0),
		client.from("workspace_invoices").select("id", { count: "exact", head: true }).in("workspace_id", adminIds).eq("status", "paid").gt("amount_nanos", 0),
		client.from("workspaces").select("id", { count: "exact", head: true }).in("id", adminIds).eq("tier", "enterprise"),
	]);
	if ([topUps, invoices, enterprise].some((result) => result.error)) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (![topUps.count, invoices.count, enterprise.count].some((count) => (count ?? 0) > 0)) return c.json({ error: "paid_workspace_required" }, 403, PRIVATE_NO_STORE_HEADERS);
	const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42) || "workspace";
	const slug = `${slugBase}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(0, 50);
	const created = await client.from("workspaces").insert({ name, slug, owner_user_id: user.id }).select("id").maybeSingle();
	if (created.error || !created.data?.id) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = created.data.id;
	const [member, wallet] = await Promise.all([
		client.from("workspace_members").upsert({ workspace_id: workspaceId, user_id: user.id, role: "owner" }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true }),
		client.from("wallets").upsert({ workspace_id: workspaceId }, { onConflict: "workspace_id", ignoreDuplicates: true }),
	]);
	if (member.error || wallet.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	c.executionCtx.waitUntil(upsertLinearCustomer(c.env, { workspaceId, name }).catch((error) => console.error("[web-api/teams] Linear upsert failed", error)));
	return c.json({ id: workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsTeamsRouter.get("/teams/:workspaceId/sso", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.param("workspaceId") });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_settings").select("sso_enabled,sso_enforced,sso_mode,sso_provider_identifier,sso_domains").eq("workspace_id", context.workspaceId).maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const row = result.data;
	return c.json({ sso_enabled: Boolean(row?.sso_enabled), sso_enforced: Boolean(row?.sso_enforced), sso_mode: String(row?.sso_mode ?? "none"), sso_provider_identifier: row?.sso_provider_identifier ?? null, sso_domains: Array.isArray(row?.sso_domains) ? row.sso_domains : [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsTeamsRouter.put("/teams/:workspaceId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.param("workspaceId") });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const userRow = await context.client.from("users").select("default_workspace_id").eq("user_id", user.id).maybeSingle();
	if (userRow.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (userRow.data?.default_workspace_id === context.workspaceId) return c.json({ error: "personal_workspace" }, 409, PRIVATE_NO_STORE_HEADERS);
	const body: { name?: string } = await c.req.json<{ name?: string }>().catch(() => ({}));
	const name = String(body.name ?? "").trim();
	if (!name) return c.json({ error: "invalid_name" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspaces").update({ name }).eq("id", context.workspaceId).select("id").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ id: result.data?.id ?? context.workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsTeamsRouter.delete("/teams/:workspaceId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = c.req.param("workspaceId");
	const client = getDataClient(c.env);
	const [userRow, workspace] = await Promise.all([
		client.from("users").select("default_workspace_id").eq("user_id", user.id).maybeSingle(),
		client.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle(),
	]);
	if (userRow.error || workspace.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (userRow.data?.default_workspace_id === workspaceId) return c.json({ error: "personal_workspace" }, 409, PRIVATE_NO_STORE_HEADERS);
	if (!workspace.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	if (workspace.data.owner_user_id !== user.id) return c.json({ error: "owner_required" }, 403, PRIVATE_NO_STORE_HEADERS);
	for (const table of ["workspace_members", "workspace_invites", "workspace_join_requests"] as const) {
		const result = await client.from(table).delete().eq("workspace_id", workspaceId);
		if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const removed = await client.from("workspaces").delete().eq("id", workspaceId);
	if (removed.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsTeamsRouter.post("/teams/:workspaceId/invites", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.param("workspaceId") });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const token = String(body.token ?? "");
	const role = ["admin", "member"].includes(String(body.role).toLowerCase()) ? String(body.role).toLowerCase() : "member";
	if (token.length < 6) return c.json({ error: "invalid_token" }, 400, PRIVATE_NO_STORE_HEADERS);
	try {
		const result = await context.client.from("workspace_invites").insert({ workspace_id: context.workspaceId, creator_user_id: user.id, role, token_encrypted: await encryptInviteToken(c.env, token), token_fingerprint: await inviteFingerprint(c.env, token), token_preview: token.length >= 4 ? `${token.slice(0, 2)}...${token.slice(-2)}` : token, expires_at: new Date(Date.now() + Math.max(1, Number(body.expiresInDays) || 7) * 86_400_000).toISOString(), max_uses: typeof body.maxUses === "number" ? Math.max(0, Math.floor(body.maxUses)) : null, key_version: 1 }).select("id").maybeSingle();
		if (result.error) throw result.error;
		return c.json({ id: result.data?.id, token }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/teams] create invite failed", error);
		return c.json({ error: "invite_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsTeamsRouter.get("/teams/invites/:inviteId/reveal", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const invite = await client.from("workspace_invites").select("id,creator_user_id,workspace_id,token_encrypted,key_version").eq("id", c.req.param("inviteId")).maybeSingle();
	if (invite.error) return c.json({ error: "invite_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!invite.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const membership = await client.from("workspace_members").select("role").eq("workspace_id", invite.data.workspace_id).eq("user_id", user.id).maybeSingle();
	if (membership.error) return c.json({ error: "invite_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const creatorMember = invite.data.creator_user_id === user.id && Boolean(membership.data);
	if (!creatorMember && !["owner", "admin"].includes(String(membership.data?.role ?? "").toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!invite.data.token_encrypted) return c.json({ error: "token_unavailable" }, 409, PRIVATE_NO_STORE_HEADERS);
	try { return c.json({ id: invite.data.id, token: await decryptInviteToken(c.env, invite.data.token_encrypted) }, 200, PRIVATE_NO_STORE_HEADERS); }
	catch { return c.json({ error: "decrypt_failed" }, 503, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsTeamsRouter.delete("/teams/invites/:inviteId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const invite = await client.from("workspace_invites").select("id,creator_user_id,workspace_id").eq("id", c.req.param("inviteId")).maybeSingle();
	if (invite.error) return c.json({ error: "invite_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!invite.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const membership = await client.from("workspace_members").select("role").eq("workspace_id", invite.data.workspace_id).eq("user_id", user.id).maybeSingle();
	if (membership.error) return c.json({ error: "invite_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const creatorMember = invite.data.creator_user_id === user.id && Boolean(membership.data);
	if (!creatorMember && !["owner", "admin"].includes(String(membership.data?.role ?? "").toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await client.from("workspace_invites").delete().eq("id", invite.data.id).select("id").maybeSingle();
	if (result.error) return c.json({ error: "invite_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true, id: result.data?.id }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsTeamsRouter.post("/teams/invites/accept", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ success: false, error: "Please sign in" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: { token?: string } = await c.req.json<{ token?: string }>().catch(() => ({}));
	const token = String(body.token ?? "");
	if (token.length < 6) return c.json({ success: false, error: "Invite code too short" }, 400, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	try {
		const now = new Date().toISOString();
		const invite = await client.from("workspace_invites").select("id,workspace_id,expires_at,max_uses,uses_count").eq("token_fingerprint", await inviteFingerprint(c.env, token)).or(`expires_at.is.null,expires_at.gt.${now}`).maybeSingle();
		if (invite.error) throw invite.error;
		if (!invite.data || (invite.data.max_uses != null && (invite.data.uses_count ?? 0) >= invite.data.max_uses)) return c.json({ success: false, error: "Invalid or expired invite" }, 404, PRIVATE_NO_STORE_HEADERS);
		const [membership, pending] = await Promise.all([
			client.from("workspace_members").select("workspace_id").eq("workspace_id", invite.data.workspace_id).eq("user_id", user.id).maybeSingle(),
			client.from("workspace_join_requests").select("id").eq("workspace_id", invite.data.workspace_id).eq("requester_user_id", user.id).eq("status", "pending").maybeSingle(),
		]);
		if (membership.error || pending.error) throw membership.error ?? pending.error;
		if (membership.data) return c.json({ success: false, error: "You are already a member of this workspace" }, 409, PRIVATE_NO_STORE_HEADERS);
		if (pending.data) return c.json({ success: false, error: "You already have a pending request" }, 409, PRIVATE_NO_STORE_HEADERS);
		const created = await client.from("workspace_join_requests").insert({ workspace_id: invite.data.workspace_id, invite_id: invite.data.id, requester_user_id: user.id, status: "pending" }).select("id").maybeSingle();
		if (created.error) throw created.error;
		return c.json({ success: true, requestId: created.data?.id }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/teams] accept invite failed", error);
		return c.json({ success: false, error: "Could not create join request" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsTeamsRouter.put("/teams/:workspaceId/sso", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.param("workspaceId") });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const mode = ["saml", "custom_oidc"].includes(String(body.ssoMode)) ? String(body.ssoMode) : "none";
	const enabled = Boolean(body.ssoEnabled);
	const identifier = mode === "none" ? null : String(body.ssoProviderIdentifier ?? "").trim() || null;
	if (mode === "custom_oidc" && identifier && !identifier.startsWith("custom:")) return c.json({ error: "invalid_provider_identifier" }, 400, PRIVATE_NO_STORE_HEADERS);
	const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
	const domains = Array.from(new Set((Array.isArray(body.ssoDomains) ? body.ssoDomains : []).map((value) => String(value ?? "").trim().toLowerCase().replace(/^\.+|\.+$/g, "")).filter((value) => domainPattern.test(value))));
	const payload = { workspace_id: context.workspaceId, sso_enabled: enabled, sso_enforced: enabled ? Boolean(body.ssoEnforced) : false, sso_mode: mode, sso_provider_identifier: identifier, sso_domains: domains, updated_at: new Date().toISOString() };
	const result = await context.client.from("workspace_settings").upsert(payload, { onConflict: "workspace_id" });
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true, workspaceId: context.workspaceId, settings: payload }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsTeamsRouter.put("/teams/:workspaceId/members/:userId", async (c) => {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.param("workspaceId") });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (!["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const targetUserId = c.req.param("userId");
	const body: { role?: string } = await c.req.json<{ role?: string }>().catch(() => ({}));
	const role = String(body.role ?? "").toLowerCase();
	if (!["admin", "member"].includes(role)) return c.json({ error: "invalid_role" }, 400, PRIVATE_NO_STORE_HEADERS);
	const workspace = await context.client.from("workspaces").select("owner_user_id").eq("id", context.workspaceId).maybeSingle();
	if (workspace.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (workspace.data?.owner_user_id === targetUserId) return c.json({ error: "owner_role_fixed" }, 409, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_members").upsert({ workspace_id: context.workspaceId, user_id: targetUserId, role }, { onConflict: "workspace_id,user_id" }).select("workspace_id,user_id,role").maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ workspaceId: context.workspaceId, userId: targetUserId, role: result.data?.role ?? null, ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsTeamsRouter.delete("/teams/:workspaceId/members/:userId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = c.req.param("workspaceId");
	const targetUserId = c.req.param("userId");
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const isSelf = user.id === targetUserId;
	if (!isSelf && !["owner", "admin"].includes(context.role.toLowerCase())) return c.json({ workspaceId, userId: targetUserId, ok: false, message: "You don't have permission to remove this member from the workspace." }, 403, PRIVATE_NO_STORE_HEADERS);
	const [workspace, target] = await Promise.all([
		context.client.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle(),
		context.client.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", targetUserId).maybeSingle(),
	]);
	if (workspace.error || target.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (workspace.data?.owner_user_id === targetUserId) return c.json({ workspaceId, userId: targetUserId, ok: false, message: "You can't remove the workspace owner." }, 409, PRIVATE_NO_STORE_HEADERS);
	const rank = (role: string | null | undefined) => ({ owner: 1, admin: 2, member: 3 }[String(role ?? "").toLowerCase()] ?? 4);
	if (!isSelf && rank(target.data?.role) < rank(context.role)) return c.json({ workspaceId, userId: targetUserId, ok: false, message: "You can't remove a member with a higher role." }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", targetUserId);
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ workspaceId, userId: targetUserId, ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

for (const decision of ["approve", "reject"] as const) {
	accountSettingsTeamsRouter.post(`/teams/join-requests/:requestId/${decision}`, async (c) => {
		const user = await requireUser(c.req.raw, c.env);
		if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
		const userClient = getAuthenticatedDataClient(c.env, c.req.raw);
		if (!userClient) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
		const result = await userClient.rpc(`${decision}_workspace_join_request`, { p_request_id: c.req.param("requestId") });
		if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		const row = Array.isArray(result.data) ? result.data[0] : result.data;
		if (!row?.id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		return c.json({ success: true, id: row.id, workspaceId: row.workspace_id }, 200, PRIVATE_NO_STORE_HEADERS);
	});
}
