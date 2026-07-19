import { createOpaqueCode, hashOAuthSecret } from "@/lib/oauth/service";
import { getSupabaseAdmin } from "@/runtime/env";
import { isMcpSecretRevealConfigured } from "./secretReveals";

const APPROVAL_TTL_MS = 10 * 60 * 1000;
const MAX_ACTION_BYTES = 12 * 1024;
const PRIVILEGED_SCOPES = new Set([
	"workspaces:write", "workspaces:delete",
	"keys:write", "keys:delete",
	"presets:write", "presets:delete",
	"settings:write",
	"guardrails:write", "guardrails:delete",
	"management_keys:write", "management_keys:delete",
	"oauth_clients:write", "oauth_clients:delete",
]);
const SECRET_TOOL_NAMES = new Set([
	"api_key_create",
	"management_key_create",
	"oauth_confidential_client_create",
	"oauth_client_secret_regenerate",
	"webhook_endpoint_create",
	"webhook_endpoint_secret_rotate",
]);

export type McpActionDescriptor = {
	tool_name: string;
	title: string;
	method: "POST" | "PATCH" | "DELETE";
	path: string;
	payload: Record<string, unknown> | null;
	required_scopes: string[];
};

type ActionActor = {
	userId: string;
	workspaceId: string;
	clientId: string;
	scopes: string[];
};

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, stableValue(entry)]),
	);
}

function stableJson(value: unknown): string {
	return JSON.stringify(stableValue(value));
}

function validActionPath(path: string): boolean {
	if (!path.startsWith("/v1/") || path.length > 2048 || /[?#\\]/.test(path)) return false;
	try {
		return !path
			.split("/")
			.filter(Boolean)
			.map((segment) => decodeURIComponent(segment))
			.some((segment) => segment === "." || segment === "..");
	} catch {
		return false;
	}
}

export function normalizeMcpAction(value: unknown): McpActionDescriptor | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	const toolName = String(input.tool_name ?? "").trim();
	const title = String(input.title ?? "").trim();
	const method = String(input.method ?? "").trim().toUpperCase();
	const path = String(input.path ?? "").trim();
	const payload = input.payload === null || input.payload === undefined
		? null
		: input.payload;
	const scopes = Array.isArray(input.required_scopes)
		? Array.from(new Set(input.required_scopes.map((scope) => String(scope).trim()).filter(Boolean)))
		: [];
	if (!/^[a-z][a-z0-9_]{2,99}$/.test(toolName) || !title || title.length > 200) return null;
	if (!(["POST", "PATCH", "DELETE"] as string[]).includes(method) || !validActionPath(path)) return null;
	if (payload !== null && (typeof payload !== "object" || Array.isArray(payload))) return null;
	if (scopes.length === 0 || scopes.length > 4 || !scopes.every((scope) => PRIVILEGED_SCOPES.has(scope))) return null;
	const normalized = {
		tool_name: toolName,
		title,
		method: method as McpActionDescriptor["method"],
		path,
		payload: payload as Record<string, unknown> | null,
		required_scopes: scopes,
	};
	if (new TextEncoder().encode(stableJson(normalized)).byteLength > MAX_ACTION_BYTES) return null;
	return normalized;
}

function actorCanApproveAction(actor: ActionActor, action: McpActionDescriptor): boolean {
	return action.required_scopes.every((scope) => actor.scopes.includes(scope));
}

async function actionHash(action: McpActionDescriptor): Promise<string> {
	return hashOAuthSecret(`mcp-action:${stableJson(action)}`);
}

async function recordEvent(input: {
	approvalId: string;
	eventType: "prepared" | "approved" | "consumed" | "succeeded" | "failed";
	actorType: "mcp_client" | "user";
	userId: string;
	workspaceId: string;
	clientId: string;
	toolName: string;
	actionHash: string;
	details?: Record<string, unknown>;
}): Promise<void> {
	const { error } = await getSupabaseAdmin().from("mcp_action_audit_events").insert({
		approval_id: input.approvalId,
		event_type: input.eventType,
		actor_type: input.actorType,
		user_id: input.userId,
		workspace_id: input.workspaceId,
		oauth_client_id: input.clientId,
		tool_name: input.toolName,
		action_hash: input.actionHash,
		details: input.details ?? {},
	});
	if (error) throw new Error("mcp_action_audit_write_failed");
}

export async function prepareMcpAction(actor: ActionActor, action: McpActionDescriptor) {
	if (!actorCanApproveAction(actor, action)) return null;
	if (SECRET_TOOL_NAMES.has(action.tool_name) && !isMcpSecretRevealConfigured()) {
		throw new Error("mcp_secret_reveal_key_missing");
	}
	const executionToken = createOpaqueCode();
	const fingerprint = await actionHash(action);
	const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
	const { data, error } = await getSupabaseAdmin()
		.from("mcp_action_approvals")
		.insert({
			execution_token_hash: await hashOAuthSecret(`mcp-execution:${executionToken}`),
			user_id: actor.userId,
			workspace_id: actor.workspaceId,
			oauth_client_id: actor.clientId,
			tool_name: action.tool_name,
			action_title: action.title,
			action_method: action.method,
			action_path: action.path,
			action_payload: action.payload ?? {},
			required_scopes: action.required_scopes,
			action_hash: fingerprint,
			expires_at: expiresAt,
		})
		.select("id")
		.single();
	if (error || !data?.id) throw new Error("mcp_action_prepare_failed");
	await recordEvent({
		approvalId: String(data.id), eventType: "prepared", actorType: "mcp_client",
		userId: actor.userId, workspaceId: actor.workspaceId, clientId: actor.clientId,
		toolName: action.tool_name, actionHash: fingerprint,
	});
	return { approvalId: String(data.id), executionToken, expiresAt };
}

export async function getMcpActionApprovalForUser(approvalId: string, userId: string) {
	const { data, error } = await getSupabaseAdmin()
		.from("mcp_action_approvals")
		.select("id, workspace_id, oauth_client_id, tool_name, action_title, action_method, action_path, action_payload, required_scopes, approved_at, consumed_at, completed_at, outcome, expires_at, created_at")
		.eq("id", approvalId)
		.eq("user_id", userId)
		.maybeSingle();
	if (error) throw new Error("mcp_action_lookup_failed");
	return data ?? null;
}

export async function approveMcpAction(approvalId: string, userId: string) {
	const now = new Date().toISOString();
	const { data, error } = await getSupabaseAdmin()
		.from("mcp_action_approvals")
		.update({ approved_at: now })
		.eq("id", approvalId)
		.eq("user_id", userId)
		.is("approved_at", null)
		.is("consumed_at", null)
		.gt("expires_at", now)
		.select("id, workspace_id, oauth_client_id, tool_name, action_hash")
		.maybeSingle();
	if (error || !data) return null;
	await recordEvent({
		approvalId: String(data.id), eventType: "approved", actorType: "user", userId,
		workspaceId: String(data.workspace_id), clientId: String(data.oauth_client_id),
		toolName: String(data.tool_name), actionHash: String(data.action_hash),
	});
	return { approvalId: String(data.id), approvedAt: now };
}

export async function consumeMcpAction(actor: ActionActor, action: McpActionDescriptor, executionToken: string) {
	if (!actorCanApproveAction(actor, action)) return null;
	const now = new Date().toISOString();
	const fingerprint = await actionHash(action);
	const { data, error } = await getSupabaseAdmin()
		.from("mcp_action_approvals")
		.update({ consumed_at: now })
		.eq("execution_token_hash", await hashOAuthSecret(`mcp-execution:${executionToken}`))
		.eq("user_id", actor.userId)
		.eq("workspace_id", actor.workspaceId)
		.eq("oauth_client_id", actor.clientId)
		.eq("tool_name", action.tool_name)
		.eq("action_hash", fingerprint)
		.not("approved_at", "is", null)
		.is("consumed_at", null)
		.gt("expires_at", now)
		.select("id")
		.maybeSingle();
	if (error || !data?.id) return null;
	await recordEvent({
		approvalId: String(data.id), eventType: "consumed", actorType: "mcp_client",
		userId: actor.userId, workspaceId: actor.workspaceId, clientId: actor.clientId,
		toolName: action.tool_name, actionHash: fingerprint,
	});
	return { approvalId: String(data.id) };
}

export async function completeMcpAction(
	actor: ActionActor,
	action: McpActionDescriptor,
	approvalId: string,
	outcome: "succeeded" | "failed",
): Promise<boolean> {
	const fingerprint = await actionHash(action);
	const completedAt = new Date().toISOString();
	const { data, error } = await getSupabaseAdmin()
		.from("mcp_action_approvals")
		.update({ completed_at: completedAt, outcome })
		.eq("id", approvalId)
		.eq("user_id", actor.userId)
		.eq("workspace_id", actor.workspaceId)
		.eq("oauth_client_id", actor.clientId)
		.eq("action_hash", fingerprint)
		.not("consumed_at", "is", null)
		.is("completed_at", null)
		.select("id")
		.maybeSingle();
	if (error || !data?.id) return false;
	await recordEvent({
		approvalId, eventType: outcome, actorType: "mcp_client", userId: actor.userId,
		workspaceId: actor.workspaceId, clientId: actor.clientId, toolName: action.tool_name,
		actionHash: fingerprint,
	});
	return true;
}
