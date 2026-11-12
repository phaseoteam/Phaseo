import type { GatewaySupabaseClient } from "@/runtime/supabase-client";

const SENSITIVE_KEY = /(authorization|credential|hash|plaintext|scope|secret|token|value)/i;
const MAX_DEPTH = 3;
const MAX_KEYS = 30;
const MAX_STRING_LENGTH = 500;

export type WorkspaceAuditEventInput = {
	workspaceId: string;
	actorUserId?: string | null;
	action: string;
	targetType: string;
	targetId: string;
	targetName?: string | null;
	metadata?: Record<string, unknown>;
	requestId?: string | null;
};

function sanitizeValue(value: unknown, depth: number): unknown {
	if (value === null || typeof value === "boolean" || typeof value === "number") return value;
	if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
	if (depth >= MAX_DEPTH) return "[truncated]";
	if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((item) => sanitizeValue(item, depth + 1));
	if (typeof value !== "object") return String(value).slice(0, MAX_STRING_LENGTH);
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([key]) => !SENSITIVE_KEY.test(key))
			.slice(0, MAX_KEYS)
			.map(([key, item]) => [key, sanitizeValue(item, depth + 1)]),
	);
}

export function sanitizeAuditMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
	return (sanitizeValue(metadata ?? {}, 0) ?? {}) as Record<string, unknown>;
}

export async function recordWorkspaceAuditEvent(
	client: GatewaySupabaseClient,
	event: WorkspaceAuditEventInput,
): Promise<boolean> {
	const { error } = await client.from("workspace_audit_events").insert({
		workspace_id: event.workspaceId,
		actor_user_id: event.actorUserId ?? null,
		action: event.action.slice(0, 100),
		target_type: event.targetType.slice(0, 60),
		target_id: event.targetId.slice(0, 160),
		target_name: event.targetName?.slice(0, 200) ?? null,
		metadata: sanitizeAuditMetadata(event.metadata),
		request_id: event.requestId ?? null,
	});
	if (!error) return true;
	console.error("workspace_audit_event_write_failed", {
		action: event.action,
		target_type: event.targetType,
		workspace_id: event.workspaceId,
	});
	return false;
}
