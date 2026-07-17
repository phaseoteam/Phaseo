// Purpose: Persist provider webhook events for idempotency and auditability.
// Why: Provider webhooks may be delivered multiple times and retried.
// How: Writes one row per provider event id and marks processing completion.

import { getSupabaseAdmin } from "@/runtime/env";

export type ProviderEventRecord = {
	id: string;
	provider: string;
	providerEventId: string;
	kind: string | null;
	workspaceId: string | null;
	internalId: string | null;
	payload: Record<string, unknown>;
	processedAt: string | null;
	attemptCount: number;
	nextAttemptAt: string | null;
	createdAt: string | null;
};

type ProviderEventRow = {
	id: string;
	provider: string;
	provider_event_id: string;
	kind: string | null;
	workspace_id: string | null;
	internal_id: string | null;
	payload: Record<string, unknown> | null;
	processed_at: string | null;
	attempt_count?: number | null;
	next_attempt_at?: string | null;
	created_at: string | null;
};

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function mapRow(row: ProviderEventRow): ProviderEventRecord {
	return {
		id: row.id,
		provider: row.provider,
		providerEventId: row.provider_event_id,
		kind: row.kind,
		workspaceId: row.workspace_id,
		internalId: row.internal_id,
		payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {},
		processedAt: row.processed_at,
		attemptCount: Math.max(0, Number(row.attempt_count ?? 0) || 0),
		nextAttemptAt: row.next_attempt_at ?? null,
		createdAt: row.created_at,
	};
}

export async function insertProviderEvent(args: {
	provider: string;
	providerEventId: string;
	kind?: string | null;
	workspaceId?: string | null;
	internalId?: string | null;
	payload?: Record<string, unknown> | null;
	headers?: Record<string, string> | null;
}): Promise<{ inserted: boolean; record: ProviderEventRecord | null }> {
	const provider = normalizeText(args.provider);
	const providerEventId = normalizeText(args.providerEventId);
	if (!provider || !providerEventId) {
		return { inserted: false, record: null };
	}

	const now = new Date().toISOString();
	const payload = {
		provider,
		provider_event_id: providerEventId,
		kind: normalizeText(args.kind),
		workspace_id: normalizeText(args.workspaceId),
		internal_id: normalizeText(args.internalId),
		payload: args.payload ?? {},
		headers: args.headers ?? {},
		updated_at: now,
	};

	const { data, error } = await getSupabaseAdmin()
		.from("gateway_provider_events")
		.insert(payload)
		.select("id,provider,provider_event_id,kind,workspace_id,internal_id,payload,processed_at,attempt_count,next_attempt_at,created_at")
		.maybeSingle();

	if (!error) {
		return {
			inserted: true,
			record: data ? mapRow(data as ProviderEventRow) : null,
		};
	}

	// unique_violation means this event was already accepted and should be treated as deduped.
	if (String((error as any)?.code ?? "") === "23505") {
		const existing = await getProviderEvent(provider, providerEventId);
		return { inserted: false, record: existing };
	}

	throw error;
}

export async function getProviderEvent(
	providerRaw: string,
	providerEventIdRaw: string,
): Promise<ProviderEventRecord | null> {
	const provider = normalizeText(providerRaw);
	const providerEventId = normalizeText(providerEventIdRaw);
	if (!provider || !providerEventId) return null;

	const { data, error } = await getSupabaseAdmin()
		.from("gateway_provider_events")
		.select("id,provider,provider_event_id,kind,workspace_id,internal_id,payload,processed_at,attempt_count,next_attempt_at,created_at")
		.eq("provider", provider)
		.eq("provider_event_id", providerEventId)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;
	return mapRow(data as ProviderEventRow);
}

export async function listUnprocessedProviderEvents(args: {
	providers: string[];
	limit?: number;
	workerId?: string;
	leaseSeconds?: number;
}): Promise<ProviderEventRecord[]> {
	const providers = [...new Set(args.providers.map((provider) => normalizeText(provider)).filter((provider): provider is string => Boolean(provider)))];
	if (providers.length === 0) return [];
	const limit = Math.max(1, Math.min(500, Math.trunc(args.limit ?? 100)));
	const { data, error } = await getSupabaseAdmin().rpc("gateway_claim_provider_events", {
		p_providers: providers,
		p_limit: limit,
		p_worker_id: normalizeText(args.workerId) ?? "batch-provider-event-replay",
		p_lease_seconds: Math.max(30, Math.min(3_600, Math.trunc(args.leaseSeconds ?? 120))),
	});
	if (error) throw error;
	return (data ?? []).map((row) => mapRow(row as ProviderEventRow));
}

export async function deferProviderEvent(args: {
	provider: string;
	providerEventId: string;
	reason: string;
}): Promise<void> {
	const provider = normalizeText(args.provider);
	const providerEventId = normalizeText(args.providerEventId);
	if (!provider || !providerEventId) return;
	const { error } = await getSupabaseAdmin().rpc("gateway_defer_provider_event", {
		p_provider: provider,
		p_provider_event_id: providerEventId,
		p_reason: normalizeText(args.reason) ?? "provider_event_deferred",
	});
	if (error) throw error;
}

export async function markProviderEventProcessed(args: {
	provider: string;
	providerEventId: string;
	workspaceId?: string | null;
	internalId?: string | null;
}): Promise<void> {
	const provider = normalizeText(args.provider);
	const providerEventId = normalizeText(args.providerEventId);
	if (!provider || !providerEventId) return;

	const now = new Date().toISOString();
	const patch: Record<string, unknown> = {
		processed_at: now,
		replay_locked_at: null,
		replay_locked_by: null,
		updated_at: now,
	};
	const workspaceId = normalizeText(args.workspaceId);
	const internalId = normalizeText(args.internalId);
	if (workspaceId) patch.workspace_id = workspaceId;
	if (internalId) patch.internal_id = internalId;

	const { error } = await getSupabaseAdmin()
		.from("gateway_provider_events")
		.update(patch)
		.eq("provider", provider)
		.eq("provider_event_id", providerEventId);
	if (error) throw error;
}
