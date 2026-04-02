// Purpose: Persist async operation ownership and billing metadata.
// Why: Long-running jobs (video/batch) need team-scoped lookup across requests.
// How: Store operation records in Supabase with team+kind+internalId identity.

import { getSupabaseAdmin } from "@/runtime/env";

export type AsyncOperationKind = "video" | "batch" | "music";

export type AsyncOperationRecord = {
	teamId: string;
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
	createdAt: string | null;
	updatedAt: string | null;
};

type AsyncOperationRow = {
	team_id: string;
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
	created_at: string | null;
	updated_at: string | null;
};

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
		teamId: row.team_id,
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
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function upsertAsyncOperation(args: {
	teamId: string;
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
}): Promise<void> {
	const teamId = normalizeText(args.teamId);
	const internalId = normalizeText(args.internalId);
	if (!teamId || !internalId) return;

	const now = new Date().toISOString();
	const payload = {
		team_id: teamId,
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
	};

	const { error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.upsert(payload, { onConflict: "team_id,kind,internal_id" });
	if (error) throw error;
}

export async function listAsyncOperations(args: {
	kind: AsyncOperationKind;
	limit?: number;
	providers?: string[];
	statuses?: string[];
	unbilledOnly?: boolean;
}): Promise<AsyncOperationRecord[]> {
	const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(500, Math.trunc(args.limit!))) : 100;
	let query = getSupabaseAdmin()
		.from("gateway_async_operations")
		.select(
			"team_id,kind,internal_id,request_id,session_id,app_id,provider,native_id,model,status,meta,billed_at,created_at,updated_at",
		)
		.eq("kind", args.kind)
		.order("updated_at", { ascending: true })
		.limit(limit);

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
		const statuses = args.statuses
			.map((value) => normalizeText(value))
			.filter((value): value is string => Boolean(value));
		if (statuses.length > 0) {
			query = query.in("status", statuses);
		}
	}

	const { data, error } = await query;
	if (error) throw error;
	return (data ?? []).map((row) => mapRow(row as AsyncOperationRow));
}

export async function listTeamAsyncOperations(args: {
	teamId: string;
	kind: AsyncOperationKind;
	limit?: number;
	statuses?: string[];
}): Promise<AsyncOperationRecord[]> {
	const teamId = normalizeText(args.teamId);
	if (!teamId) return [];
	const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(500, Math.trunc(args.limit!))) : 100;

	let query = getSupabaseAdmin()
		.from("gateway_async_operations")
		.select(
			"team_id,kind,internal_id,request_id,session_id,app_id,provider,native_id,model,status,meta,billed_at,created_at,updated_at",
		)
		.eq("team_id", teamId)
		.eq("kind", args.kind)
		.order("updated_at", { ascending: false })
		.limit(limit);

	if (args.statuses && args.statuses.length > 0) {
		const statuses = args.statuses
			.map((value) => normalizeText(value))
			.filter((value): value is string => Boolean(value));
		if (statuses.length > 0) {
			query = query.in("status", statuses);
		}
	}

	const { data, error } = await query;
	if (error) throw error;
	return (data ?? []).map((row) => mapRow(row as AsyncOperationRow));
}

export async function getAsyncOperation(
	teamIdRaw: string,
	kind: AsyncOperationKind,
	internalIdRaw: string,
): Promise<AsyncOperationRecord | null> {
	const teamId = normalizeText(teamIdRaw);
	const internalId = normalizeText(internalIdRaw);
	if (!teamId || !internalId) return null;

	const { data, error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.select(
			"team_id,kind,internal_id,request_id,session_id,app_id,provider,native_id,model,status,meta,billed_at,created_at,updated_at",
		)
		.eq("team_id", teamId)
		.eq("kind", kind)
		.eq("internal_id", internalId)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;
	return mapRow(data as AsyncOperationRow);
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
			"team_id,kind,internal_id,request_id,session_id,app_id,provider,native_id,model,status,meta,billed_at,created_at,updated_at",
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
	teamIdRaw: string,
	kind: AsyncOperationKind,
	internalIdRaw: string,
): Promise<boolean> {
	const teamId = normalizeText(teamIdRaw);
	const internalId = normalizeText(internalIdRaw);
	if (!teamId || !internalId) return false;

	const { data, error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.select("billed_at")
		.eq("team_id", teamId)
		.eq("kind", kind)
		.eq("internal_id", internalId)
		.maybeSingle();
	if (error) throw error;
	return Boolean((data as { billed_at?: string | null } | null)?.billed_at);
}

export async function markAsyncOperationBilled(
	teamIdRaw: string,
	kind: AsyncOperationKind,
	internalIdRaw: string,
): Promise<boolean> {
	const teamId = normalizeText(teamIdRaw);
	const internalId = normalizeText(internalIdRaw);
	if (!teamId || !internalId) return false;

	const now = new Date().toISOString();
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.update({ billed_at: now, updated_at: now })
		.eq("team_id", teamId)
		.eq("kind", kind)
		.eq("internal_id", internalId)
		.is("billed_at", null)
		.select("internal_id")
		.maybeSingle();
	if (error) throw error;
	return Boolean(data);
}

export async function setAsyncOperationStatus(args: {
	teamId: string;
	kind: AsyncOperationKind;
	internalId: string;
	status: string;
	metaPatch?: Record<string, unknown>;
}): Promise<void> {
	const teamId = normalizeText(args.teamId);
	const internalId = normalizeText(args.internalId);
	const status = normalizeText(args.status);
	if (!teamId || !internalId || !status) return;

	const now = new Date().toISOString();
	const patch: Record<string, unknown> = {
		status,
		updated_at: now,
	};

	if (args.metaPatch && typeof args.metaPatch === "object" && !Array.isArray(args.metaPatch)) {
		const { data: existing, error: readError } = await getSupabaseAdmin()
			.from("gateway_async_operations")
			.select("meta")
			.eq("team_id", teamId)
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
		.eq("team_id", teamId)
		.eq("kind", args.kind)
		.eq("internal_id", internalId);
	if (error) throw error;
}

export async function patchAsyncOperationMeta(args: {
	teamId: string;
	kind: AsyncOperationKind;
	internalId: string;
	metaPatch: Record<string, unknown>;
}): Promise<void> {
	const teamId = normalizeText(args.teamId);
	const internalId = normalizeText(args.internalId);
	if (!teamId || !internalId) return;
	if (!args.metaPatch || typeof args.metaPatch !== "object" || Array.isArray(args.metaPatch)) return;

	const { data: existing, error: readError } = await getSupabaseAdmin()
		.from("gateway_async_operations")
		.select("meta")
		.eq("team_id", teamId)
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
		.eq("team_id", teamId)
		.eq("kind", args.kind)
		.eq("internal_id", internalId);
	if (error) throw error;
}

