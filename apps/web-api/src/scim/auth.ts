import type { Env } from "@/env";
import { getDataClient } from "@/data/supabase";
import { workspaceHasAddon } from "@/billing/workspaceAddons";

export type ScimAuthContext = {
	workspaceId: string;
	endpointId: string;
	tokenId: string;
};

/** A token that is valid but may no longer be used; the router returns a SCIM 401 with this detail. */
export type ScimAuthRefusal = { refused: string };

export const SCIM_TOKEN_OWNER_REQUIRED =
	"This SCIM token was not issued by the current workspace owner. The workspace owner must issue a new SCIM token in Settings.";

const TOKEN_PATTERN = /^ph_scim_([A-Za-z0-9]{8,32})_([A-Za-z0-9_-]{32,})$/;

async function hmacHex(secret: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
	return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashScimToken(env: Env, token: string): Promise<string> {
	const pepper = env.SCIM_TOKEN_PEPPER?.trim();
	if (!pepper) throw new Error("scim_token_pepper_unavailable");
	return hmacHex(pepper, token);
}

export function generateScimToken(): { token: string; prefix: string } {
	const prefix = [...crypto.getRandomValues(new Uint8Array(6))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	const secret = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	return { prefix, token: `ph_scim_${prefix}_${secret}` };
}

function constantTimeEqual(left: string, right: string): boolean {
	const size = Math.max(left.length, right.length);
	let difference = left.length ^ right.length;
	for (let index = 0; index < size; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
	return difference === 0;
}

export async function authenticateScim(request: Request, env: Env): Promise<ScimAuthContext | ScimAuthRefusal | null> {
	const authorization = request.headers.get("authorization")?.trim() ?? "";
	const rawToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
	const match = TOKEN_PATTERN.exec(rawToken);
	const pepper = env.SCIM_TOKEN_PEPPER?.trim();
	if (!match || !pepper) return null;

	const [, prefix] = match;
	const client = getDataClient(env);
	const result = await client.from("scim_tokens").select("id,token_hash,expires_at,revoked_at,created_by,endpoint:scim_endpoints!inner(id,workspace_id,enabled)").eq("token_prefix", prefix).maybeSingle();
	if (result.error || !result.data || result.data.revoked_at) return null;
	if (result.data.expires_at && Date.parse(result.data.expires_at) <= Date.now()) return null;
	const endpointValue = result.data.endpoint as unknown;
	const endpoint = (Array.isArray(endpointValue) ? endpointValue[0] : endpointValue) as { id?: string; workspace_id?: string; enabled?: boolean } | null;
	if (!endpoint?.enabled || !endpoint.id || !endpoint.workspace_id) return null;
	const actualHash = await hmacHex(pepper, rawToken);
	if (!constantTimeEqual(actualHash, result.data.token_hash)) return null;
	if (!(await workspaceHasAddon(client, endpoint.workspace_id, "identity"))) return null;
	// A SCIM token can add people to directory groups that grant the admin role, which is the owner's call,
	// so only a token the current owner issued works. Tokens issued by an admin, or by a previous owner,
	// stop working without being changed; the owner issues a new one.
	const workspace = await client.from("workspaces").select("owner_user_id").eq("id", endpoint.workspace_id).maybeSingle();
	if (workspace.error || !workspace.data) return null;
	const createdBy = String((result.data as { created_by?: string | null }).created_by ?? "");
	if (!createdBy || createdBy !== workspace.data.owner_user_id) return { refused: SCIM_TOKEN_OWNER_REQUIRED };

	const usage = await client.from("scim_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", result.data.id);
	if (usage.error) console.error("[web-api/scim] token usage update failed", { tokenId: result.data.id, code: usage.error.code });
	return { workspaceId: endpoint.workspace_id, endpointId: endpoint.id, tokenId: result.data.id };
}
