"use server";

import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type ProviderRoutingPairHealth = {
	model: string;
	endpoint: string;
	last_seen_at: string | null;
	breaker: "closed" | "open" | "half_open";
	breaker_until_ms: number;
	seconds_until_reopen: number;
	err_ewma_60s: number | null;
	lat_ewma_60s: number | null;
	tp_ewma_60s: number | null;
	current_load: number | null;
};

export type ProviderRoutingHealth = {
	ok: true;
	provider: string;
	now_ms: number;
	window_hours: number;
	deranked: boolean;
	recovering: boolean;
	open_count: number;
	half_open_count: number;
	checked_pairs: number;
	pairs: ProviderRoutingPairHealth[];
};

type RoutingHealthRow = {
	provider_id: string;
	model_id: string;
	endpoint: string;
	breaker_state: "closed" | "open" | "half_open";
	is_deranked: boolean;
	open_until_ms: number | null;
	last_transition_at: string | null;
	updated_at: string | null;
};

export async function getProviderRoutingHealth(
	providerId: string,
	options?: { windowHours?: number; maxPairs?: number },
): Promise<ProviderRoutingHealth | null> {
	"use cache";

	cacheLife("minutes");
	cacheTag("data:gateway_provider_health_states");

	if (!providerId) return null;
	const windowHours = options?.windowHours ?? 24;
	const maxPairs = options?.maxPairs ?? 24;
	const nowMs = Date.now();
	const sinceIso = new Date(nowMs - windowHours * 60 * 60 * 1000).toISOString();
	const supabase = createAdminClient();

	try {
		const { data, error } = await supabase
			.from("gateway_provider_health_states")
			.select(
				"provider_id, model_id, endpoint, breaker_state, is_deranked, open_until_ms, last_transition_at, updated_at",
			)
			.eq("provider_id", providerId)
			.gte("updated_at", sinceIso)
			.order("updated_at", { ascending: false })
			.limit(Math.max(maxPairs, 1));

		if (error) {
			return null;
		}

		const rows = (data ?? []) as RoutingHealthRow[];
		const pairs: ProviderRoutingPairHealth[] = rows.map((row) => {
			const breakerUntilMs = Number(row.open_until_ms ?? 0);
			return {
				model: row.model_id,
				endpoint: row.endpoint,
				last_seen_at: row.last_transition_at ?? row.updated_at ?? null,
				breaker: row.breaker_state,
				breaker_until_ms: breakerUntilMs,
				seconds_until_reopen:
					row.breaker_state === "open" && breakerUntilMs > nowMs
						? Math.max(Math.ceil((breakerUntilMs - nowMs) / 1000), 0)
						: 0,
				err_ewma_60s: null,
				lat_ewma_60s: null,
				tp_ewma_60s: null,
				current_load: null,
			};
		});

		const deranked = pairs.some(
			(pair) =>
				pair.breaker === "open" &&
				(pair.breaker_until_ms ?? 0) > nowMs,
		);
		const recovering = !deranked && pairs.some((pair) => pair.breaker === "half_open");

		return {
			ok: true,
			provider: providerId,
			now_ms: nowMs,
			window_hours: windowHours,
			deranked,
			recovering,
			open_count: pairs.filter((pair) => pair.breaker === "open").length,
			half_open_count: pairs.filter((pair) => pair.breaker === "half_open").length,
			checked_pairs: pairs.length,
			pairs,
		};
	} catch {
		return null;
	}
}
