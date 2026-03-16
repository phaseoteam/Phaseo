// Purpose: Persist provider webhook events for idempotency and auditability.
// Why: Provider webhooks may be delivered multiple times and retried.
// How: Writes one row per provider event id and marks processing completion.

import { getSupabaseAdmin } from "@/runtime/env";

export type ProviderEventRecord = {
	id: string;
	provider: string;
	providerEventId: string;
	kind: string | null;
	teamId: string | null;
	internalId: string | null;
	processedAt: string | null;
	createdAt: string | null;
};

type ProviderEventRow = {
	id: string;
	provider: string;
	provider_event_id: string;
	kind: string | null;
	team_id: string | null;
	internal_id: string | null;
	processed_at: string | null;
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
		teamId: row.team_id,
		internalId: row.internal_id,
		processedAt: row.processed_at,
		createdAt: row.created_at,
	};
}

export async function insertProviderEvent(args: {
	provider: string;
	providerEventId: string;
	kind?: string | null;
	teamId?: string | null;
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
		team_id: normalizeText(args.teamId),
		internal_id: normalizeText(args.internalId),
		payload: args.payload ?? {},
		headers: args.headers ?? {},
		updated_at: now,
	};

	const { data, error } = await getSupabaseAdmin()
		.from("gateway_provider_events")
		.insert(payload)
		.select("id,provider,provider_event_id,kind,team_id,internal_id,processed_at,created_at")
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
		.select("id,provider,provider_event_id,kind,team_id,internal_id,processed_at,created_at")
		.eq("provider", provider)
		.eq("provider_event_id", providerEventId)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;
	return mapRow(data as ProviderEventRow);
}

export async function markProviderEventProcessed(args: {
	provider: string;
	providerEventId: string;
	teamId?: string | null;
	internalId?: string | null;
}): Promise<void> {
	const provider = normalizeText(args.provider);
	const providerEventId = normalizeText(args.providerEventId);
	if (!provider || !providerEventId) return;

	const now = new Date().toISOString();
	const patch: Record<string, unknown> = {
		processed_at: now,
		updated_at: now,
	};
	const teamId = normalizeText(args.teamId);
	const internalId = normalizeText(args.internalId);
	if (teamId) patch.team_id = teamId;
	if (internalId) patch.internal_id = internalId;

	const { error } = await getSupabaseAdmin()
		.from("gateway_provider_events")
		.update(patch)
		.eq("provider", provider)
		.eq("provider_event_id", providerEventId);
	if (error) throw error;
}
