// Purpose: Persist async operation ownership and billing metadata.
// Why: Long-running jobs (video/batch) need team-scoped lookup across requests.
// How: Store operation records in Supabase with team+kind+internalId identity.

import { getSupabaseAdmin } from "@/runtime/env";

export type AsyncOperationKind = "video" | "batch" | "music";

export type AsyncOperationRecord = {
	teamId: string;
	kind: AsyncOperationKind;
	internalId: string;
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

function normalizeMeta(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, unknown>;
}

function mapRow(row: AsyncOperationRow): AsyncOperationRecord {
	return {
		teamId: row.team_id,
		kind: row.kind,
		internalId: row.internal_id,
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
			"team_id,kind,internal_id,provider,native_id,model,status,meta,billed_at,created_at,updated_at",
		)
		.eq("team_id", teamId)
		.eq("kind", kind)
		.eq("internal_id", internalId)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;
	return mapRow(data as AsyncOperationRow);
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
