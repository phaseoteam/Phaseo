import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, any>;

/** Keep the existing price envelope while sourcing every value from offers. */
export function subscriptionPayload(row: Row, modelSlug?: string): Row {
	const offers: Row[] = row.offers ?? [];
	const prices = offers.map((offer) => {
		const components: Row[] = offer.components ?? [];
		const base = components.find((component) => component.component_key === "base") ?? components[0];
		const pricingType = base?.pricing_type ?? "unknown";
		const frequency = pricingType === "custom" ? "custom" : pricingType === "usage_based" ? "usage" :
			offer.billing_interval === "month" && offer.billing_interval_count === 3 ? "quarterly" :
			({ day: "daily", week: "weekly", month: "monthly", year: "yearly" } as Record<string, string>)[offer.billing_interval] ?? "unknown";
		return { plan_uuid: row.plan_uuid, offer_uuid: offer.offer_uuid, price: base?.amount ?? null,
			currency: offer.currency, frequency, pricing_type: pricingType, charge_basis: base?.charge_basis,
			billing_interval: offer.billing_interval, billing_interval_count: offer.billing_interval_count,
			components, minimum_seats: offer.minimum_seats, region_code: offer.region_code, tax_treatment: offer.tax_treatment };
	});
	const model = (row.models ?? []).find((entry: Row) => entry.model_id === modelSlug);
	return { ...row, prices, ...(modelSlug ? { model_info: model ? {
		model_info: model.model_info, rate_limit: model.rate_limit, other_info: model.other_info,
		access_mode: model.access_mode, access_channel: model.access_channel, mapping_status: model.mapping_status,
		conditions: model.conditions,
	} : null } : {}) };
}

export async function fetchSubscriptionCatalogue(client: SupabaseClient, planId?: string, modelSlug?: string, includeHidden = false) {
	const { data, error } = await client.rpc("get_v2_subscription_catalogue", {
		p_plan_id: planId ?? null, p_model_slug: modelSlug ?? null, p_include_hidden: includeHidden,
	});
	if (error) throw error;
	if (!Array.isArray(data)) throw new Error("Invalid subscription catalogue payload");
	return data.map((row) => subscriptionPayload(row, modelSlug));
}

/**
 * The plans that include any of these models, in the catalogue's own order.
 * The whole catalogue is about 1 MB, so read each model's plans instead.
 */
export async function fetchSubscriptionPlansForModels(client: SupabaseClient, modelSlugs: string[]) {
	const lists = await Promise.all(modelSlugs.map((modelSlug) => fetchSubscriptionCatalogue(client, undefined, modelSlug)));
	return mergeOrderedPlanLists(lists);
}

/**
 * Merges plan lists that are each in the catalogue's order into one list,
 * without duplicates, that keeps every input list's order. Callers read one
 * model's plans at a time, so each model still sees its plans in order.
 */
export function mergeOrderedPlanLists(lists: Row[][]): Row[] {
	const rows = new Map<string, Row>();
	const next = new Map<string, Set<string>>();
	const waitingOn = new Map<string, number>();
	for (const list of lists) {
		list.forEach((row, index) => {
			const key = String(row.plan_uuid);
			if (!rows.has(key)) {
				rows.set(key, row);
				next.set(key, new Set());
				waitingOn.set(key, 0);
			}
			if (index === 0) return;
			const previous = String(list[index - 1].plan_uuid);
			const followers = next.get(previous)!;
			if (previous === key || followers.has(key)) return;
			followers.add(key);
			waitingOn.set(key, waitingOn.get(key)! + 1);
		});
	}
	const ready = [...rows.keys()].filter((key) => waitingOn.get(key) === 0);
	const merged: Row[] = [];
	while (ready.length) {
		const key = ready.shift()!;
		merged.push(rows.get(key)!);
		for (const follower of next.get(key)!) {
			const remaining = waitingOn.get(follower)! - 1;
			waitingOn.set(follower, remaining);
			if (remaining === 0) ready.push(follower);
		}
	}
	return merged;
}
