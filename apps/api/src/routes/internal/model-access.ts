// Purpose: Which models one workspace member may use, for the website (GET /internal/model-access).
// Why: The web's model lists (Chat's picker, /models' "Usable in my workspace" filter) should hide exactly what the
// gateway would refuse. The member's session isn't a key, so web-api asks here with the workspace and user.
// How: The rules are the member's Chat key's when it exists (what Chat sends are checked against), else what such a
// key would get (resolve_member_guardrails). The list is GET /v1/models/me's: loadModelListing with that policy.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { clearRuntime, configureRuntime, getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";
import { normalizeGatewayRoutingRegion } from "@pipeline/before/deployment-region";
import { fetchMemberWorkspacePolicy, fetchWorkspacePolicy } from "@pipeline/before/workspacePolicy";
import { CHAT_MANAGED_KEY_NAME } from "@/routes/v1/control/management-helpers";
import { loadModelListing, wholeCatalogueQuery } from "@/routes/v1/control/models";
import { policyRestrictsModels } from "@/routes/v1/control/models.policy";
import { authorized } from "./notification-tests";

export const internalModelAccessRoutes = new Hono<Env>();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" } as const;

export type ModelAccessResponse = {
	ok: true;
	workspace_id: string;
	/** Whose rules: the member's Chat key, or (no Chat key yet) the rules such a key would get. */
	source: "chat_key" | "member";
	restricted: boolean;
	hidden_model_count: number;
	limited_model_count: number;
	/** Every model the rules leave out, by id and name. */
	hidden_models: Array<{ id: string; name: string }>;
	/** Models kept with only some of their providers: the providers still allowed. */
	limited_models: Record<string, string[]>;
};

async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
	const supabase = getSupabaseAdmin();
	const [membership, workspace] = await Promise.all([
		supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
		supabase.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle(),
	]);
	if (membership.error) throw new Error(`workspace_membership_lookup_failed:${membership.error.message}`);
	if (workspace.error) throw new Error(`workspace_lookup_failed:${workspace.error.message}`);
	return Boolean(membership.data) || workspace.data?.owner_user_id === userId;
}

/** The member's active Chat key in this workspace (web-api creates it on their first Chat send), if any. */
async function chatKeyId(workspaceId: string, userId: string): Promise<string | null> {
	const { data, error } = await getSupabaseAdmin()
		.from("keys")
		.select("id")
		.eq("workspace_id", workspaceId)
		.eq("created_by", userId)
		.eq("name", CHAT_MANAGED_KEY_NAME)
		.eq("status", "active")
		.order("created_at", { ascending: true })
		.limit(1);
	if (error) throw new Error(`chat_key_lookup_failed:${error.message}`);
	const id = String((data as Array<{ id?: unknown }> | null)?.[0]?.id ?? "").trim();
	return id || null;
}

// web-api has already checked the signed-in user's session and their membership of the workspace (the one picked in
// the website's header); membership is checked again here so a token alone can't read another workspace's rules.
internalModelAccessRoutes.get("/", async (c) => {
	if (!authorized(c)) return c.json({ error: "unauthorized" }, 401, NO_STORE);
	const workspaceId = String(c.req.query("workspace_id") ?? "").trim().toLowerCase();
	const userId = String(c.req.query("user_id") ?? "").trim().toLowerCase();
	if (!UUID_PATTERN.test(workspaceId) || !UUID_PATTERN.test(userId)) return c.json({ error: "invalid_request" }, 400, NO_STORE);
	configureRuntime(c.env);
	try {
		if (!await isWorkspaceMember(workspaceId, userId)) return c.json({ error: "not_a_member" }, 403, NO_STORE);
		const keyId = await chatKeyId(workspaceId, userId);
		const policy = keyId
			? await fetchWorkspacePolicy({ workspaceId, apiKeyId: keyId })
			: await fetchMemberWorkspacePolicy({ workspaceId, userId });
		const base = { ok: true as const, workspace_id: workspaceId, source: keyId ? "chat_key" as const : "member" as const };
		if (!policyRestrictsModels(policy)) {
			const body: ModelAccessResponse = { ...base, restricted: false, hidden_model_count: 0, limited_model_count: 0, hidden_models: [], limited_models: {} };
			return c.json(body, 200, NO_STORE);
		}
		const gatewayRegion = normalizeGatewayRoutingRegion(getBindingsIfConfigured()?.GATEWAY_ROUTING_REGION);
		const { listed, permitted } = await loadModelListing({ workspaceId, apiKeyId: keyId }, wholeCatalogueQuery(gatewayRegion), policy);
		const kept = new Map(permitted.map((model) => [model.id, model]));
		const hidden = listed.filter((model) => !kept.has(model.id));
		const limited: Record<string, string[]> = {};
		for (const model of listed) {
			const permittedModel = kept.get(model.id);
			if (!permittedModel || permittedModel.offers.length >= model.offers.length) continue;
			limited[model.id] = [...new Set(permittedModel.offers.map((offer) => offer.provider.id))].sort();
		}
		const body: ModelAccessResponse = {
			...base,
			restricted: true,
			hidden_model_count: hidden.length,
			limited_model_count: Object.keys(limited).length,
			hidden_models: hidden.map((model) => ({ id: model.id, name: model.name ?? model.id })),
			limited_models: limited,
		};
		return c.json(body, 200, NO_STORE);
	} catch (error) {
		console.error("model_access_failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
		return c.json({ error: "model_access_unavailable" }, 503, NO_STORE);
	} finally {
		clearRuntime();
	}
});
