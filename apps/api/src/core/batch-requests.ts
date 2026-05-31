import { getSupabaseAdmin } from "@/runtime/env";

export type BatchRequestStatus =
	| "queued"
	| "validating"
	| "in_progress"
	| "completed"
	| "failed"
	| "cancelled"
	| "expired";

export type BatchRequestRowInput = {
	provider: string;
	nativeBatchId?: string | null;
	customId: string;
	requestIndex: number;
	method?: string | null;
	endpoint?: string | null;
	model?: string | null;
	status?: BatchRequestStatus | string | null;
	requestBodyHash?: string | null;
	responseStatus?: number | null;
	responseBody?: Record<string, unknown> | null;
	errorBody?: Record<string, unknown> | null;
	usage?: Record<string, unknown> | null;
	costNanos?: number | null;
	costUsd?: number | null;
	meta?: Record<string, unknown> | null;
	completedAt?: string | null;
};

export type BatchRequestRow = {
	id: string;
	workspaceId: string;
	batchId: string;
	provider: string;
	nativeBatchId: string | null;
	customId: string;
	requestIndex: number;
	method: string | null;
	endpoint: string | null;
	model: string | null;
	status: string;
	requestBodyHash: string | null;
	responseStatus: number | null;
	responseBody: Record<string, unknown> | null;
	errorBody: Record<string, unknown> | null;
	usage: Record<string, unknown> | null;
	costNanos: number | null;
	costUsd: number | null;
	meta: Record<string, unknown>;
	createdAt: string | null;
	updatedAt: string | null;
	completedAt: string | null;
};

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toPlainObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function toDbRow(workspaceId: string, batchId: string, row: BatchRequestRowInput): Record<string, unknown> {
	return {
		workspace_id: workspaceId,
		batch_id: batchId,
		provider: row.provider,
		native_batch_id: row.nativeBatchId ?? null,
		custom_id: row.customId,
		request_index: row.requestIndex,
		method: row.method ?? null,
		endpoint: row.endpoint ?? null,
		model: row.model ?? null,
		status: row.status ?? "queued",
		request_body_hash: row.requestBodyHash ?? null,
		response_status: row.responseStatus ?? null,
		response_body: row.responseBody ?? null,
		error_body: row.errorBody ?? null,
		usage: row.usage ?? null,
		cost_nanos: row.costNanos ?? null,
		cost_usd: row.costUsd ?? null,
		meta: row.meta ?? {},
		completed_at: row.completedAt ?? null,
	};
}

function fromDbRow(row: Record<string, unknown>): BatchRequestRow {
	return {
		id: String(row.id ?? ""),
		workspaceId: String(row.workspace_id ?? ""),
		batchId: String(row.batch_id ?? ""),
		provider: String(row.provider ?? ""),
		nativeBatchId: normalizeText(row.native_batch_id),
		customId: String(row.custom_id ?? ""),
		requestIndex: typeof row.request_index === "number" ? row.request_index : 0,
		method: normalizeText(row.method),
		endpoint: normalizeText(row.endpoint),
		model: normalizeText(row.model),
		status: String(row.status ?? "queued"),
		requestBodyHash: normalizeText(row.request_body_hash),
		responseStatus: typeof row.response_status === "number" ? row.response_status : null,
		responseBody: toPlainObject(row.response_body),
		errorBody: toPlainObject(row.error_body),
		usage: toPlainObject(row.usage),
		costNanos: typeof row.cost_nanos === "number" ? row.cost_nanos : null,
		costUsd: typeof row.cost_usd === "number" ? row.cost_usd : null,
		meta: toPlainObject(row.meta) ?? {},
		createdAt: normalizeText(row.created_at),
		updatedAt: normalizeText(row.updated_at),
		completedAt: normalizeText(row.completed_at),
	};
}

export async function hashBatchRequestBody(value: unknown): Promise<string> {
	const body = JSON.stringify(value ?? null);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
	return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function saveBatchRequestRows(args: {
	workspaceId: string;
	batchId: string;
	rows: BatchRequestRowInput[];
}): Promise<void> {
	if (!args.workspaceId || !args.batchId || args.rows.length === 0) return;
	const supabase = getSupabaseAdmin();
	const payload = args.rows.map((row) => toDbRow(args.workspaceId, args.batchId, row));
	const { error } = await supabase
		.from("gateway_batch_requests")
		.upsert(payload, { onConflict: "workspace_id,batch_id,custom_id" });
	if (error) throw new Error(error.message ?? "Failed to save batch request rows");
}

export async function listBatchRequestRows(args: {
	workspaceId: string;
	batchId: string;
	limit?: number;
	offset?: number;
	status?: string | null;
}): Promise<BatchRequestRow[]> {
	if (!args.workspaceId || !args.batchId) return [];
	const limit = Math.max(1, Math.min(1000, Math.trunc(args.limit ?? 100)));
	const offset = Math.max(0, Math.trunc(args.offset ?? 0));
	let query = getSupabaseAdmin()
		.from("gateway_batch_requests")
		.select("*")
		.eq("workspace_id", args.workspaceId)
		.eq("batch_id", args.batchId)
		.order("request_index", { ascending: true })
		.range(offset, offset + limit - 1);
	const status = normalizeText(args.status);
	if (status) query = query.eq("status", status);
	const { data, error } = await query;
	if (error) throw new Error(error.message ?? "Failed to list batch request rows");
	return Array.isArray(data) ? data.map((row) => fromDbRow(row as Record<string, unknown>)) : [];
}
