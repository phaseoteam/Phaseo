// Purpose: Persist async operation ownership and billing metadata.
// Why: Long-running jobs (video/batch) need team-scoped lookup across requests.
// How: Store operation records in Supabase with team+kind+internalId identity.

import { getSupabaseAdmin } from "@/runtime/env";

export type AsyncOperationKind = "video" | "batch" | "music";
const ASYNC_OPERATION_L1_TTL_MS = 1_000;

export type AsyncOperationRecord = {
	workspaceId: string;
	kind: AsyncOperationKind;
	internalId: string;
	requestId: string | null;
	sessionId: string | null;
	appId: string | null;
	provider: string | null;
	nativeId: string | null;
	model: string | null;
	status: string | null;
	meta: Record<string, unknown>;
	billedAt: string | null;
	nextReconcileAt: string | null;
	reconcileAttempts: number;
	reconcileLockedAt: string | null;
	reconcileLockedBy: string | null;
	lastReconcileError: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};

type AsyncOperationRow = {
	workspace_id: string;
	kind: AsyncOperationKind;
	internal_id: string;
	request_id: string | null;
	session_id: string | null;
	app_id: string | null;
	provider: string | null;
	native_id: string | null;
	model: string | null;
	status: string | null;
	meta: Record<string, unknown> | null;
	billed_at: string | null;
	next_reconcile_at: string | null;
	reconcile_attempts: number | null;
	reconcile_locked_at: string | null;
	reconcile_locked_by: string | null;
	last_reconcile_error: string | null;
	created_at: string | null;
	updated_at: string | null;
};

type AsyncOperationL1Entry = {
	value: AsyncOperationRecord | null;
	expiresAtMs: number;
};

const asyncOperationL1 = new Map<string, AsyncOperationL1Entry>();
const asyncOperationInflight = new Map<string, Promise<AsyncOperationRecord | null>>();
const asyncOperationEpoch = new Map<string, number>();

function asyncOperationCacheKey(workspaceId: string, kind: AsyncOperationKind, internalId: string): string {
	return `${workspaceId}:${kind}:${internalId}`;
}

function readAsyncOperationL1(key: string): AsyncOperationRecord | null | undefined {
	const entry = asyncOperationL1.get(key);
	if (!entry) return undefined;
	if (entry.expiresAtMs <= Date.now()) {
		asyncOperationL1.delete(key);
		return undefined;
	}
	return entry.value;
}

function writeAsyncOperationL1(key: string, value: AsyncOperationRecord | null, ttlMs = ASYNC_OPERATION_L1_TTL_MS): void {
	if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
	asyncOperationL1.set(key, {
		value,
		expiresAtMs: Date.now() + ttlMs,
	});
}

function currentAsyncOperationEpoch(key: string): number {
	return asyncOperationEpoch.get(key) ?? 0;
}

function invalidateAsyncOperationCache(workspaceId: string, kind: AsyncOperationKind, internalId: string): void {
	const key = asyncOperationCacheKey(workspaceId, kind, internalId);
	asyncOperationL1.delete(key);
	asyncOperationInflight.delete(key);
	asyncOperationEpoch.set(key, currentAsyncOperationEpoch(key) + 1);
}

export function __resetAsyncOperationCachesForTests(): void {
	asyncOperationL1.clear();
	asyncOperationInflight.clear();
	asyncOperationEpoch.clear();
}

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
	const text = normalizeText(value);
	if (!text) return null;
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
		? text
		: null;
}

function normalizeMeta(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, unknown>;
}

function mapRow(row: AsyncOperationRow): AsyncOperationRecord {
	return {
		workspaceId: row.workspace_id,
		kind: row.kind,
		internalId: row.internal_id,
		requestId: row.request_id ?? null,
		sessionId: row.session_id ?? null,
		appId: row.app_id ?? null,
		provider: row.provider,
		nativeId: row.native_id,
		model: row.model,
		status: row.status,
		meta: normalizeMeta(row.meta),
		billedAt: row.billed_at,
		nextReconcileAt: row.next_reconcile_at,
		reconcileAttempts: typeof row.reconcile_attempts === "number" ? row.reconcile_attempts : 0,
		reconcileLockedAt: row.reconcile_locked_at,
		reconcileLockedBy: row.reconcile_locked_by,
		lastReconcileError: row.last_reconcile_error,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const ASYNC_OPERATION_SELECT_COLUMNS =
	"workspace_id,kind,internal_id,request_id,session_id,app_id,provider,native_id,model,status,meta,billed_at,next_reconcile_at,reconcile_attempts,reconcile_locked_at,reconcile_locked_by,last_reconcile_error,created_at,updated_at";

export async function upsertAsyncOperation(args: {
	workspaceId: string;
	kind: AsyncOperationKind;
	internalId: string;
	requestId?: string | null;
	sessionId?: string | null;
	appId?: string | null;
	provider?: string | null;
	nativeId?: string | null;
	model?: string | null;
	status?: string | null;
	meta?: Record<string, unknown> | null;
	nextReconcileAt?: string | null;
}): Promise<void> {
	const workspaceId = normalizeText(args.workspaceId);
	const internalId = normalizeText(args.internalId);
	if (!workspaceId || !internalId) return;

	const now = new Date().toISOString();
	const payload = {
		workspace_id: workspaceId,
		kind: args.kind,
		internal_id: internalId,
		request_id: normalizeText(args.requestId) ?? null,
		session_id: normalizeText(args.sessionId) ?? null,
		app_id: normalizeUuid(args.appId) ?? null,
		provider: normalizeText(args.provider) ?? null,
		native_id: normalizeText(args.nativeId) ?? null,
		model: normalizeText(args.model) ?? null,
		status: normalizeText(args.status) ?? null,
		meta: normalizeMeta(args.meta),
		updated_at: now,
	} as Record<string, unknown>;
	if (Object.prototype.hasOwnProperty.call(args, "nextReconcileAt")) {
		payload.next_reconcile_at = normalizeText(args.nextReconcileAt) ?? null;
	}

	const { error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.upsert(payload, { onConflict: "workspace_id,kind,internal_id" });
	if (error) throw error;
	invalidateAsyncOperationCache(workspaceId, args.kind, internalId);
}

export async function listAsyncOperations(args: {
	kind: AsyncOperationKind;
	limit?: number;
	offset?: number;
	providers?: string[];
	statuses?: Array<string | null>;
	unbilledOnly?: boolean;
}): Promise<AsyncOperationRecord[]> {
	const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(500, Math.trunc(args.limit!))) : 100;
	const offset = Number.isFinite(args.offset) ? Math.max(0, Math.trunc(args.offset!)) : 0;
	let query = getSupabaseAdmin()
		.from("gateway_async_operations")
		.select(
			ASYNC_OPERATION_SELECT_COLUMNS,
		)
		.eq("kind", args.kind)
		.order("updated_at", { ascending: true });

	query = offset > 0 ? query.range(offset, offset + limit - 1) : query.limit(limit);

	if (args.unbilledOnly) {
		query = query.is("billed_at", null);
	}
	if (args.providers && args.providers.length > 0) {
		const providers = args.providers
			.map((value) => normalizeText(value))
			.filter((value): value is string => Boolean(value));
		if (providers.length > 0) {
			query = query.in("provider", providers);
		}
	}
	if (args.statuses && args.statuses.length > 0) {
		const includeNullStatus = args.statuses.some((value) => value == null);
		const statuses = args.statuses
			.map((value) => normalizeText(value))
			.filter((value): value is string => Boolean(value));
		if (includeNullStatus && statuses.length > 0) {
			query = query.or(
				`status.is.null,status.in.(${statuses.map((value) => `"${value}"`).join(",")})`,
			);
		} else if (includeNullStatus) {
			query = query.is("status", null);
		} else if (statuses.length > 0) {
			query = query.in("status", statuses);
		}
	}

	const { data, error } = await query;
	if (error) throw error;
	return (data ?? []).map((row) => mapRow(row as AsyncOperationRow));
}

async function callWebhookDeliveryRpc(name: string, args: {
	workspaceId: string;
	kind: AsyncOperationKind;
	internalId: string;
	deliveryKey: string;
	claimToken: string;
	staleAfterSeconds?: number;
}): Promise<boolean> {
	const params: Record<string, unknown> = {
		p_workspace_id: args.workspaceId,
		p_kind: args.kind,
		p_internal_id: args.internalId,
		p_delivery_key: args.deliveryKey,
		p_claim_token: args.claimToken,
	};
	if (args.staleAfterSeconds != null) params.p_stale_after_seconds = args.staleAfterSeconds;
	const result = await getSupabaseAdmin().rpc(name, params);
	if (result.error) throw result.error;
	return result.data === true;
}

export function claimAsyncWebhookDelivery(args: {
	workspaceId: string;
	kind: AsyncOperationKind;
	internalId: string;
	deliveryKey: string;
	claimToken: string;
	staleAfterSeconds?: number;
}): Promise<boolean> {
	return callWebhookDeliveryRpc("claim_gateway_async_webhook_delivery", args);
}

export function completeAsyncWebhookDelivery(args: {
	workspaceId: string;
	kind: AsyncOperationKind;
	internalId: string;
	deliveryKey: string;
	claimToken: string;
}): Promise<boolean> {
	return callWebhookDeliveryRpc("complete_gateway_async_webhook_delivery", args);
}

export function releaseAsyncWebhookDeliveryClaim(args: {
	workspaceId: string;
	kind: AsyncOperationKind;
	internalId: string;
	deliveryKey: string;
	claimToken: string;
}): Promise<boolean> {
	return callWebhookDeliveryRpc("release_gateway_async_webhook_delivery_claim", args);
}

export async function claimAsyncOperationsForReconciliation(args: {
	kind: AsyncOperationKind;
	limit?: number;
	statuses?: Array<string | null>;
	workerId?: string;
	leaseSeconds?: number;
	shardCount?: number;
	shardIndex?: number;
}): Promise<AsyncOperationRecord[]> {
	const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(2_000, Math.trunc(args.limit!))) : 100;
	const leaseSeconds = Number.isFinite(args.leaseSeconds)
		? Math.max(30, Math.min(3_600, Math.trunc(args.leaseSeconds!)))
		: 120;
	const shardCount = Number.isFinite(args.shardCount)
		? Math.max(1, Math.min(256, Math.trunc(args.shardCount!)))
		: 1;
	const shardIndex = Number.isFinite(args.shardIndex)
		? Math.max(0, Math.min(shardCount - 1, Math.trunc(args.shardIndex!)))
		: 0;
	const statuses = args.statuses
		?.map((value) => normalizeText(value) ?? "")
		.filter((value, index, values) => values.indexOf(value) === index);

	const { data, error } = await getSupabaseAdmin().rpc("claim_gateway_async_operations_for_reconciliation", {
		p_kind: args.kind,
		p_limit: limit,
		p_statuses: statuses && statuses.length > 0 ? statuses : null,
		p_worker_id: normalizeText(args.workerId) ?? "gateway-reconciler",
		p_lease_seconds: leaseSeconds,
		p_shard_count: shardCount,
		p_shard_index: shardIndex,
	});
	if (error) throw error;
	return (data ?? []).map((row) => mapRow(row as AsyncOperationRow));
}

export async function updateAsyncOperationReconciliation(args: {
	workspaceId: string;
	kind: AsyncOperationKind;
	internalId: string;
	nextReconcileAt?: string | null;
	lastError?: string | null;
	clearLease?: boolean;
}): Promise<void> {
	const workspaceId = normalizeText(args.workspaceId);
	const internalId = normalizeText(args.internalId);
	if (!workspaceId || !internalId) return;

	const now = new Date().toISOString();
	const patch: Record<string, unknown> = {
		updated_at: now,
		last_reconcile_error: normalizeText(args.lastError) ?? null,
	};
	if (Object.prototype.hasOwnProperty.call(args, "nextReconcileAt")) {
		patch.next_reconcile_at = normalizeText(args.nextReconcileAt) ?? null;
	}
	if (args.clearLease !== false) {
		patch.reconcile_locked_at = null;
		patch.reconcile_locked_by = null;
	}

	const { error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.update(patch)
		.eq("workspace_id", workspaceId)
		.eq("kind", args.kind)
		.eq("internal_id", internalId);
	if (error) throw error;
	invalidateAsyncOperationCache(workspaceId, args.kind, internalId);
}

export async function listTeamAsyncOperations(args: {
	workspaceId: string;
	kind: AsyncOperationKind;
	limit?: number;
	statuses?: Array<string | null>;
}): Promise<AsyncOperationRecord[]> {
	const workspaceId = normalizeText(args.workspaceId);
	if (!workspaceId) return [];
	const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(500, Math.trunc(args.limit!))) : 100;

	let query = getSupabaseAdmin()
		.from("gateway_async_operations")
		.select(
			ASYNC_OPERATION_SELECT_COLUMNS,
		)
		.eq("workspace_id", workspaceId)
		.eq("kind", args.kind)
		.order("updated_at", { ascending: false })
		.limit(limit);

	if (args.statuses && args.statuses.length > 0) {
		const includeNullStatus = args.statuses.some((value) => value == null);
		const statuses = args.statuses
			.map((value) => normalizeText(value))
			.filter((value): value is string => Boolean(value));
		if (includeNullStatus && statuses.length > 0) {
			query = query.or(
				`status.is.null,status.in.(${statuses.map((value) => `"${value}"`).join(",")})`,
			);
		} else if (includeNullStatus) {
			query = query.is("status", null);
		} else if (statuses.length > 0) {
			query = query.in("status", statuses);
		}
	}

	const { data, error } = await query;
	if (error) throw error;
	return (data ?? []).map((row) => mapRow(row as AsyncOperationRow));
}

export async function getAsyncOperation(
	workspaceIdRaw: string,
	kind: AsyncOperationKind,
	internalIdRaw: string,
): Promise<AsyncOperationRecord | null> {
	const workspaceId = normalizeText(workspaceIdRaw);
	const internalId = normalizeText(internalIdRaw);
	if (!workspaceId || !internalId) return null;
	const cacheKey = asyncOperationCacheKey(workspaceId, kind, internalId);
	const cached = readAsyncOperationL1(cacheKey);
	if (cached !== undefined) return cached;

	const inflight = asyncOperationInflight.get(cacheKey);
	if (inflight) return inflight;

	const epoch = currentAsyncOperationEpoch(cacheKey);
	const loader = (async (): Promise<AsyncOperationRecord | null> => {
		const { data, error } = await getSupabaseAdmin()
			.from("gateway_async_operations")
			.select(
				ASYNC_OPERATION_SELECT_COLUMNS,
			)
			.eq("workspace_id", workspaceId)
			.eq("kind", kind)
			.eq("internal_id", internalId)
			.maybeSingle();
		if (error) throw error;
		const record = data ? mapRow(data as AsyncOperationRow) : null;
		if (currentAsyncOperationEpoch(cacheKey) === epoch) {
			writeAsyncOperationL1(cacheKey, record);
		}
		return record;
	})();

	asyncOperationInflight.set(cacheKey, loader);
	try {
		return await loader;
	} finally {
		if (asyncOperationInflight.get(cacheKey) === loader) {
			asyncOperationInflight.delete(cacheKey);
		}
	}
}

export async function findAsyncOperationByNativeId(
	kind: AsyncOperationKind,
	providerRaw: string,
	nativeIdRaw: string,
): Promise<AsyncOperationRecord | null> {
	const provider = normalizeText(providerRaw);
	const nativeId = normalizeText(nativeIdRaw);
	if (!provider || !nativeId) return null;

	const { data, error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.select(
			ASYNC_OPERATION_SELECT_COLUMNS,
		)
		.eq("kind", kind)
		.eq("provider", provider)
		.eq("native_id", nativeId)
		.order("created_at", { ascending: false })
		.limit(2);
	if (error) throw error;
	const rows = Array.isArray(data) ? data : [];
	if (rows.length > 1) {
		console.error("async_operation_native_id_ambiguous", {
			kind,
			provider,
			nativeId,
			matchCount: rows.length,
		});
		return null;
	}
	const row = rows[0] ?? null;
	if (!row) return null;
	return mapRow(row as AsyncOperationRow);
}

export async function isAsyncOperationBilled(
	workspaceIdRaw: string,
	kind: AsyncOperationKind,
	internalIdRaw: string,
): Promise<boolean> {
	const workspaceId = normalizeText(workspaceIdRaw);
	const internalId = normalizeText(internalIdRaw);
	if (!workspaceId || !internalId) return false;

	const { data, error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.select("billed_at")
		.eq("workspace_id", workspaceId)
		.eq("kind", kind)
		.eq("internal_id", internalId)
		.maybeSingle();
	if (error) throw error;
	return Boolean((data as { billed_at?: string | null } | null)?.billed_at);
}

export async function markAsyncOperationBilled(
	workspaceIdRaw: string,
	kind: AsyncOperationKind,
	internalIdRaw: string,
): Promise<boolean> {
	const workspaceId = normalizeText(workspaceIdRaw);
	const internalId = normalizeText(internalIdRaw);
	if (!workspaceId || !internalId) return false;

	const now = new Date().toISOString();
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.update({
			billed_at: now,
			updated_at: now,
			next_reconcile_at: null,
			reconcile_locked_at: null,
			reconcile_locked_by: null,
			last_reconcile_error: null,
		})
		.eq("workspace_id", workspaceId)
		.eq("kind", kind)
		.eq("internal_id", internalId)
		.is("billed_at", null)
		.select("internal_id")
		.maybeSingle();
	if (error) throw error;
	if (data) invalidateAsyncOperationCache(workspaceId, kind, internalId);
	return Boolean(data);
}

export async function setAsyncOperationStatus(args: {
	workspaceId: string;
	kind: AsyncOperationKind;
	internalId: string;
	status: string;
	metaPatch?: Record<string, unknown>;
	nextReconcileAt?: string | null;
}): Promise<void> {
	const workspaceId = normalizeText(args.workspaceId);
	const internalId = normalizeText(args.internalId);
	const status = normalizeText(args.status);
	if (!workspaceId || !internalId || !status) return;

	const now = new Date().toISOString();
	const patch: Record<string, unknown> = {
		status,
		updated_at: now,
	};
	if (Object.prototype.hasOwnProperty.call(args, "nextReconcileAt")) {
		patch.next_reconcile_at = normalizeText(args.nextReconcileAt) ?? null;
	}

	if (args.metaPatch && typeof args.metaPatch === "object" && !Array.isArray(args.metaPatch)) {
		const { data: existing, error: readError } = await getSupabaseAdmin()
			.from("gateway_async_operations")
			.select("meta")
			.eq("workspace_id", workspaceId)
			.eq("kind", args.kind)
			.eq("internal_id", internalId)
			.maybeSingle();
		if (readError) throw readError;
		const currentMeta = normalizeMeta((existing as { meta?: unknown } | null)?.meta);
		patch.meta = {
			...currentMeta,
			...args.metaPatch,
		};
	}

	const { error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.update(patch)
		.eq("workspace_id", workspaceId)
		.eq("kind", args.kind)
		.eq("internal_id", internalId);
	if (error) throw error;
	invalidateAsyncOperationCache(workspaceId, args.kind, internalId);
}

export async function patchAsyncOperationMeta(args: {
	workspaceId: string;
	kind: AsyncOperationKind;
	internalId: string;
	metaPatch: Record<string, unknown>;
}): Promise<void> {
	const workspaceId = normalizeText(args.workspaceId);
	const internalId = normalizeText(args.internalId);
	if (!workspaceId || !internalId) return;
	if (!args.metaPatch || typeof args.metaPatch !== "object" || Array.isArray(args.metaPatch)) return;

	const { data: existing, error: readError } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.select("meta")
		.eq("workspace_id", workspaceId)
		.eq("kind", args.kind)
		.eq("internal_id", internalId)
		.maybeSingle();
	if (readError) throw readError;

	const now = new Date().toISOString();
	const currentMeta = normalizeMeta((existing as { meta?: unknown } | null)?.meta);
	const mergedMeta = {
		...currentMeta,
		...args.metaPatch,
	};

	const { error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.update({
			meta: mergedMeta,
			updated_at: now,
		})
		.eq("workspace_id", workspaceId)
		.eq("kind", args.kind)
		.eq("internal_id", internalId);
	if (error) throw error;
	invalidateAsyncOperationCache(workspaceId, args.kind, internalId);
}

