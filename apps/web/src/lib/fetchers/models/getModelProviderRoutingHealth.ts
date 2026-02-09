import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type ProviderRoutingStatus = {
	providerId: string;
	deranked: boolean;
	recovering: boolean;
	openCount: number;
	halfOpenCount: number;
	checkedPairs: number;
};

export type ProviderRoutingStatusMap = Record<string, ProviderRoutingStatus>;

type RoutingHealthRow = {
	provider_id: string;
	breaker_state: "closed" | "open" | "half_open";
	is_deranked: boolean;
	open_until_ms: number | null;
	updated_at: string | null;
};

const WINDOW_HOURS = 24;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

export async function getModelProviderRoutingHealth(args: {
	providerIds: string[];
	windowHours?: number;
}): Promise<ProviderRoutingStatusMap> {
	const providerIds = Array.from(new Set(args.providerIds.filter(Boolean))).sort((a, b) =>
		a.localeCompare(b)
	);
	if (!providerIds.length) return {};

	const windowHours = Math.max(1, Math.floor(args.windowHours ?? WINDOW_HOURS));
	const nowMs = Date.now();
	const sinceIso = new Date(nowMs - windowHours * 60 * 60 * 1000).toISOString();
	const supabase = createAdminClient();

	const rows: RoutingHealthRow[] = [];
	try {
		for (let page = 0; page < MAX_PAGES; page++) {
			const from = page * PAGE_SIZE;
			const to = from + PAGE_SIZE - 1;
			const { data, error } = await supabase
				.from("gateway_provider_health_states")
				.select(
					"provider_id, breaker_state, is_deranked, open_until_ms, updated_at"
				)
				.in("provider_id", providerIds)
				.gte("updated_at", sinceIso)
				.order("updated_at", { ascending: false })
				.range(from, to);

			if (error) {
				throw new Error(
					error.message ?? "Failed to load provider routing health states"
				);
			}

			if (!data?.length) break;
			rows.push(...(data as RoutingHealthRow[]));
			if (data.length < PAGE_SIZE) break;
		}
	} catch (error) {
		console.warn("Failed to fetch model provider routing health", {
			providerCount: providerIds.length,
			error,
		});
		return {};
	}

	const byProvider = new Map<string, RoutingHealthRow[]>();
	for (const providerId of providerIds) byProvider.set(providerId, []);
	for (const row of rows) {
		if (!row.provider_id) continue;
		const list = byProvider.get(row.provider_id);
		if (!list) continue;
		list.push(row);
	}

	const out: ProviderRoutingStatusMap = {};
	for (const providerId of providerIds) {
		const providerRows = byProvider.get(providerId) ?? [];
		const openCount = providerRows.filter((row) => row.breaker_state === "open").length;
		const halfOpenCount = providerRows.filter(
			(row) => row.breaker_state === "half_open"
		).length;
		const deranked = providerRows.some(
			(row) =>
				row.is_deranked ||
				(row.breaker_state === "open" && Number(row.open_until_ms ?? 0) > nowMs)
		);
		const recovering = !deranked && halfOpenCount > 0;

		out[providerId] = {
			providerId,
			deranked,
			recovering,
			openCount,
			halfOpenCount: halfOpenCount,
			checkedPairs: providerRows.length,
		};
	}

	return out;
}

export async function getModelProviderRoutingHealthCached(args: {
	providerIds: string[];
	windowHours?: number;
}): Promise<ProviderRoutingStatusMap> {
	"use cache";

	cacheLife("minutes");
	cacheTag("data:gateway_provider_health_states");

	return getModelProviderRoutingHealth(args);
}
